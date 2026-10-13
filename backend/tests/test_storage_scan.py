"""Tests untuk storage_scan — whitelist guard, TTL cache, skip-error, struktur respons.

Catatan: tests TIDAK PERNAH scan home asli (29 GB, lambat & beda tiap mesin).
Zona di-inject via parameter get_junk_scan(zones=...) ke direktori tmp pytest.
"""

import os
import time

import pytest

from api.storage_scan import get_junk_scan, is_within_zone, _measure_dir, _cache


@pytest.fixture(autouse=True)
def reset_cache():
    """Bersihkan TTL cache antar test agar tidak ada kebocoran state."""
    _cache["data"] = None
    _cache["timestamp"] = 0.0
    yield
    _cache["data"] = None
    _cache["timestamp"] = 0.0


def _make_zone(tmp_path, name, files):
    """Buat direktori zone dengan files: dict relpath -> ukuran byte."""
    zone = tmp_path / name
    zone.mkdir()
    for relpath, size in files.items():
        p = zone / relpath
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"x" * size)
    return str(zone)


class TestJunkScanStructure:
    def test_scan_returns_success_with_expected_fields(self, tmp_path):
        zone = _make_zone(tmp_path, "caches", {"a.bin": 100, "sub/b.bin": 200})
        result = get_junk_scan(zones=(("caches", "Caches", zone),), home_root=str(tmp_path))
        assert result["status"] == "success"
        data = result["data"]
        assert "reclaimable_gb" in data
        assert "file_count" in data
        assert "locations" in data
        assert "scanned_at" in data
        assert "cached" in data
        assert isinstance(data["reclaimable_gb"], float)
        assert isinstance(data["file_count"], int)
        assert data["cached"] is False

    def test_scan_sums_file_sizes(self, tmp_path):
        zone = _make_zone(tmp_path, "caches", {"a.bin": 1000, "sub/b.bin": 2000})
        result = get_junk_scan(zones=(("caches", "Caches", zone),), home_root=str(tmp_path))
        data = result["data"]
        assert data["file_count"] == 2
        # 3000 byte dibulatkan ke GB (sangat kecil → 0.0), tapi byte-level dicek via lokasi
        loc = data["locations"][0]
        assert loc["file_count"] == 2
        assert loc["size_gb"] == round(3000 / (1024 ** 3), 2)
        assert loc["id"] == "caches"
        assert loc["label"] == "Caches"
        assert "path" in loc

    def test_scan_multiple_zones_totals(self, tmp_path):
        z1 = _make_zone(tmp_path, "z1", {"a.bin": 1024})
        z2 = _make_zone(tmp_path, "z2", {"b.bin": 2048})
        result = get_junk_scan(
            zones=(("z1", "Zone 1", z1), ("z2", "Zone 2", z2)),
            home_root=str(tmp_path),
        )
        data = result["data"]
        assert len(data["locations"]) == 2
        assert data["file_count"] == 2
        # Ukuran file di bawah 1 GB membulat ke 0.0 GB; validasi lewat file_count
        # dan total file_count lokasi == file_count global.
        assert sum(loc["file_count"] for loc in data["locations"]) == data["file_count"]


