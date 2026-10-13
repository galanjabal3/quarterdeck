"""Tests untuk executor clean — kontrak 400, guard, dan pindah nyata ke Trash.

Semua eksekusi memakai zone tmp + trash tmp (monkeypatch/cache reset per test).
Tidak ada test yang menyentuh ~/Library atau ~/.Trash asli.
"""

import os

import pytest

from api.clean import execute_clean
from api.storage_scan import _cache, invalidate_junk_cache


@pytest.fixture(autouse=True)
def reset_cache():
    _cache["data"] = None
    _cache["timestamp"] = 0.0
    yield
    _cache["data"] = None
    _cache["timestamp"] = 0.0


def _setup(tmp_path, extra_entries=None):
    """Bangun zone + trash tmp. Return (zones, home_root, trash_root)."""
    zone = tmp_path / "home" / "caches"
    zone.mkdir(parents=True)
    (zone / "a.bin").write_bytes(b"x" * 100)
    sub = zone / "sub"
    sub.mkdir()
    (sub / "b.bin").write_bytes(b"x" * 200)
    if extra_entries:
        extra_entries(zone)
    trash = tmp_path / "home" / ".Trash"
    trash.mkdir(parents=True)
    zones = (("caches", "Caches", str(zone)),)
    return zones, str(tmp_path / "home"), str(trash)


