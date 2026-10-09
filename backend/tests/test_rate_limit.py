"""Rate limit middleware integration tests for Quarterdeck.

Follows test_auth.py patterns: raw ASGI scope, monkeypatch-cleaned env,
fixture-based cleanup (pop env + clear store module rate_limit antar test).
"""

import asyncio
import json
import os

import pytest

from app import app


def _build_asgi_scope(
    method: str = "GET",
    path: str = "/api/metrics/cpu",
    query_string: bytes = b"",
    headers: list | None = None,
):
    """Bangun scope ASGI lengkap untuk penguji."""
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode() if isinstance(path, str) else path,
        "query_string": query_string,
        "root_path": "",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 9999),
        "headers": headers or [],
        "extensions": {},
        "transport": None,
    }
    return scope


def _raw_asgi_request(
    method: str = "GET",
    path: str = "/api/metrics/cpu",
    query_string: bytes = b"",
    headers: list | None = None,
):
    """Panggil app ASGI langsung; return (status:int, body:dict, raw_headers:list)."""
    import json as _json

    scope = _build_asgi_scope(method=method, path=path, query_string=query_string, headers=headers)

    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    # Jalankan app
    import app as app_module
    asyncio.run(app_module.app(scope, receive, send))

    # Ekstrak response start dan body
    start = None
    body_raw = b""
    for m in messages:
        if m["type"] == "http.response.start":
            start = m
        if m["type"] == "http.response.body":
            body_raw += m.get("body", b"")

    if start is None:
        return 404, {}, []

    body = _json.loads(body_raw.decode()) if body_raw else {}
    return start["status"], body, start.get("headers", [])


def _req(
    method: str = "GET",
    path: str = "/api/metrics/cpu",
    query_string: bytes = b"",
    headers: list | None = None,
    env_token: str | None = None,
):
    """Helper: panggil _raw_asgi_request dengan env token yang sudah di-set.

    Parameters
    ----------
    method : str
        HTTP method ("GET" atau "OPTIONS").
    path : bytes or str
        Path saja (tanpa query string).
    query_string : bytes
        Query string dalam bentuk bytes (misal b"token=xyz").
    headers : list of (bytes, bytes) or None
        ASGI raw headers list.
    env_token : str or None
        Nilai QD_RATE_LIMIT_PER_MIN untuk sesi test ini. Jika None, env dibersihkan
        setelah test (batas default 300).
    """
    import os as _os

    # Set env rate limit jika diberikan (dibersihkan otomatis setelah test)
    if env_token is not None:
        _os.environ["QD_RATE_LIMIT_PER_MIN"] = str(env_token)

    # Bangun header raw ASGI: list of (name, bytes)
    raw_headers = headers or []

    # Pastikan header ada; tambahkan host jika belum ada
    has_host = any(h[0].lower() == b"host" for h in raw_headers)
    if not has_host:
        raw_headers = raw_headers + [(b"host", b"testserver")]

    status, body, resp_headers = _raw_asgi_request(
        method=method,
        path=path,
        query_string=query_string,
        headers=raw_headers,
    )

    # Bersihkan env setelah test
    if env_token is not None:
        _os.environ.pop("QD_RATE_LIMIT_PER_MIN", None)
    return status, body, resp_headers


