"""Integration tests for auth middleware and startup guardrail.

Real HTTP integration tests via raw ASGI scope (menghindari keterbatasan httpx
seperti encode header non-ASCII). Follows test_metrics.py patterns: class-based,
monkeypatch-cleaned env.
"""

import asyncio
import json
import os

import pytest

from app import app

def _get_query_param(url: str, param: str) -> str:
    """Ambil nilai query param dari URL string (parse manual)."""
    if not url:
        return ""
    # Cari ?param=value atau &param=value di dalam URL
    idx = url.find("?" if "?" in url else "&")
    if idx == -1:
        return ""
    query = url[idx + 1:]  # lewat tanda ?
    for item in query.split("&"):
        if item.startswith(param + "="):
            return item[len(param + "="):]
    return ""

def _build_ascii_header(name: str, value: str) -> bytes:
    """Build a single ASGI header byte tuple from ASCII strings."""
    return (name.encode("latin-1"), value.encode("latin-1"))

def _raw_asgi_request(
    method: str = "GET",
    path=b"/api/metrics/storage",
    query_string=b"",
    headers=None,
    env_token=None,
):
    """Panggil app ASGI langsung; return (status:int, body:dict, raw_headers:list).

    Parameters
    ----------
    method : str
        HTTP method ("GET" atau "OPTIONS").
    path : bytes
        Path saja (tanpa query string).
    query_string : bytes
        Query string dalam bentuk bytes (misal b"token=xyz").
    headers : list of (bytes, bytes) or None
        ASGI raw headers list. Setiap tuple adalah (name_bytes, value_bytes).
    env_token : str or None
        Nilai ACH_AUTH_TOKEN untuk sesi test ini. Jika None, env dibersihkan setelah test.
    """
    import json as _json

    # Bangun scope ASGI lengkap sesuai spec
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path.decode() if isinstance(path, bytes) else path,
        "raw_path": path if isinstance(path, bytes) else path.encode(),
        "query_string": query_string,
        "root_path": "",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 9999),
        "headers": headers or [],
        "extensions": {},
        "transport": None,
    }
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

    body = json.loads(body_raw.decode()) if body_raw else {}
    return start["status"], body, start.get("headers", [])

def _req(
    method: str = "GET",
    path=b"/api/metrics/storage",
    query_string=b"",
    headers=None,
    env_token=None,
):
    """Helper: panggil _raw_asgi_request dengan env token yang sudah di-set.

    Parameters
    ----------
    method : str
        HTTP method ("GET" atau "OPTIONS").
    path : bytes
        Path saja (tanpa query string).
    query_string : bytes
        Query string dalam bentuk bytes (misal b"token=xyz").
    headers : list of (bytes, bytes) or None
        ASGI raw headers list. Setiap tuple adalah (name_bytes, value_bytes).
    env_token : str or None
        Nilai ACH_AUTH_TOKEN untuk sesi test ini. Jika None, env dibersihkan setelah test.
    """
    import os

    # Set env token jika diberikan (dibersihkan otomatis setelah test)
    if env_token is not None:
        os.environ["ACH_AUTH_TOKEN"] = env_token

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
        env_token=env_token,
    )

    # Bersihkan env setelah test
    if env_token is not None:
        os.environ.pop("ACH_AUTH_TOKEN", None)
    return status, body, resp_headers