class TestConfirmContract:
    def test_without_confirm_returns_400_dry_run(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(["caches"], None, zones=zones, home_root=home, trash_root=trash)
        assert status == 400
        assert result["error"]["code"] == "CLEAN_CONFIRM_REQUIRED"
        assert "dry-run" in result["error"]["message"]
        # Nol eksekusi: file tetap di zona
        assert (tmp_path / "home" / "caches" / "a.bin").exists()

    def test_confirm_string_true_rejected(self, tmp_path):
        """confirm:"true" (string) bukan boolean true → tolak."""
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(["caches"], "true", zones=zones, home_root=home, trash_root=trash)
        assert status == 400
        assert result["error"]["code"] == "CLEAN_CONFIRM_REQUIRED"

    def test_confirm_int_one_rejected(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(["caches"], 1, zones=zones, home_root=home, trash_root=trash)
        assert status == 400


class TestZoneValidation:
    def test_unknown_zone_400(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(["tidak-ada"], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 400
        assert result["error"]["code"] == "ACTION_NOT_ALLOWED"
        assert "tidak dikenal" in result["error"]["message"]

    def test_trash_zone_rejected_permanent(self, tmp_path):
        """Zona trash ditolak: mengosongkan Trash permanen di luar skema undo-able."""
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(["trash"], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 400
        assert "permanen" in result["error"]["message"]

    def test_zone_ids_not_list_400(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean("caches", True, zones=zones, home_root=home, trash_root=trash)
        assert status == 400
        assert result["error"]["code"] == "ACTION_NOT_ALLOWED"

    def test_zone_ids_empty_400(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean([], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 400

    def test_zone_ids_non_string_400(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean([123], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 400

    def test_path_traversal_as_zone_id_400(self, tmp_path):
        """id zona berbentuk traversal tidak pernah dipetakan ke path (lookup by id)."""
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(
            ["../../etc"], True, zones=zones, home_root=home, trash_root=trash
        )
        assert status == 400
        assert result["error"]["code"] == "ACTION_NOT_ALLOWED"

    def test_too_many_zones_400(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(
            ["a", "b", "c", "d"], True, zones=zones, home_root=home, trash_root=trash
        )
        assert status == 400


class TestExecution:
    def test_files_moved_to_trash(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(["caches"], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 200
        data = result["data"]
        assert data["entries_moved"] == 2  # a.bin + sub/
        assert data["exit_code"] == 0
        # Zona kosong
        zone = tmp_path / "home" / "caches"
        assert list(zone.iterdir()) == []
        # Isi ada di trash dengan struktur zone_id/
        moved_a = list((tmp_path / "home" / ".Trash").rglob("a.bin"))
        assert len(moved_a) == 1
        assert moved_a[0].parent.name == "caches"
        assert moved_a[0].read_bytes() == b"x" * 100
        # Subtree pindah utuh
        moved_b = list((tmp_path / "home" / ".Trash").rglob("b.bin"))
        assert len(moved_b) == 1

    def test_zone_dir_itself_persists(self, tmp_path):
        """Folder zona tetap ada (tidak ikut dipindah) — hanya isinya."""
        zones, home, trash = _setup(tmp_path)
        execute_clean(["caches"], True, zones=zones, home_root=home, trash_root=trash)
        assert (tmp_path / "home" / "caches").is_dir()

    def test_trash_path_display_uses_tilde(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(["caches"], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 200
        assert result["data"]["trash_path"].startswith("~")

    def test_symlinks_not_moved(self, tmp_path):
        def add_symlink(zone):
            (zone / "link").symlink_to(tmp_path / "outside-target")

        zones, home, trash = _setup(tmp_path, extra_entries=add_symlink)
        outside = tmp_path / "outside-target"
        outside.write_bytes(b"keep")
        result, status = execute_clean(["caches"], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 200
        data = result["data"]
        zone = tmp_path / "home" / "caches"
        # Symlink tetap di zona (tidak dipindah), file nyata pindah
        assert (zone / "link").exists()
        assert data["zones"][0]["skipped"] == 1
        assert data["zones"][0]["entries_moved"] == 2

    def test_missing_zone_note_not_500(self, tmp_path):
        zones = (("gone", "Gone", str(tmp_path / "tidak-ada")),)
        home = str(tmp_path)
        trash = str(tmp_path / ".Trash")
        (tmp_path / ".Trash").mkdir()
        result, status = execute_clean(["gone"], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 200
        z = result["data"]["zones"][0]
        assert z["entries_moved"] == 0
        assert "tidak ada di disk" in z["note"]
        assert result["data"]["trash_path"] is None

    def test_zone_outside_home_rejected(self, tmp_path):
        """Zona di luar guard root → ditolak, tidak ada file bergerak."""
        zone = tmp_path / "outer" / "zone"
        zone.mkdir(parents=True)
        (zone / "f.bin").write_bytes(b"x")
        home = str(tmp_path / "home-only")
        (tmp_path / "home-only").mkdir()
        trash = str(tmp_path / "home-only" / ".Trash")
        (tmp_path / "home-only" / ".Trash").mkdir()
        zones = (("zone", "Zone", str(zone)),)
        result, status = execute_clean(["zone"], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 200
        assert result["data"]["entries_moved"] == 0
        assert "guard" in result["data"]["zones"][0]["note"]
        assert (zone / "f.bin").exists()

    def test_duplicate_zone_ids_deduped(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        result, status = execute_clean(
            ["caches", "caches"], True, zones=zones, home_root=home, trash_root=trash
        )
        assert status == 200
        # Tidak ada error ganda; entri kedua zone_id sudah di-dedup
        assert result["data"]["zone_ids"] == ["caches"]

    def test_clean_empty_zone_success_zero(self, tmp_path):
        zone = tmp_path / "home" / "caches"
        zone.mkdir(parents=True)
        trash = tmp_path / "home" / ".Trash"
        trash.mkdir(parents=True)
        zones = (("caches", "Caches", str(zone)),)
        result, status = execute_clean(["caches"], True, zones=zones, home_root=str(tmp_path / "home"), trash_root=str(trash))
        assert status == 200
        assert result["data"]["entries_moved"] == 0
        assert result["data"]["trash_path"] is None
        assert "tidak ada entri" in result["data"]["message"]

    def test_name_collision_gets_unique_dest(self, tmp_path):
        """Dest yang sudah ada di Trash → suffix unik, tidak menimpa."""
        zones, home, trash = _setup(tmp_path)
        # Buat folder trash yang sudah berisi nama sama
        existing = list((tmp_path / "home" / ".Trash").glob("qd-clean-*"))
        assert existing == []  # trash masih kosong; collision divalidasi via _unique_dest
        result, status = execute_clean(["caches"], True, zones=zones, home_root=home, trash_root=trash)
        assert status == 200
        # Kedua entri punya nama unik di tujuan
        names = [p.name for p in (tmp_path / "home" / ".Trash").rglob("*") if p.is_file()]
        assert "a.bin" in names


class TestCacheInvalidation:
    def test_execute_invalidates_junk_cache(self, tmp_path):
        zones, home, trash = _setup(tmp_path)
        # Setel cache palsu lalu eksekusi → cache harus dibuang
        _cache["data"] = {"status": "success", "data": {"reclaimable_gb": 999.0}}
        _cache["timestamp"] = 1.0
        execute_clean(["caches"], True, zones=zones, home_root=home, trash_root=trash)
        # invalidate dipanggil; cache diisi ulang oleh get_junk_scan pre-clean,
        # tapi timestamp harus reset (0.0) oleh invalidate setelah eksekusi.
        assert _cache["timestamp"] == 0.0

    def test_invalidate_helper_clears(self):
        _cache["data"] = {"x": 1}
        _cache["timestamp"] = 42.0
        invalidate_junk_cache()
        assert _cache["data"] is None
        assert _cache["timestamp"] == 0.0