class TestRateLimitIntegration:
    """Integration tests for rate limit middleware via raw ASGI scope.

    Setiap test mandiri: env rate limit di-set melalui env_token di _req,
    dan store module dibersihkan antar test via fixture _clean_env_and_store.
    Tidak ada test yang mempengaruhi test lain melalui os.environ atau store state.
    """

    @pytest.fixture(autouse=True)
    def _clean_env_and_store(self):
        """Ensure QD_RATE_LIMIT_PER_MIN is clean and store is reset per test.

        Membersihkan:
        - QD_RATE_LIMIT_PER_MIN dari os.environ
        - rate_limit._rate_limit_store (module-level dict)
        Setiap test mendapatkan store kosong di awal.
        """
        # 1. Hapus env var jika ada (before test)
        os.environ.pop("QD_RATE_LIMIT_PER_MIN", None)

        # 2. Reset store module-level
        from api import rate_limit
        rate_limit.clear_store()

        yield

        # 3. Setelah test selesai: bersihkan env dan store lagi
        os.environ.pop("QD_RATE_LIMIT_PER_MIN", None)
        from api import rate_limit
        rate_limit.clear_store()

    def test_over_limit_429(self, monkeypatch):
        """1. Over limit → 429: kirim limit+1 request (limit=3, jadi 4 request)
        → status 429, envelope RATE_LIMITED, header Retry-After ada dan integer >= 1."""
        # Set limit 3 via env_token; _req akan set os.environ["QD_RATE_LIMIT_PER_MIN"] = "3"
        statuses = []
        bodies = []
        retry_after_values = []
        for i in range(4):
            status, body, resp_headers = _req(env_token="3")
            statuses.append(status)
            bodies.append(body)
            # Ekstrak Retry-After header
            ra = None
            for h_name, h_val in resp_headers:
                if h_name.decode("latin-1").lower() == "retry-after":
                    ra = h_val.decode("latin-1") if isinstance(h_val, bytes) else h_val
                    break
            retry_after_values.append(ra)

        # Request 1-3 should be 200, request 4 should be 429
        assert statuses[0:3] == [200, 200, 200], f"Expected first 3 to be 200, got {statuses[0:3]}"
        assert statuses[3] == 429, f"Expected 4th request to be 429, got {statuses[3]}"

        # Body envelope harus RATE_LIMITED
        assert bodies[3]["status"] == "error", f"Expected error status, got {bodies[3]['status']}"
        assert bodies[3]["error"]["code"] == "RATE_LIMITED", (
            f"Expected error code RATE_LIMITED, got {bodies[3]['error']['code']}"
        )

        # Retry-After harus ada dan berupa integer string >= 1
        for i, ra in enumerate(retry_after_values):
            if ra is not None:
                ra_int = int(ra)
                assert ra_int >= 1, f"Retry-After should be >= 1, got {ra}"
        # Specifically the 4th request should have Retry-After
        assert retry_after_values[3] is not None, "Retry-After header should be present on 429 response"

    def test_below_limit_200(self, monkeypatch):
        """2. Di bawah limit → 200: limit 5, request pertama 200."""
        status, body, resp_headers = _req(env_token="5")
        assert status == 200, f"Expected 200 but got {status}"
        assert body["status"] == "success"

    def test_options_exempt(self, monkeypatch):
        """3. OPTIONS exempt: kirim OPTIONS berkali-kali melebihi limit → TIDAK pernah 429."""
        # Set limit 2 via env_token
        for i in range(5):
            status, body, resp_headers = _req(method="OPTIONS", env_token="2")
            assert status != 429, f"Request {i+1}: Expected not 429 for OPTIONS, got {status}"
            assert status == 200, f"Request {i+1}: Expected 200 for OPTIONS, got {status}"

    def test_disabled_via_env_zero(self, monkeypatch):
        """4. Disabled via env QD_RATE_LIMIT_PER_MIN=0: kirim > limit → semua tetap 200."""
        # Set limit 0 via env_token → fully disabled
        for i in range(5):
            status, body, resp_headers = _req(env_token="0")
            assert status == 200, f"Request {i+1}: Expected 200 (disabled), got {status}"

    def test__limit_per_min_parsing(self, monkeypatch):
        """5. Parsing config: unit test _limit_per_min() —unset→300, ""→300, "0"→0,
        "abc"→300, "-5"→300, "42"→42."""
        # import here to test module-level func
        from api.rate_limit import _limit_per_min

        # unset → 300 (tidak ada env yang ditetapkan di module level saat ini)
        result = _limit_per_min()
        assert result == 300, f"unset should return 300, got {result}"

        # "" → 300
        import os as _os
        _os.environ["QD_RATE_LIMIT_PER_MIN"] = ""
        result = _limit_per_min()
        assert result == 300, f'empty string should return 300, got {result}'
        del _os.environ["QD_RATE_LIMIT_PER_MIN"]

        # "0" → 0 (disabled)
        _os.environ["QD_RATE_LIMIT_PER_MIN"] = "0"
        result = _limit_per_min()
        assert result == 0, f'"0" should return 0, got {result}'
        del _os.environ["QD_RATE_LIMIT_PER_MIN"]

        # "abc" → 300 (invalid)
        _os.environ["QD_RATE_LIMIT_PER_MIN"] = "abc"
        result = _limit_per_min()
        assert result == 300, f'"abc" should return 300, got {result}'
        del _os.environ["QD_RATE_LIMIT_PER_MIN"]

        # "-5" → 300 (negative → fallback)
        _os.environ["QD_RATE_LIMIT_PER_MIN"] = "-5"
        result = _limit_per_min()
        assert result == 300, f'"-5" should return 300, got {result}'
        del _os.environ["QD_RATE_LIMIT_PER_MIN"]

        # "42" → 42
        _os.environ["QD_RATE_LIMIT_PER_MIN"] = "42"
        result = _limit_per_min()
        assert result == 42, f'"42" should return 42, got {result}'
        del _os.environ["QD_RATE_LIMIT_PER_MIN"]

    def test_window_expiry_without_sleep(self, monkeypatch):
        """6. Window expiry tanpa sleep: monkeypatch rate_limit.now (mis. tambah 61
        pada nilai yang dikembalikan) → setelah jendela bergesir, request yang sebelumnya
        ditolak kembali 200.

        Alur test:
        1. Set limit 1, request pertama → 200 (store kosong, 0 < 1)
        2. Request kedua → 429 (store punya 1 entry, limit 1, ditolak)
        3. Monkeypatch now() + 61 detik → jendela sliding expired
        4. Request ketiga → 200 (timestamp lama sudah prune, store kembali kosong)
        """
        from api import rate_limit

        import os as _os

        # Set limit 1 untuk memudahkan uji
        _os.environ["QD_RATE_LIMIT_PER_MIN"] = "1"

        # Request pertama: store kosong, 0 < 1 → 200
        status1, body1, _ = _req(env_token="1")
        assert status1 == 200, f"First request should be 200 with limit 1 and empty store, got {status1}"

        # Request kedua: store sudah punya 1 entry, limit 1 → 1 >= 1 → 429
        status2, body2, _ = _req(env_token="1")
        assert status2 == 429, f"Second request should be 429 with limit 1, got {status2}"

        # Monkeypatch now() sehingga nilai baru = lama + 61
        # sehingga timestamp lama keluar jendela 60 detik
        original_now = rate_limit.now

        def patched_now():
            return original_now() + 61

        # Apply monkeypatch pada module
        rate_limit.now = patched_now

        try:
            # Request ketiga: setelah window expiry, timestamp lama ter-prune,
            # store kembali kosong, 0 < 1 → 200
            status3, body3, _ = _req(env_token="1")
            assert status3 == 200, (
                f"Third request should be 200 after window expiry, got {status3}"
            )
        finally:
            # Kembalikan asli
            rate_limit.now = original_now
            # fixture _clean_env_and_store sudah menangani cleanup store
    def test_store_key_cap_evicts_oldest(self):
        """7. Batas memori: store penuh (4096 key) + request dari IP baru →
        key tertua terbuang, jumlah key tetap <= 4096, dan IP baru masuk."""
        from collections import deque

        from api import rate_limit

        # Prefill store langsung dengan key palsu (cepat; tanpa 4096 request)
        for i in range(rate_limit._MAX_STORE_KEYS):
            rate_limit._rate_limit_store[f"10.0.0.{i}"] = deque()
        oldest_key = next(iter(rate_limit._rate_limit_store))

        # Satu request dari IP baru (scope test selalu 127.0.0.1)
        status, _, _ = _req(env_token="300")
        assert status == 200, f"Expected 200, got {status}"

        store = rate_limit._rate_limit_store
        assert len(store) <= rate_limit._MAX_STORE_KEYS, f"store should be capped, len={len(store)}"
        assert "127.0.0.1" in store, "new IP should be admitted"
        assert oldest_key not in store, "oldest key should have been evicted"
