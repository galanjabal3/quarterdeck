"""Falcon + CORS ASGI, port 8000"""

import asyncio
import os
import logging

import falcon
from falcon import asgi

from api.auth_middleware import AuthMiddleware, validate_startup_host

# Jalankan validasi guardrail saat import module.
# Jika kondisinya gagal (non-loopback tanpa token), RuntimeError akan dilempar
# sebelum app diciptakan, mencegah server berjalan dengan konfigurasi yang tidak aman.
validate_startup_host()

from api.actions import (
    launch_action,
    scan_installed_apps,
    AppIconResource,
    _find_app_path,
    _sanitize_app_name,
    _get_icon_path,
    _convert_icns_to_png,
    ICON_CACHE_DIR,
    APP_NAME_PATTERN,
    FastOpsActionsResource,
    FastOpResource,
)
from api.metrics import get_storage_metrics, get_ram_metrics, get_cpu_metrics
from api.actions import FastOpsActionsResource, FastOpResource
from api.system_processes import get_system_processes, SystemProcessesResource

logger = logging.getLogger(__name__)


class CorsMiddleware:
    """Middleware that adds CORS headers to all responses."""

    def __init__(self, app, allowed_origin: str = "http://localhost:5173"):
        self._app = app
        self._allowed_origin = allowed_origin

    async def process_response(self, req, res, resource, params):
        # Add CORS headers to ALL responses (including OPTIONS preflights)
        res.set_header("Access-Control-Allow-Origin", self._allowed_origin)
        res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        res.set_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Auth-Token",
        )


async def error_handler_json(req, resp, ex, params):
    """Centralized error handler that returns JSON error responses.

    Ensures all errors return {"status":"error","error":{"code":...,"message":...}}
    instead of HTML error pages. Must be async for ASGI compatibility.
    """
    # Log the full exception details to server log (not to client)
    logger.error(
        f"Exception {type(ex).__name__}: {ex}",
        exc_info=True,
    )

    # Determine HTTP status code from exception
    status = falcon.HTTP_500
    code = "INTERNAL_ERROR"
    # Gunakan pesan generik untuk klien — jangan pernah exposit str(ex) mentah
    client_message = "Terjadi kesalahan internal"

    # Handle HTTPNotFound (404) — must be before generic checks
    if isinstance(ex, falcon.HTTPNotFound):
        status = falcon.HTTP_404
        code = "NOT_FOUND"
        client_message = "Endpoint tidak ditemukan"

    # Handle HTTPMethodNotAllowed (405)
    elif isinstance(ex, falcon.HTTPMethodNotAllowed):
        status = falcon.HTTP_405
        code = "METHOD_NOT_ALLOWED"
        client_message = "Method tidak diizinkan untuk endpoint ini"

    # Handle HTTPUnauthorized (401) dari auth middleware — pastikan envelope
    # {"status":"error","error":{"code":"UNAUTHORIZED",...}} tidak bocor ke 500.
    elif isinstance(ex, falcon.HTTPUnauthorized):
        status = falcon.HTTP_401
        code = "UNAUTHORIZED"
        client_message = ex.description if hasattr(ex, "description") else "Token otorisasi tidak valid atau tidak diberikan"

    # Handle known exception types (fallback for other errors)
    else:
        if hasattr(ex, "status_code"):
            status = ex.status_code
        if hasattr(ex, "code"):
            code = ex.code
        if hasattr(ex, "description"):
            client_message = ex.description

    # For psutil or metrics errors, use specific code
    if "METRICS_UNAVAILABLE" in str(ex).upper():
        code = "METRICS_UNAVAILABLE"

    # Build standardized error response
    error_response = {
        "status": "error",
        "error": {
            "code": code,
            "message": client_message,
        },
    }

    resp.status = status
    resp.media = error_response


class MetricsStorageResource:
    """GET /api/metrics/storage"""

    async def on_get(self, req, res):
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, get_storage_metrics)
        res.status = falcon.HTTP_200
        res.media = result

    async def on_options(self, req, res):
        res.status = falcon.HTTP_200