class TestZoneGuards:
    def test_missing_zone_skipped_silently(self, tmp_path):
        """Zona yang tidak ada di disk tidak muncul sebagai baris '0 GB'."""
        missing = str(tmp_path / "tidak-ada")
        result = get_junk_scan(zones=(("gone", "Gone", missing),), home_root=str(tmp_path))
        data = result["data"]
        assert data["locations"] == []
        assert data["reclaimable_gb"] == 0.0
        assert data["file_count"] == 0

    def test_zone_that_is_file_not_dir_skipped(self, tmp_path):
        f = tmp_path / "bukan-direktori"
        f.write_bytes(b"x" * 10)
        result = get_junk_scan(zones=(("file", "File", str(f)),), home_root=str(tmp_path))
        assert result["data"]["locations"] == []

    def test_symlinks_not_followed(self, tmp_path):
        """Symlink ke direktori luar tidak di-walk (tidak ada data ganda/loop)."""
        outside = tmp_path / "outside"
        outside.mkdir()
        (outside / "secret.bin").write_bytes(b"x" * 5000)
        zone = tmp_path / "zone"
        zone.mkdir()
        (zone / "link").symlink_to(outside)
        result = get_junk_scan(zones=(("zone", "Zone", str(zone)),), home_root=str(tmp_path))
        data = result["data"]
        assert data["file_count"] == 0  # link tidak dihitung
        assert data["locations"][0]["skipped"] >= 1

    def test_permission_error_skipped_not_crash(self, tmp_path):
        """Subdirektori tanpa izin baca → dihitung skipped, scan tetap jalan."""
        zone = _make_zone(tmp_path, "zone", {"ok.bin": 100})
        locked = tmp_path / "zone" / "locked"
        locked.mkdir()
        (locked / "hidden.bin").write_bytes(b"x" * 100)
        os.chmod(locked, 0o000)
        try:
            result = get_junk_scan(zones=(("zone", "Zone", str(zone)),), home_root=str(tmp_path))
            assert result["status"] == "success"
            data = result["data"]
            # file ok.bin tetap terhitung
            assert data["file_count"] == 1
        finally:
            os.chmod(locked, 0o755)

    def test_zone_outside_home_rejected(self, tmp_path):
        """Zona di luar root guard ditolak (realpath harus di dalam root)."""
        zone = _make_zone(tmp_path, "zone", {"a.bin": 100})
        # Arahkan guard_root ke direktori lain (bukan induk zone) → zone ditolak
        other = tmp_path / "other-root"
        other.mkdir()
        result = get_junk_scan(
            zones=(("zone", "Zone", zone),), home_root=str(other)
        )
        assert result["data"]["locations"] == []
        assert result["data"]["reclaimable_gb"] == 0.0


class TestIsWithinZone:
    def test_file_inside_root_ok(self, tmp_path):
        f = tmp_path / "a.bin"
        f.write_bytes(b"x")
        assert is_within_zone(str(f), str(tmp_path)) is True

    def test_file_outside_root_rejected(self, tmp_path):
        inner = tmp_path / "inner"
        inner.mkdir()
        outside = tmp_path / "outside.bin"
        outside.write_bytes(b"x")
        assert is_within_zone(str(outside), str(inner)) is False

    def test_traversal_dotdot_rejected(self, tmp_path):
        inner = tmp_path / "inner"
        inner.mkdir()
        traversal = str(inner / ".." / ".." / "etc" / "passwd")
        # traversal keluar root → realpath resolve ke luar → False
        assert is_within_zone(traversal, str(inner)) is False

    def test_nonexistent_path_inside_root(self, tmp_path):
        """Path belum ada tapi secara leksikal di dalam root → True.

        (Dipakai Batch 2 untuk guard target Trash yang belum dibuat.)
        """
        future = tmp_path / "belum" / "ada.bin"
        assert is_within_zone(str(future), str(tmp_path)) is True


class TestTTLCache:
    def test_second_call_within_ttl_is_cached(self, tmp_path, monkeypatch):
        zone = _make_zone(tmp_path, "zone", {"a.bin": 100})
        # Patch SAFE_ZONES agar jalur production (zones=None) memakai zone tmp.
        # Zone di luar _HOME → ditolak guard, tapi cukup untuk uji cache.
        monkeypatch.setattr(
            "api.storage_scan.SAFE_ZONES", (("zone", "Zone", zone),)
        )
        first = get_junk_scan()  # production path, hasil ditulis ke cache
        assert first["data"]["cached"] is False
        second = get_junk_scan()  # dalam TTL → cache
        assert second["data"]["cached"] is True
        assert second["data"]["reclaimable_gb"] == first["data"]["reclaimable_gb"]

    def test_stale_cache_ignored(self, tmp_path, monkeypatch):
        zone = _make_zone(tmp_path, "zone", {"a.bin": 100})
        monkeypatch.setattr(
            "api.storage_scan.SAFE_ZONES", (("zone", "Zone", zone),)
        )
        first = get_junk_scan()
        _cache["timestamp"] = time.monotonic() - 120  # lewat TTL 60 dtk
        second = get_junk_scan()
        assert second["data"]["cached"] is False
        assert second["data"]["reclaimable_gb"] == first["data"]["reclaimable_gb"]


class TestMeasureDir:
    def test_empty_dir(self, tmp_path):
        total, count, skipped = _measure_dir(str(tmp_path))
        assert total == 0
        assert count == 0
        assert skipped == 0

    def test_nested_dirs(self, tmp_path):
        (tmp_path / "a" / "b").mkdir(parents=True)
        (tmp_path / "a" / "f1.bin").write_bytes(b"x" * 100)
        (tmp_path / "a" / "b" / "f2.bin").write_bytes(b"x" * 200)
        total, count, skipped = _measure_dir(str(tmp_path))
        assert total == 300
        assert count == 2
        assert skipped == 0