class TestAuthIntegration:
    """Real HTTP integration tests via raw ASGI scope (hindari httpx encoding).

    Setiap test mandiri: monkeypatch.setenv dipakai di dalam test, dan env
    dibersihkan (_req terakhirnya pop ACH_AUTH_TOKEN). Tidak ada test yang
    mempengaruhi test lain melalui os.environ yang bocor.
    """

    @pytest.fixture(autouse=True)
    def _clean_env(self, monkeypatch):
        """Ensure ACH_AUTH_TOKEN and API_HOST are clean per test."""
        monkeypatch.delenv("ACH_AUTH_TOKEN", raising=False)
        monkeypatch.delenv("API_HOST", raising=False)
        yield
        monkeypatch.delenv("ACH_AUTH_TOKEN", raising=False)
        monkeypatch.delenv("API_HOST", raising=False)

    def test_auth_off_no_token_200(self):
        """1. env kosong/tidak diset → GET 200 tanpa token (regresi auth-off)."""
        # env sudah clean oleh fixture; env_token=None artinya auth mati
        status, body, resp_headers = _req()
        assert status == 200, f"Expected 200 but got {status}"
        assert body["status"] == "success"

    
    def test_401_envelope_code_uNAUTHORIZED(self, monkeypatch):
        """2. auth aktif + tanpa token → 401, body envelope code UNAUTHORIZED.

        Menangkap BUG 3: pastikan body bukan {"title":...} melainkan
        {"status":"error","error":{"code":"UNAUTHORIZED",...}}."""
        import os
        monkeypatch.setenv("ACH_AUTH_TOKEN", "test-token-xyz")

        status, body, resp_headers = _req(env_token="test-token-xyz")
        assert status == 401, f"Expected 401 but got {status}"
        assert body["status"] == "error"
        # Ini menangkap BUG 3: pastikan code adalah UNAUTHORIZED, bukan INTERNAL_ERROR
        assert body["error"]["code"] == "UNAUTHORIZED"
        # CORS header harus ada di respons 401
        headers_dict = dict(
            (h[0].decode("latin-1"), h[1].decode("latin-1")) for h in resp_headers
        )
        assert "access-control-allow-origin" in headers_dict
        assert headers_dict["access-control-allow-origin"] == "http://localhost:5173"

    
    def test_bearer_valid_200(self, monkeypatch):
        """3. auth aktif + Authorization: Bearer <benar> → **200** (menangkap BUG 1)."""
        import os
        monkeypatch.setenv("ACH_AUTH_TOKEN", "secret-bearer-token")

        status, body, resp_headers = _req(
            headers=[(b"authorization", b"Bearer secret-bearer-token")], env_token="secret-bearer-token"
        )
        assert status == 200, f"Expected 200 but got {status}"
        assert body["status"] == "success"

    
    def test_x_auth_token_valid_200(self, monkeypatch):
        """4. auth aktif + header X-Auth-Token: <benar> → 200 (menangkap BUG 1 utk header ke-2)."""
        import os
        monkeypatch.setenv("ACH_AUTH_TOKEN", "secret-x-token")

        status, body, resp_headers = _req(
            headers=[(b"x-auth-token", b"secret-x-token")], env_token="secret-x-token"
        )
        assert status == 200, f"Expected 200 but got {status}"
        assert body["status"] == "success"

    
    def test_query_token_valid_200_no_header(self, monkeypatch):
        """5. auth aktif + ?token=<benar> TANPA header apa pun → **200** (menangkap BUG 2)."""
        import os
        monkeypatch.setenv("ACH_AUTH_TOKEN", "secret-query-token")

        status, body, resp_headers = _req(
            path=b"/api/metrics/storage",
            query_string=b"token=secret-query-token",
            env_token="secret-query-token",
        )
        assert status == 200, f"Expected 200 but got {status}"
        assert body["status"] == "success"

    
    def test_wrong_token_401(self, monkeypatch):
        """6. auth aktif + token salah → 401."""
        import os
        monkeypatch.setenv("ACH_AUTH_TOKEN", "real-secret-token")

        status, body, resp_headers = _req(
            headers=[(b"authorization", b"Bearer wrong-token")], env_token="real-secret-token"
        )
        assert status == 401, f"Expected 401 but got {status}"

    
    def test_non_ascii_token_401_not_500(self, monkeypatch):
        """7. auth aktif + Authorization: Bearer tokén non-ASCII (env token ASCII) → 401 dan BUKAN 500.

        Test ini menggunakan raw ASGI scope sehingga httpx encoding issue
        tidak pernah muncul. Kirim header latin-1 non-ASCII dan pastikan
        middleware membalas 401, bukan 500."""
        import os
        monkeypatch.setenv("ACH_AUTH_TOKEN", "secret-ascii-token")

        # Bangun header non-ASCII di runtime (bukan di source code literal)
        non_ascii_val = "tokén-with-éccents".encode("latin-1")
        status, body, resp_headers = _req(
            headers=[(b"authorization", b"Bearer " + non_ascii_val)], env_token="secret-ascii-token"
        )
        # Harus 401 (token tidak match karena env ASCII vs header latin-1 non-ASCII),
        # dan pastikan status code bukan 500
        assert status == 401, f"Expected 401 but got {status}"
        # Pastikan respons bukan 500 internal error
        assert body["error"]["code"] != "INTERNAL_ERROR", "Should not be INTERNAL_ERROR"

    
    def test_preflight_not_401(self, monkeypatch):
        """8. preflight OPTIONS dengan Origin: http://localhost:5173 + ACRM/ACRH authorization → 200, allow-headers memuat Authorization."""
        import os
        monkeypatch.setenv("ACH_AUTH_TOKEN", "preflight-token")

        status, body, resp_headers = _req(
            method="OPTIONS",
            path=b"/api/actions/fast-op",
            headers=[
                (b"origin", b"http://localhost:5173"),
                (b"access-control-request-method", b"POST"),
                (b"access-control-request-headers", b"authorization"),
            ],
            env_token="preflight-token",
        )
        assert status != 401, f"Preflight should not be 401, got {status}"
        headers_dict = dict(
            (h[0].decode("latin-1"), h[1].decode("latin-1")) for h in resp_headers
        )
        # Preflight response should have access-control-allow-headers containing Authorization
        allow_headers = headers_dict.get("access-control-allow-headers", "")
        assert "authorization" in allow_headers.lower()

    
    def test_guardrail_non_loopback_without_token(self, monkeypatch):
        """9. Guardrail: API_HOST=0.0.0.0 tanpa ACH_AUTH_TOKEN → RuntimeError."""
        import os
        monkeypatch.setenv("API_HOST", "0.0.0.0")
        monkeypatch.delenv("ACH_AUTH_TOKEN", raising=False)

        from api.auth_middleware import validate_startup_host

        with pytest.raises(RuntimeError) as excinfo:
            validate_startup_host()
        assert "non-loopback" in str(excinfo.value).lower()
        assert "ACH_AUTH_TOKEN" in str(excinfo.value)

    def test_guardrail_loopback_without_token_ok(self):
        """10. Guardrail: API_HOST=127.0.0.1 tanpa ACH_AUTH_TOKEN → OK (no error)."""
        # fixture already cleaned ACH_AUTH_TOKEN

        from api.auth_middleware import validate_startup_host
        validate_startup_host()  # should not raise