class MetricsRAMResource:
    """GET /api/metrics/ram"""

    async def on_get(self, req, res):
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, get_ram_metrics)
        res.status = falcon.HTTP_200
        res.media = result

    async def on_options(self, req, res):
        res.status = falcon.HTTP_200


class MetricsCPUResource:
    """GET /api/metrics/cpu"""

    async def on_get(self, req, res):
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, get_cpu_metrics)
        res.status = falcon.HTTP_200
        res.media = result

    async def on_options(self, req, res):
        res.status = falcon.HTTP_200


class LaunchGameResource:
    """POST /api/actions/launch-game"""

    async def on_post(self, req, res):
        body = {}
        try:
            body = await req.media
        except Exception:
            # Invalid JSON or unsupported content-type; treat as empty body
            # This prevents crashes and falls through to whitelist check → 400
            body = {}

        if not isinstance(body, dict):
            body = {}

        action = body.get("action", "") if isinstance(body, dict) else ""
        target = body.get("target", "") if isinstance(body, dict) else ""

        # --- Type validation: action and target must be strings ---
        if not isinstance(action, str):
            error_response = {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Nama aksi harus berupa teks",
                },
            }
            res.status = falcon.HTTP_400
            res.media = error_response
            return

        if not isinstance(target, str):
            error_response = {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Target harus berupa teks",
                },
            }
            res.status = falcon.HTTP_400
            res.media = error_response
            return

        result, status_code = launch_action(action, target)

        res.status = status_code
        res.media = result

    async def on_options(self, req, res):
        res.status = falcon.HTTP_200


class AppsResource:
    """GET /api/actions/apps"""

    async def on_get(self, req, res):
        apps = scan_installed_apps()
        data = {
            "apps": apps,
            "count": len(apps),
        }
        res.media = {
            "status": "success",
            "data": data,
        }
        res.status = falcon.HTTP_200

    async def on_options(self, req, res):
        res.status = falcon.HTTP_200


