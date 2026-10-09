"""Auth token middleware for Adaptive Command Hub Falcon ASGI app.

- Env ACH_AUTH_TOKEN: kosong/tidak diset → auth nonaktif (perilaku identik dengan sekarang).
- Terisi → semua request WALI (wajib) token kecuali OPTIONS (preflight), via:
  header "Authorization: Bearer <token>", ATAU header "X-Auth-Token: <token>",
  ATAU query "?token=<token>" (untuk endpoint ikon dipakai tag <img>).
- Gagal → respons 401 dengan envelope {"status":"error","error":{"code":"UNAUTHORIZED",...}}
  tanpa raise exception (gunakan resp.status + res.media + res.complete = True).
- Tanggapan 401 WAJIB menyertakan header CORS access-control-allow-origin.
- Gunakan hmac.compare_digest(token.encode('utf-8'), auth_token.encode('utf-8'))
  untuk mencegah timing attacks dan TypeError pada non-ASCII.
- Catatan: req.headers dict ASGI key-nya lowercase; gunakan req.get_header() case-insensitive.
  Query params: diambil dari URL (lihat catatan di _get_query_param tentang relativ_url).
"""

import hmac
import os

import falcon

from falcon import asgi


def _is_loopback_host(host: str) -> bool:
    """Cek apakah host adalah loopback (127.0.0.1, localhost, ::1)."""
    normalized = host.strip().lower()
    return normalized in ("127.0.0.1", "localhost", "::1")


def validate_startup_host() -> None:
    """Guardrail: non-loopback host tanpa ACH_AUTH_TOKEN → gagal import.

    Dipanggil di module-level di app.py. Jika host bind bukan loopback (bukan
    127.0.0.1/localhost/::1) AND ACH_AUTH_TOKEN kosong, raise RuntimeError
    dengan pesan jelas. Loopback → bebas tanpa token.
    """
    api_host = os.environ.get("API_HOST", "127.0.0.1").strip()
    ach_auth = os.environ.get("ACH_AUTH_TOKEN", "").strip()

    # Jika host loopback → lewati (bisa tanpa token)
    if _is_loopback_host(api_host):
        return

    # Jika non-loopback AND token tidak tersedia → reject import
    if not ach_auth:
        msg = (
            f"Tidak dapat memulai server: API_HOST='{api_host}' adalah host non-loopback, "
            "tapi ACH_AUTH_TOKEN tidak diset. "
            "Set ACH_AUTH_TOKEN untuk mengaktifkan auth, atau gunakan host loopback."
        )
        raise RuntimeError(msg)


def _get_query_param_from_url(url: str, param: str) -> str:
    """Ambil nilai query param dari URL string (parse manual).
    
    Catatan: di uji dengan URL lengkap seperti '/api/metrics/storage?token=xyz'.
    Beberapa klien ASGI mungkin menyediakan relativ_url kosong; jika demikian,
    coba ambil dari URL lengkap yang diberikan middleware melalui atribut ekstra.
"""
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


class AuthMiddleware:
    """Middleware that enforces optional token-based authentication."""

    def __init__(self, app, allowed_origin: str = "http://localhost:5173"):
        self._app = app
        self._allowed_origin = allowed_origin

    async def process_request(self, req, res):
        """Short-circuit auth check before processing the request.

        If ACH_AUTH_TOKEN is not set, this is a no-op (auth inactive).
        If set, token must be provided via one of three sources;
        comparison uses hmac.compare_digest for constant-time safety.
        OPTIONS preflight requests are skipped (handled by CORS middleware).
        """
        # Skip auth for OPTIONS preflight requests (CORS handles them)
        if req.method == "OPTIONS":
            return

        auth_token = os.environ.get("ACH_AUTH_TOKEN", "").strip()
        if not auth_token:
            # Tidak ada token yang dipakai → lewati (auth nonaktif)
            return

        # Ambil token menggunakan req.get_header (case-insensitive; key ASGI biasanya lowercase)
        # 1. Authorization: Bearer <token>
        auth_header = (req.get_header("Authorization") or "").strip()
        token = None
        if auth_header[:7].lower() == "bearer ":
            token = auth_header[7:].strip()

        # 2. X-Auth-Token: <token>
        if not token:
            x = req.get_header("X-Auth-Token")
            if x and x.strip():
                token = x.strip()

        # 3. Query ?token=<token> (digunakan untuk endpoint ikon <img>)
        #    Ambil dari URL; di ASGI some klien relativ_url kosong,
        #    jadi coba ambil dari url lengkap yang ada di atribut request.
        if not token:
            # Coba relativ_url terlebih dahulu
            url = getattr(req, "relative_url", "") or ""
            if not url:
                # Fallback: coba ambil dari url lengkap jika ada atribut url
                url = getattr(req, "url", "") or ""
            q = _get_query_param_from_url(url, "token") if url else ""
            if q and q.strip():
                token = q.strip()

        # Bandingkan dengan hmac.compare_digest (constant-time, aman ASCII & non-ASCII)
        if token is not None and hmac.compare_digest(
            token.encode("utf-8"), auth_token.encode("utf-8")
        ):
            return  # Token cocok → izinkan request

        # Token salah/missing → respons 401 tanpa raise exception (tidak memicu default handler)
        res.status = falcon.HTTP_401
        res.media = {
            "status": "error",
            "error": {
                "code": "UNAUTHORIZED",
                "message": "Token otorisasi tidak valid atau tidak diberikan",
            },
        }
        res.complete = True  # skip responder pipeline; process_response (CORS) tetap jalan

    async def process_response(self, req, res, resource, params):
        """Pastikan header CORS access-control-allow-origin selalu ada di respons 401."""
        res.set_header("Access-Control-Allow-Origin", self._allowed_origin)