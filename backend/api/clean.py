"""Executor cleanup — pindahkan isi zona whitelist ke ~/.Trash (undo-able).

Batch 2 cleaner: EKSEKUSI NYATA, tapi default-nya tidak pernah permanen —
setiap entri di-rename ke `~/.Trash/qd-clean-<timestamp>/<zone_id>/`, sehingga
user bisa mengembalikannya lewat Finder → Trash. Tanpa `rm` di jalur normal
(rename atomik, satu filesystem) dan tanpa osascript (tanpa prompt Automation
macOS). CATATAN jujur: bila rename gagal lintas-volume (errno EXDEV — jarang di
macOS karena Trash satu volume dengan home), fallback `shutil.move` menyalan
entri lalu MENGHAPUS sumbernya; jalur inilah satu-satunya yang menyentuh
penghapusan.

Prinsip safety:
- Hanya zona dari SAFE_ZONES (id dipetakan server-side; klien tidak pernah
  mengirim path). Zona `trash` DITOLAK sebagai target: mengosongkan Trash =
  permanen, di luar janji "undo-able" — kosongkan manual via Finder.
- Guard is_within_zone dua lapis: zona vs home (guard_root), tiap entri vs
  zona; symlink top-level dilewati, tidak dipindah. Keterbatasan diketahui:
  cek per-entri memakai realpath zona yang bisa di-swap jadi symlink di antara
  kedua cek (TOCTOU lokal) — lihat REVIEW.md §6 known issues.
- `confirm` harus boolean true; tanpa itu endpoint MENOLAK (400) tanpa
  membaca/memindahkan apa pun.
- Error per entri (OSError) dihitung dan lanjut; zona yang tidak ada di disk
  menghasilkan entries_moved=0 dengan note jujur, bukan 500.
- Setelah eksekusi, cache scan junk di-invalidate supaya angka berikutnya
  mencerminkan kondisi baru.
"""

import logging
import os
import shutil
import time

from api.storage_scan import (
    SAFE_ZONES,
    _HOME,
    get_junk_scan,
    invalidate_junk_cache,
    is_within_zone,
)

logger = logging.getLogger(__name__)

# Kode error kontrak (konsisten dengan envelope actions lainnya).
_CONFIRM_REQUIRED = "CLEAN_CONFIRM_REQUIRED"
_ACTION_NOT_ALLOWED = "ACTION_NOT_ALLOWED"


def _error(message: str, code: str) -> tuple:
    return {"status": "error", "error": {"code": code, "message": message}}, 400


def _unique_dest(dest_dir: str, name: str) -> str:
    """Nama tujuan unik di Trash (tabrakan antar-eksekusi → suffix -1, -2, ...)."""
    candidate = os.path.join(dest_dir, name)
    counter = 1
    while os.path.lexists(candidate):
        candidate = os.path.join(dest_dir, f"{name}-{counter}")
        counter += 1
    return candidate