class AppIconResource:
    """GET /api/actions/app-icon"""

    async def on_get(self, req, res):
        # Extract name from query parameter
        name = req.get_param("name") or ""
        if not name:
            error_response = {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Nama aplikasi tidak valid",
                },
            }
            res.status = falcon.HTTP_400
            res.media = error_response
            return

        # 1. Validate name using same rules as launch
        if not APP_NAME_PATTERN.match(name):
            error_response = {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Nama aplikasi tidak valid",
                },
            }
            res.status = falcon.HTTP_400
            res.media = error_response
            return

        # Exact match with scan_installed_apps
        app_names = [app["name"] for app in scan_installed_apps()]
        if name not in app_names:
            error_response = {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Aksi atau target tidak dikenali",
                },
            }
            res.status = falcon.HTTP_400
            res.media = error_response
            return

        # 2. Find app path
        app_path, display_name = _find_app_path(name)
        if app_path is None:
            error_response = {
                "status": "error",
                "error": {
                    "code": "ICON_NOT_FOUND",
                    "message": "Ikon tidak tersedia",
                },
            }
            res.status = falcon.HTTP_404
            res.content_type = "application/json"
            res.media = error_response
            return

        # Security guard: verify app_path is inside known safe directories
        # Use app_path directly (not realpath) to handle macOS cryptex/symlinks
        # e.g. /Applications/Safari.app resolves to cryptex realpath, but the
        # constructed path already contains the correct prefix.
        known_prefixes = [
            "/Applications",
            "/System/Applications",
            os.path.join(os.path.expanduser("~"), "Applications"),
        ]
        is_valid_prefix = any(app_path.startswith(p) for p in known_prefixes)
        # Also allow cryptex-resolved macOS paths as fallback
        if not is_valid_prefix:
            cryptex_prefix = "/System/Volumes/Preboot/Cryptexes"
            if app_path.startswith(cryptex_prefix):
                is_valid_prefix = True
        if not is_valid_prefix:
            logger.warning(f"Invalid app path detected: {app_path}")
            error_response = {
                "status": "error",
                "error": {
                    "code": "ICON_NOT_FOUND",
                    "message": "Ikon tidak tersedia",
                },
            }
            res.status = falcon.HTTP_404
            res.content_type = "application/json"
            res.media = error_response
            return

        # 3. Determine sanitized name for cache
        sanitized_name = _sanitize_app_name(name)
        cache_filename = f"{sanitized_name}.png"
        cache_path = os.path.join(ICON_CACHE_DIR, cache_filename)

        # Ensure cache directory exists
        os.makedirs(ICON_CACHE_DIR, exist_ok=True)

        # 4. Check cache
        if os.path.isfile(cache_path):
            # Serve cached PNG
            res.content_type = "image/png"
            res.status = falcon.HTTP_200
            with open(cache_path, "rb") as f:
                res.data = f.read()
            return

        # 5. Get icon path from plist
        icns_path = _get_icon_path(app_path)
        if icns_path is None or not os.path.isfile(icns_path):
            # Fallback 404
            logger.warning(f"No icon found for app: {name}")
            error_response = {
                "status": "error",
                "error": {
                    "code": "ICON_NOT_FOUND",
                    "message": "Ikon tidak tersedia",
                },
            }
            res.status = falcon.HTTP_404
            res.content_type = "application/json"
            res.media = error_response
            return

        # Guard: verify icon (icns) is inside the app bundle to prevent
        # path traversal outside the .app package. Use realpath to handle
        # symlinks/cryptex, checking that the resolved icon path is within
        # the resolved app bundle directory.
        real_app = os.path.realpath(app_path)
        real_icns = os.path.realpath(icns_path)
        try:
            if os.path.commonpath([real_icns, real_app]) != real_app:
                logger.warning(
                    f"Icon path outside app bundle: icns={real_icns}, app={real_app}"
                )
                error_response = {
                    "status": "error",
                    "error": {
                        "code": "ICON_NOT_FOUND",
                        "message": "Ikon tidak tersedia",
                    },
                }
                res.status = falcon.HTTP_404
                res.content_type = "application/json"
                res.media = error_response
                return
        except ValueError:
            # Paths on different filesystems (e.g. Windows drives)
            pass

        # 6. Convert icns to png
        conversion_ok = _convert_icns_to_png(icns_path, cache_path)
        if not conversion_ok:
            logger.error(f"Failed to convert icns to png for {name}")
            error_response = {
                "status": "error",
                "error": {
                    "code": "ICON_NOT_FOUND",
                    "message": "Ikon tidak tersedia",
                },
            }
            res.status = falcon.HTTP_404
            res.content_type = "application/json"
            res.media = error_response
            return

        # 7. Serve PNG
        res.content_type = "image/png"
        res.status = falcon.HTTP_200
        with open(cache_path, "rb") as f:
            res.data = f.read()


# Create Falcon ASGI app
app = falcon.asgi.App()

# Add CORS middleware (must be added before routes)
cors = CorsMiddleware(app)
app.add_middleware(cors)

# Add auth token middleware (optional; inactive if QD_AUTH_TOKEN not set)
auth = AuthMiddleware(app)
app.add_middleware(auth)

# Add specific error handlers for 404/405 BEFORE the generic Exception handler
# so they take precedence (Falcon checks handlers in registration order;
# since HTTPNotFound/HTTPMethodNotAllowed are subclasses of Exception,
# they must be registered first to be matched first).
app.add_error_handler(falcon.HTTPNotFound, error_handler_json)
app.add_error_handler(falcon.HTTPMethodNotAllowed, error_handler_json)

# Add centralized JSON error handler for all other exceptions
app.add_error_handler(Exception, error_handler_json)

# Register routes (no separate /api/options route; OPTIONS handled per-resource)
app.add_route("/api/metrics/storage", MetricsStorageResource())
app.add_route("/api/metrics/ram", MetricsRAMResource())
app.add_route("/api/metrics/cpu", MetricsCPUResource())
app.add_route("/api/actions/launch-game", LaunchGameResource())
app.add_route("/api/actions/apps", AppsResource())
app.add_route("/api/actions/app-icon", AppIconResource())
app.add_route("/api/actions/fast-ops", FastOpsActionsResource())
app.add_route("/api/actions/fast-op", FastOpResource())
app.add_route("/api/system/processes", SystemProcessesResource())