class TestStartupGuardrail:
    """Guardrail unit: 4-5 kasus kunci (pertahankan dari versi lama)."""

    def test_non_loopback_without_token_raises(self, monkeypatch):
        """non-loopback API_HOST + no ACH_AUTH_TOKEN → RuntimeError."""
        from api.auth_middleware import validate_startup_host

        monkeypatch.setenv("API_HOST", "0.0.0.0")
        monkeypatch.delenv("ACH_AUTH_TOKEN", raising=False)

        with pytest.raises(RuntimeError) as excinfo:
            validate_startup_host()
        assert "non-loopback" in str(excinfo.value).lower()
        assert "ACH_AUTH_TOKEN" in str(excinfo.value)

    def test_loopback_without_token_ok(self, monkeypatch):
        """loopback API_HOST (127.0.0.1) + no ACH_AUTH_TOKEN → no error."""
        from api.auth_middleware import validate_startup_host

        monkeypatch.setenv("API_HOST", "127.0.0.1")
        monkeypatch.delenv("ACH_AUTH_TOKEN", raising=False)

        validate_startup_host()  # should not raise

    def test_loopback_localhost_without_token_ok(self, monkeypatch):
        """localhost API_HOST + no ACH_AUTH_TOKEN → no error."""
        from api.auth_middleware import validate_startup_host

        monkeypatch.setenv("API_HOST", "localhost")
        monkeypatch.delenv("ACH_AUTH_TOKEN", raising=False)

        validate_startup_host()  # should not raise

    def test_non_loopback_with_token_ok(self, monkeypatch):
        """non-loopback API_HOST + ACH_AUTH_TOKEN set → no error."""
        from api.auth_middleware import validate_startup_host

        monkeypatch.setenv("API_HOST", "0.0.0.0")
        monkeypatch.setenv("ACH_AUTH_TOKEN", "some-token")

        validate_startup_host()  # should not raise

    def test_custom_non_loopback_without_token_ok(self, monkeypatch):
        """IPv6 loopback ::1 → bebas tanpa token."""
        from api.auth_middleware import validate_startup_host

        monkeypatch.setenv("API_HOST", "::1")
        monkeypatch.delenv("ACH_AUTH_TOKEN", raising=False)

        validate_startup_host()  # should not raise