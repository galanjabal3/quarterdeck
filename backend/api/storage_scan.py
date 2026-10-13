"""Storage junk scan — read-only, zona whitelist non-pribadi.

Batch 1 cleaner (Fase 1): MENGUKUR saja, tidak pernah menghapus/memindahkan
file apa pun. Eksekusi nyata menyusul di Batch 2 dengan dry-run + Trash-default.

Prinsip safety:
- Zona whitelist SALING LEPAS (disjoint) agar tidak ada angka ganda.
  Catatan: ~/Library/Caches sudah mencakup ~/Library/Caches/Homebrew —
  jangan jadi entri terpisah.
- Zona = cache/log non-pribadi. TIDAK PERNAH menyentuh Desktop, Documents,
  Downloads, Pictures, Movies, Music (data pribadi + zona TCC), dan tidak
  menyentuh ~/Library/Application Support (berisi data app, mis. Docker.raw).
- Walk dengan os.scandir tanpa mengikuti symlink; setiap entri dicek ulang
  is_within_zone (guard terhadap TOCTOU swap symlink di tengah walk).
- Error per entri (PermissionError, dll.) dilewati dan dihitung, scan lanjut.
- Hasil di-cache 60 detik supaya walk 29 GB tidak diulang tiap poll.
"""

import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

# TTL cache scan (detik).
_TTL_SECONDS = 60.0
_cache: dict = {"data": None, "timestamp": 0.0}

# Single-flight lock produksi: saat cache dingin, permintaan paralel (poll UI +
# terminal + badge) WAJIB menunggu scan yang sedang berjalan, bukan meluncurkan
# walk 400k+ file bersamaan. Tanpa ini, I/O contention membuat durasi scan melebihi
# TTL dan server masuk siklus "cold scan abadi" (tiap request memulai scan baru).
_scan_lock = threading.Lock()

# Zona aman non-pribadi, sudah disjoint. Tuple (id, label, path_absolut).
# Path dihitung sekali saat import; tests meng-inject zones sendiri lewat
# parameter get_junk_scan(zones=...) — jangan monkeypatch expanduser.
_HOME = os.path.expanduser("~")
SAFE_ZONES = (
    ("caches", "User caches", os.path.join(_HOME, "Library", "Caches")),
    ("logs", "App logs", os.path.join(_HOME, "Library", "Logs")),
    ("npm", "npm cache", os.path.join(_HOME, ".npm")),
    ("devcache", "Dev caches", os.path.join(_HOME, ".cache")),
    (
        "deriveddata",
        "Xcode DerivedData",
        os.path.join(_HOME, "Library", "Developer", "Xcode", "DerivedData"),
    ),
    ("trash", "Trash", os.path.join(_HOME, ".Trash")),
)


def invalidate_junk_cache() -> None:
    """Buang hasil scan tersimpan (dipanggil executor clean setelah zona berubah)."""
    _cache["data"] = None
    _cache["timestamp"] = 0.0


def is_within_zone(path: str, root: str) -> bool:
    """True jika path (setelah realpath) berada di dalam root.

    Dipakai dua kali: (1) guard zona vs home saat scan, (2) guard target
    eksekusi di Batch 2. commonpath ValueError = beda filesystem → tolak.
    """
    try:
        real_path = os.path.realpath(path)
        real_root = os.path.realpath(root)
        return os.path.commonpath([real_path, real_root]) == real_root
    except ValueError:
        return False


