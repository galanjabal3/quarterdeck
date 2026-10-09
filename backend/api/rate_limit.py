"""Rate limit middleware for Quarterdeck Falcon ASGI app.

- Menggunakan sliding window 60 detik per client IP.
- Konfigurasi env `QD_RATE_LIMIT_PER_MIN` dibaca PER REQUEST.
- Bisa dinonaktifkan lewat `QD_RATE_LIMIT_PER_MIN=0`.
- Response 429 beserta envelope error + header `Retry-After`.
- Dijalankan SEBELUM AuthMiddleware agar brute-force token ikut terhitung limit.
- Skip `OPTIONS` (preflight ditangani CORS).

Store in-memory per proses: dict `{ip: deque[float]}` berisi timestamp dari `now()`.
Batas memori 4096 key; key tertua otomatis dibuang jika jumlah key melebihi.

Modul-level `now()` dan `_limit_per_min()` WAJIB untuk memungkinkan monkeypatch
dalam test (test tidak perlu sleep 60 detik).

Store module-level (_rate_limit_store) dapat dibersihkan antar test via
`rate_limit.clear_store()`.
"""

import os
import time
from collections import deque

import falcon

from api.cors_origins import resolve_acao

# Batas jumlah key di store (mitigasi memori bila banyak IP berbeda).
_MAX_STORE_KEYS = 4096

# Module-level store: {ip_address: deque[timestamps]}
# Digunakan oleh semua instance RateLimitMiddleware yang dibuat setelah impor ini.
# Dapat dibersihkan dengan rate_limit.clear_store().
_rate_limit_store: dict[str, deque[float]] = {}


def now() -> float:
    """Return monotonic time. Module-level so tests can monkeypatch."""
    return time.monotonic()


def _limit_per_min() -> int:
    """Baca env QD_RATE_LIMIT_PER_MIN dengan aturan:

    - Unset / kosong → 300
    - "0" → 0 (artinya DISABLED)
    - String tidak valid/minus/bukan int → 300
    - Selainnya → int(value)
    """
    raw = os.environ.get("QD_RATE_LIMIT_PER_MIN")
    if raw is None or raw.strip() == "":
        return 300
    # "0" → 0 (disabled)
    try:
        val = int(raw)
    except (ValueError, TypeError):
        # string tidak valid → fallback ke default
        return 300
    if val < 0:
        # minus → fallback ke default
        return 300
    return val


def clear_store():
    """Bersihkan store rate limit antar test.

    Mengosongkan dict module-level _rate_limit_store sehingga test
    tidak memengaruhi test lainnya melalui state lama.
    dengan cara membersihkan dict in-place agar referensi di middleware
    tetap valid.
    """
    global _rate_limit_store
    _rate_limit_store.clear()


class RateLimitMiddleware:
    """Middleware that enforces per-IP rate limiting via sliding window.

    Parameters
    ----------
    app : falcon.asgi.App
        The Falcon ASGI application.
        Nilai ACAO mengikuti allowlist di api/cors_origins (localhost &
        127.0.0.1; override env QD_ALLOWED_ORIGINS).
    """

    def __init__(self, app):
        self._app = app
        # Gunakan store module-level untuk berbagi state antar instance
        self._store = _rate_limit_store

    async def process_request(self, req, res):
        """Enforce rate limit before auth.

        - Skip OPTIONS (preflight handled by CORS).
        - If limit is 0 (disabled), do nothing (no-op).
        - Prune old timestamps from the sliding window.
        - Enforce limit per client IP.
        - If over limit: return 429 with Retry-After header, do NOT append timestamp.
        - If under limit: append current timestamp, continue to auth.
        """
        # Skip OPTIONS preflight (CORS handles it)
        if req.method == "OPTIONS":
            return

        # Baca konfigurasi limit per menit
        limit = _limit_per_min()
        # Jika limit 0 → fully disabled, no-op
        if limit == 0:
            return

        # Key client IP
        client_ip = getattr(req, "remote_addr", None) or "unknown"

        # Batas memori: jika key BARU dan store sudah penuh, buang key tertua
        # (urutan insert dict = yang paling awal masuk).
        if client_ip not in self._store and len(self._store) >= _MAX_STORE_KEYS:
            self._store.pop(next(iter(self._store)))

        # Ambil deque untuk IP ini (buat baru jika belum ada)
        ip_entries = self._store.setdefault(client_ip, deque())

        # Prune timestamp lama: keluar semua yang <= now - 60
        now_val = now()
        while ip_entries and ip_entries[0] <= now_val - 60:
            ip_entries.popleft()

        # Jika setelah prune, jumlah melebihi limit → tolak
        if len(ip_entries) >= limit:
            # Hitung Retry-After: ceil(60 - (now - timestamp terlama))
            # timestamp terlama = ip_entries[0] (terkecil = paling tua setelah prune)
            oldest = ip_entries[0]
            retry_after = int((60 - (now_val - oldest)) + 0.999)  # ceiling effect
            if retry_after < 1:
                retry_after = 1

            res.status = falcon.HTTP_429
            res.media = {
                "status": "error",
                "error": {
                    "code": "RATE_LIMITED",
                    "message": f"Terlalu banyak request. Batas {limit} request per menit per IP.",
                },
            }
            res.complete = True
            res.set_header("Retry-After", str(retry_after))
            # JANGAN tambahkan timestamp ke deque saat ditolak
            return

        # Di bawah limit → catat timestamp dan lanjut (ke auth)
        ip_entries.append(now_val)

    async def process_response(self, req, res, resource, params):
        """Pastikan header CORS access-control-allow-origin selalu ada.

        Nilai ACAO mengikuti allowlist (localhost & 127.0.0.1) — echo origin
        pengguna bila diizinkan, tanpa header bila tidak (lihat cors_origins).
        """
        acao = resolve_acao(req)
        if acao:
            res.set_header("Access-Control-Allow-Origin", acao)