def execute_clean(zone_ids, confirm, zones=None, home_root=None, trash_root=None) -> tuple:
    """Eksekusi pembersihan zona terpilih → pindah ke Trash.

    zones/home_root/trash_root: injectable untuk tests.
    Mengembalikan (result_envelope, http_status).
    """
    # --- validasi kontrak (semua 400 envelope, tanpa eksekusi) ---
    if confirm is not True:
        return _error(
            "Rincian pembersihan (dry-run) — kirim confirm:true untuk memindahkan ke Trash",
            _CONFIRM_REQUIRED,
        )

    active_zones = SAFE_ZONES if zones is None else zones
    known_ids = [z[0] for z in active_zones]

    if not isinstance(zone_ids, list) or len(zone_ids) == 0:
        return _error("zone_ids harus berupa daftar berisi minimal satu id zona", _ACTION_NOT_ALLOWED)
    for zone_id in zone_ids:
        if not isinstance(zone_id, str) or not zone_id:
            return _error("Setiap zone_id harus berupa teks non-kosong", _ACTION_NOT_ALLOWED)
    # Dedup mempertahankan urutan — sebelum cek panjang, agar id ganda tidak
    # dihitung sebagai "terlalu banyak zona".
    zone_ids = list(dict.fromkeys(zone_ids))
    if len(zone_ids) > len(active_zones):
        return _error("Terlalu banyak zona dalam satu permintaan", _ACTION_NOT_ALLOWED)
    for zone_id in zone_ids:
        if zone_id == "trash":
            return _error(
                "Mengosongkan Trash bersifat permanen — kosongkan manual lewat Finder (di luar skema undo-able)",
                _ACTION_NOT_ALLOWED,
            )
        if zone_id not in known_ids:
            return _error(f"Zona tidak dikenal: {zone_id}", _ACTION_NOT_ALLOWED)

    guard_root = _HOME if home_root is None else home_root
    trash_base = os.path.join(_HOME, ".Trash") if trash_root is None else trash_root

    # --- ukuran pre-clean per zona (pakai cache scan; hangat = instan) ---
    if zones is None:
        pre = get_junk_scan()
    else:
        pre = get_junk_scan(zones=zones, home_root=home_root)
    sizes: dict = {}
    if pre.get("status") == "success":
        sizes = {loc["id"]: loc["size_gb"] for loc in pre["data"]["locations"]}

    zones_result = []
    total_moved = 0
    total_errors = 0
    trash_dir: str | None = None

    id_map = {z[0]: (z[1], z[2]) for z in active_zones}

    for zone_id in zone_ids:
        label, path = id_map[zone_id]
        entry = {
            "id": zone_id,
            "label": label,
            "entries_moved": 0,
            "errors": 0,
            "skipped": 0,
            "size_moved_gb": sizes.get(zone_id),
        }

        if not os.path.isdir(path):
            entry["note"] = "zone tidak ada di disk"
            zones_result.append(entry)
            continue
        if not is_within_zone(path, guard_root):
            logger.warning(f"Zona di luar root guard ditolak saat clean: {path}")
            entry["note"] = "ditolak guard (di luar root)"
            zones_result.append(entry)
            continue

        # Buat folder Trash lazily hanya jika ada yang benar-benar dipindah.
        try:
            with os.scandir(path) as it:
                for item in it:
                    # Lazily buat tujuan (sekali per eksekusi).
                    if trash_dir is None:
                        stamp = time.strftime("%Y%m%d-%H%M%S")
                        trash_dir = os.path.join(trash_base, f"qd-clean-{stamp}")
                        suffix = 1
                        while os.path.lexists(trash_dir):
                            trash_dir = os.path.join(trash_base, f"qd-clean-{stamp}-{suffix}")
                            suffix += 1
                    dest_zone = os.path.join(trash_dir, zone_id)
                    os.makedirs(dest_zone, exist_ok=True)

                    if item.is_symlink():
                        entry["skipped"] += 1
                        continue
                    if not is_within_zone(item.path, path):
                        entry["skipped"] += 1
                        continue
                    dest = _unique_dest(dest_zone, item.name)
                    try:
                        os.rename(item.path, dest)
                    except OSError:
                        try:
                            shutil.move(item.path, dest)
                        except OSError:
                            entry["errors"] += 1
                            continue
                    entry["entries_moved"] += 1
        except (PermissionError, OSError):
            entry["errors"] += 1

        total_moved += entry["entries_moved"]
        total_errors += entry["errors"]
        zones_result.append(entry)

    # Angka berikutnya wajib mencerminkan kondisi pasca-pindah.
    invalidate_junk_cache()

    if trash_dir is not None:
        home_prefix = _HOME if home_root is None else home_root
        trash_display = trash_dir
        if trash_display.startswith(home_prefix):
            trash_display = "~" + trash_display[len(home_prefix):]
    else:
        trash_display = None

    if total_errors == 0:
        message = (
            f"{total_moved} entri dipindah ke Trash"
            + (f" — buka Finder → Trash untuk mengembalikan" if total_moved else " (tidak ada entri untuk dipindah)")
        )
    else:
        message = f"{total_moved} entri dipindah, {total_errors} gagal (lihat detail zona)"

    result = {
        "status": "success",
        "data": {
            "action": "clean",
            "zone_ids": zone_ids,
            "zones": zones_result,
            "entries_moved": total_moved,
            "errors": total_errors,
            "trash_path": trash_display,
            "message": message,
            "exit_code": 0 if total_errors == 0 else 1,
        },
    }
    return result, 200