def _measure_dir(root: str) -> tuple:
    """Walk rekursif os.scandir: (total_bytes, file_count, skipped_count).

    - Tidak mengikuti symlink (is_symlink → skip; is_dir/follow_symlinks=False).
    - Guard is_within_zone hanya untuk DIREKTORI sebelum di-walk lebih dalam
      (mencegah TOCTOU symlink-swap loloskan walk ke luar zone). File tidak
      perlu dicek: tidak di-follow, tidak direkursi — cek realtime per file
      memperlambat ~400k syscall tanpa nilai keamanan tambahan.
    - Error per entri (PermissionError/OSError) → dihitung skipped, lanjut.
    """
    total_bytes = 0
    file_count = 0
    skipped = 0
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            with os.scandir(current) as entries:
                for entry in entries:
                    try:
                        if entry.is_symlink():
                            skipped += 1
                            continue
                        if entry.is_dir(follow_symlinks=False):
                            if not is_within_zone(entry.path, root):
                                skipped += 1
                                continue
                            stack.append(entry.path)
                        elif entry.is_file(follow_symlinks=False):
                            total_bytes += entry.stat(follow_symlinks=False).st_size
                            file_count += 1
                    except OSError:
                        skipped += 1
        except (PermissionError, OSError):
            skipped += 1
    return total_bytes, file_count, skipped


def _display_path(path: str) -> str:
    """Singkat home menjadi '~' untuk ditampilkan di UI."""
    if path.startswith(_HOME):
        return "~" + path[len(_HOME):]
    return path


def _cached_scan() -> dict | None:
    """Hasil scan produksi bila masih berlaku (TTL 60 dtk), selain itu None."""
    now = time.monotonic()
    if _cache["data"] is None or (now - _cache["timestamp"]) >= _TTL_SECONDS:
        return None
    cached = dict(_cache["data"])
    data = dict(cached["data"])
    data["cached"] = True
    cached["data"] = data
    return cached


def _build_scan(active_zones, guard_root: str, store: bool) -> dict:
    """Walk semua zona lalu kembalikan envelope hasil; `store` mengisi cache produksi."""
    started = time.monotonic()

    locations = []
    total_bytes = 0
    total_files = 0
    total_skipped = 0

    for zone_id, label, path in active_zones:
        # Zona non-existent → lewati diam-diam (tidak ada baris "0 GB").
        if not os.path.isdir(path):
            continue
        # Guard: path zona harus berada di dalam root (default: home user).
        if not is_within_zone(path, guard_root):
            logger.warning(f"Zona di luar root guard ditolak: {path}")
            continue
        size_bytes, file_count, skipped = _measure_dir(path)
        locations.append(
            {
                "id": zone_id,
                "label": label,
                "path": _display_path(path),
                "size_gb": round(size_bytes / (1024 ** 3), 2),
                "file_count": file_count,
                "skipped": skipped,
            }
        )
        total_bytes += size_bytes
        total_files += file_count
        total_skipped += skipped

    duration = round(time.monotonic() - started, 2)
    result = {
        "status": "success",
        "data": {
            "reclaimable_gb": round(total_bytes / (1024 ** 3), 2),
            "file_count": total_files,
            "skipped": total_skipped,
            "locations": locations,
            "scanned_at": time.time(),
            "cached": False,
            "duration_s": duration,
        },
    }

    if store:
        # Timestamp dari AKHIR scan supaya TTL60 dtk penuh berlaku setelah scan
        # selesai — kalau dihitung dari awal, scan lambat langsung expired dan
        # memicu scan berikutnya sebelum cache sempat dipakai (cold-scan abadi).
        _cache["data"] = result
        _cache["timestamp"] = time.monotonic()

    return result


def get_junk_scan(zones=None, home_root=None) -> dict:
    """GET /api/metrics/junk — ukur reclaimable space di zona whitelist.

    zones: injectable untuk tests (tuple (id, label, path)); default SAFE_ZONES.
    home_root: root guard untuk tests; default $HOME. Zona wajib di dalam root ini.
    Zona yang tidak ada di disk dilewati diam-diam (bukan baris "0 GB").
    """
    is_production = zones is None and home_root is None

    if not is_production:
        return _build_scan(SAFE_ZONES if zones is None else zones,
                           _HOME if home_root is None else home_root, store=False)

    # Produksi: single-flight — cek cache cepat dulu, lalu serialisasi scan.
    hit = _cached_scan()
    if hit is not None:
        return hit

    with _scan_lock:
        # Double-check: permintaan yang menunggu lock memakai hasil scan
        # pertama, bukan mengulang walk-nya.
        hit = _cached_scan()
        if hit is not None:
            return hit
        return _build_scan(SAFE_ZONES, _HOME, store=True)
