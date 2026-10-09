"""CORS origin allowlist tests for Quarterdeck.

Membuktikan perbaikan bug: frontend yang dibuka lewat http://127.0.0.1:5173
(dicetak Vite di terminal) sebelumnya DIBLOKIR CORS karena hanya
http://localhost:5173 yang di-hardcode. Sekarang kedua varian hostname
di-allowlist, dengan echo origin (bukan nilai statis).

Pola memakai raw ASGI scope seperti test_rate_limit/test_auth.
"""

import asyncio
import json
import os

import pytest

from app import app as _app  # noqa: F401  (memastikan app ter-import & guardrail jalan)


def _request(method="GET", path="/api/metrics/cpu", origin=None):
    """Panggil app ASGI langsung; return (status:int, headers:list)."""
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 9999),
        "headers": [(b"origin", origin.encode())] if origin else [],
        "extensions": {},
        "transport": None,
    }
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    asyncio.run(_app(scope, receive, send))
    start = next((m for m in messages if m["type"] == "http.response.start"), None)
    assert start is not None, "tidak ada response start"
    return start["status"], start.get("headers", [])


def _acao(headers):
    for name, value in headers:
        if name.decode("latin-1").lower() == "access-control-allow-origin":
            return value.decode("latin-1")
    return None


class TestCorsOriginAllowlist:
    """Allowlist: localhost & 127.0.0.1 di-echo; origin lain tanpa header."""

    @pytest.fixture(autouse=True)
    def _clean_env(self):
        os.environ.pop("QD_ALLOWED_ORIGINS", None)
        yield
        os.environ.pop("QD_ALLOWED_ORIGINS", None)

    def test_localhost_origin_echoed(self):
        """Origin http://localhost:5173 -> ACAO di-echo persis."""
        status, headers = _request(origin="http://localhost:5173")
        assert status == 200
        assert _acao(headers) == "http://localhost:5173"

    def test_loopback_ip_origin_echoed(self):
        """Origin http://127.0.0.1:5173 -> ACAO di-echo (INI BUG YANG DIPERBAIKI)."""
        status, headers = _request(origin="http://127.0.0.1:5173")
        assert status == 200
        assert _acao(headers) == "http://127.0.0.1:5173"

    def test_preflight_from_loopback_ip_ok(self):
        """OPTIONS preflight dari 127.0.0.1 -> 200 + ACAO benar."""
        status, headers = _request(method="OPTIONS", origin="http://127.0.0.1:5173")
        assert status == 200
        assert _acao(headers) == "http://127.0.0.1:5173"

    def test_unknown_origin_denied(self):
        """Origin asing -> respons TANPA header ACAO (browser memblokir)."""
        status, headers = _request(origin="http://evil.example.com")
        assert status == 200  # server tetap memproses; browser yang menolak
        assert _acao(headers) is None

    def test_no_origin_falls_back(self):
        """Tanpa Origin (curl/test) -> header historis tetap dikirim."""
        status, headers = _request(origin=None)
        assert status == 200
        assert _acao(headers) == "http://localhost:5173"

    def test_env_override_allowlist(self):
        """QD_ALLOWED_ORIGINS mengganti default: origin custom di-echo,
        varian default tidak lagi diizinkan."""
        os.environ["QD_ALLOWED_ORIGINS"] = "http://192.168.1.7:5173"
        _, headers = _request(origin="http://192.168.1.7:5173")
        assert _acao(headers) == "http://192.168.1.7:5173"
        _, headers = _request(origin="http://127.0.0.1:5173")
        assert _acao(headers) is None
