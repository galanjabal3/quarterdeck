"""Allowlist origin CORS untuk Quarterdeck.

Masalah yang dipecahkan: frontend dapat dibuka lewat DUA hostname yang
sama-sama valid untuk dev server yang di-bind ke 127.0.0.1:

    http://localhost:5173   (default Vite / yang dibuka browser)
    http://127.0.0.1:5173   (URL yang dicetak Vite di terminal)

Dulu hanya `localhost:5173` yang di-hardcode, sehingga membuka lewat
`127.0.0.1:5173` membuat SEMUA request diblokir CORS (respons 200 OK
dari server tetap tidak boleh dibaca browser).

Aturan:
- Tanpa header Origin (curl, test, server-to-server) -> kirim nilai
  fallback historis `http://localhost:5173` (perilaku header selalu ada).
- Origin ada di allowlist -> ECHO origin itu (wajib persis, aturan CORS).
- Origin ada TAPI tidak di allowlist -> JANGAN kirim header ACAO sama
  sekali (browser memblokir dengan benar).

Allowlist default: kedua varian hostname di atas. Bisa dioverride lewat
env `QD_ALLOWED_ORIGINS` (dipisah koma), misal:
    QD_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.7:5173"
"""

import os

DEFAULT_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
FALLBACK_ORIGIN = "http://localhost:5173"


def allowed_origins() -> set[str]:
    """Allowlist origin: env QD_ALLOWED_ORIGINS (koma) atau default."""
    raw = os.environ.get("QD_ALLOWED_ORIGINS", "").strip()
    if raw:
        return {o.strip() for o in raw.split(",") if o.strip()}
    return set(DEFAULT_ORIGINS)


def resolve_acao(req) -> str | None:
    """Nilai header Access-Control-Allow-Origin untuk request ini, atau None.

    None berarti: JANGAN kirim header ACAO (origin tidak diizinkan).
    """
    origin = (req.get_header("Origin") or "").strip()
    if not origin:
        # Permintaan tanpa Origin -> pertahankan nilai historis agar
        # header CORS tetap ada untuk curl/test (bukan untuk browser).
        return FALLBACK_ORIGIN
    return origin if origin in allowed_origins() else None
