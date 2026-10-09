"""OS Actions endpoint: /api/actions/launch-game"""

import subprocess
import logging
import os
import re
import plistlib
import falcon

logger = logging.getLogger(__name__)

# Base directory for cleanup operations (demo cache folder)
CLEANUP_BASE_DIR = "/tmp/qd-demo-cache"

# Cached scanned apps
_scanned_apps_cache = None


def scan_installed_apps():
    """Scan supported Applications directories and return list of app dicts.
    Cached after first call."""
    global _scanned_apps_cache
    if _scanned_apps_cache is not None:
        return _scanned_apps_cache

    apps = []
    sources = [
        ("/Applications", "/Applications"),
        ("/System/Applications", "/System/Applications"),
    ]
    home = os.path.expanduser("~")
    user_apps = os.path.join(home, "Applications")
    if os.path.isdir(user_apps):
        sources.append((user_apps, "~/Applications"))
    utilities = os.path.join("/System/Applications", "Utilities")
    if os.path.isdir(utilities):
        sources.append((utilities, "/System/Applications/Utilities"))

    for src_dir, src_name in sources:
        try:
            entries = os.listdir(src_dir)
        except OSError:
            continue
        for entry in entries:
            if not entry.endswith(".app"):
                continue
            app_path = os.path.join(src_dir, entry)
            if not os.path.isdir(app_path):
                continue

            # Name = folder name (basename .app tanpa ekstensi)
            # Alias/display name = CFBundleName dari Info.plist
            name = entry[:-4]  # remove .app suffix

            bundle_id = None
            display_name = None
            info_plist_path = os.path.join(app_path, "Contents", "Info.plist")
            if os.path.isfile(info_plist_path):
                try:
                    with open(info_plist_path, "rb") as f:
                        plist = plistlib.load(f)
                    bundle_id = plist.get("CFBundleIdentifier")
                    display_name = plist.get("CFBundleName")
                except Exception:
                    bundle_id = None
                    display_name = None

            apps.append({
                "name": name,
                "display_name": display_name,
                "bundle_id": bundle_id,
                "source": src_name,
            })

    # Dedup by name (case-sensitive, keep first occurrence)
    seen = set()
    deduped = []
    for app in apps:
        key = app["name"]
        if key not in seen:
            seen.add(key)
            deduped.append(app)
    apps = deduped

    # Sort by name A->Z (case-insensitive sort)
    apps.sort(key=lambda a: a["name"].lower())

    _scanned_apps_cache = apps
    return apps


def get_scanned_app_names():
    """Return list of app display names from the scanned cache."""
    return [app["name"] for app in scan_installed_apps()]


# Regex: hanya alfanumerik, spasi, titik, underscore, dash
APP_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9 ._-]+$')


def _validate_app_target(target: str) -> bool:
    """Validate target name against security rules.
    Returns True if target is allowed, False otherwise."""
    # 1. Regex check: only allowed characters
    if not APP_NAME_PATTERN.match(target):
        return False
    # 2. No path separator
    if '/' in target or '..' in target:
        return False
    # 3. Cannot start with '-'
    if target.startswith('-'):
        return False
    # 4. Must exactly match (case-insensitive) a scanned app name
    #    OR alias (display_name / CFBundleName) for backward compatibility
    app_names = []
    display_names = []
    for app in scan_installed_apps():
        app_names.append(app["name"])
        if app.get("display_name"):
            display_names.append(app["display_name"])
    all_names = app_names + display_names
    lower_names = [n.lower() for n in all_names]
    if target.lower() not in lower_names:
        return False
    return True


# Whitelisted actions and their allowed targets.
# For "launch-game": targets are checked against old whitelist first (backward compat),
# then dynamic validation against scanned apps.
# For "cleanup": targets must match whitelist keys exactly.
ACTION_WHITELIST = {
    "launch-game": {
        "safari":     ["open", "-a", "Safari"],
        "chrome":     ["open", "-a", "Google Chrome"],
        "spotify":    ["open", "-a", "Spotify"],
        "vscode":     ["open", "-a", "Visual Studio Code"],
        "telegram":   ["open", "-a", "Telegram"],
        "whatsapp":   ["open", "-a", "WhatsApp"],
        "docker":     ["open", "-a", "Docker"],
        "insomnia":   ["open", "-a", "Insomnia"],
        "calculator": ["open", "-a", "Calculator"],
    },
    "cleanup": {
        "temp-files": None,
        "cache":      None,
    },
}


# Reverse lookup: target -> (action, argv_or-none) — kept for cleanup compatibility
TARGET_WHITELIST = {}
for action, targets in ACTION_WHITELIST.items():
    for target, argv in targets.items():
        TARGET_WHITELIST[target] = (action, argv)


def _ensure_cleanup_dir():
    """Buat folder /tmp/qd-demo-cache jika belum ada."""
    os.makedirs(CLEANUP_BASE_DIR, exist_ok=True)


def _generate_demo_files():
    """Buat beberapa file demo di dalam folder cleanup base dir agar efeknya terlihat nyata."""
    _ensure_cleanup_dir()
    created = []
    for i in range(5):
        filepath = os.path.join(CLEANUP_BASE_DIR, f"demo_file_{i}.txt")
        if not os.path.exists(filepath):
            with open(filepath, "w") as f:
                f.write(f"Demo file {i}\n")
            created.append(filepath)
    return created


def _validate_path_is_demo_cache(path: str) -> bool:
    """Guard path: os.path.realpath hasil wajib berada di dalam /tmp/qd-demo-cache."""
    real_path = os.path.realpath(path)
    real_base = os.path.realpath(CLEANUP_BASE_DIR)
    try:
        common = os.path.commonpath([real_path, real_base])
        return common == real_base
    except ValueError:
        return False


def launch_action(action: str, target: str):
    """Execute a whitelisted action via subprocess or safe file ops.

    Returns (dict, int) — (response dict, HTTP status code).
    """

    # --- Validasi action whitelist ---
    action_targets = ACTION_WHITELIST.get(action)
    if action_targets is None:
        return {
            "status": "error",
            "error": {
                "code": "ACTION_NOT_ALLOWED",
                "message": "Aksi atau target tidak dikenali",
            },
        }, 400

# --- Validasi target: cek whitelist lama untuk pilihan argv ---
    old_targets = ACTION_WHITELIST.get("launch-game", {})
    target_lower = target.lower()
    old_key_match = None
    for k in old_targets:
        if k.lower() == target_lower:
            old_key_match = k
            break

# --- Validasi target whitelist (case-insensitive) ---
    # Untuk launch-game: terima jika di whitelist lama ATAU jika valid dinamis (name/alias)
    # Untuk action lain: tetap strictly whitelist
    action_targets = ACTION_WHITELIST.get(action, {})
    lower_keys = {k.lower() for k in action_targets}

    if action == "launch-game":
        # Terima jika di whitelist lama ATAU jika valid dinamis (termasuk alias CFBundleName)
        dynamic_valid = _validate_app_target(target)
        if not (target.lower() in lower_keys or dynamic_valid):
            return {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Aksi atau target tidak dikenali",
                },
            }, 400
    else:
        if target.lower() not in lower_keys:
            return {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Aksi atau target tidak dikenali",
                },
            }, 400

    # --- Jalankan berdasarkan tipe action ---
    if action == "launch-game":
        # Ambil argv dari whitelist lama jika target ditemukan kunci lama
        if old_key_match is not None:
            argv = old_targets[old_key_match]
            try:
                logger.info(f"Executing command: {argv}")
                result = subprocess.run(
                    argv,
                    shell=False,
                    timeout=30,
                    capture_output=True,
                    text=True,
                )
                # Clean stderr: remove control chars, truncate, safe for JSON/UI
                stderr_raw = result.stderr or ""
                stderr_clean = re.sub(r'[\x00-\x1f\x7f]', '', stderr_raw) if isinstance(stderr_raw, str) else ""
                stderr_potong = stderr_clean.replace('\n', ' ').replace('\r', ' ')[:200]
                return {
                    "status": "success",
                    "data": {
                        "action": action,
                        "target": target,
                        "message": "Perintah dijalankan",
                        "exit_code": result.returncode,
                        "stderr": stderr_potong,
                    },
                }, 200
            except subprocess.TimeoutExpired:
                logger.warning(f"Subprocess timeout for {action} {target}")
                return {
                    "status": "error",
                    "error": {
                        "code": "ACTION_TIMEOUT",
                        "message": "Aksi melebihi batas waktu 30 detik",
                    },
                }, 500
            except Exception as e:
                logger.error(f"Subprocess error: {e}")
                return {
                    "status": "error",
                    "error": {
                        "code": "ACTION_EXECUTION_ERROR",
                        "message": str(e),
                    },
                }, 500

        # Not in old whitelist — use dynamic target with ["open", "-a", target]
        argv = ["open", "-a", target]
        try:
            logger.info(f"Executing command: {argv}")
            result = subprocess.run(
                argv,
                shell=False,
                timeout=30,
                capture_output=True,
                text=True,
            )
# Clean stderr: remove control chars, truncate, safe for JSON/UI
            stderr_raw = result.stderr or ""
            stderr_clean = re.sub(r'[\x00-\x1f\x7f]', '', stderr_raw) if isinstance(stderr_raw, str) else ""
            stderr_potong = stderr_clean.replace('\n', ' ').replace('\r', ' ')[:200]
            return {
                "status": "success",
                "data": {
                    "action": action,
                    "target": target,
                    "message": "Perintah dijalankan",
                    "exit_code": result.returncode,
                    "stderr": stderr_potong,
                },
            }, 200
        except subprocess.TimeoutExpired:
            logger.warning(f"Subprocess timeout for {action} {target}")
            return {
                "status": "error",
                "error": {
                    "code": "ACTION_TIMEOUT",
                    "message": "Aksi melebihi batas waktu 30 detik",
                },
            }, 500
        except Exception as e:
            logger.error(f"Subprocess error: {e}")
            return {
                "status": "error",
                "error": {
                    "code": "ACTION_EXECUTION_ERROR",
                    "message": str(e),
                },
            }, 500

    elif action == "cleanup":
        # ---- CLEANUP: operasi file AMAN di dalam /tmp/qd-demo-cache ----
        _ensure_cleanup_dir()
        _generate_demo_files()

        removed_count = 0

        if target == "temp-files":
            # Hapus file-file demo tipe demo_file_0.txt s.d. demo_file_4.txt
            for i in range(5):
                filepath = os.path.join(CLEANUP_BASE_DIR, f"demo_file_{i}.txt")
                if os.path.exists(filepath) and _validate_path_is_demo_cache(filepath):
                    os.remove(filepath)
                    removed_count += 1
            # Coba hapus file tambahan
            for i in range(5, 10):
                filepath = os.path.join(CLEANUP_BASE_DIR, f"temp_{i}.txt")
                if os.path.exists(filepath) and _validate_path_is_demo_cache(filepath):
                    os.remove(filepath)
                    removed_count += 1

        elif target == "cache":
            # Hapus semua file di dalam folder demo cache
            if os.path.exists(CLEANUP_BASE_DIR):
                for item in os.listdir(CLEANUP_BASE_DIR):
                    item_path = os.path.join(CLEANUP_BASE_DIR, item)
                    # Validasi path sebelum hapus
                    if _validate_path_is_demo_cache(item_path):
                        if os.path.isfile(item_path) or os.path.islink(item_path):
                            os.remove(item_path)
                            removed_count += 1
                        elif os.path.isdir(item_path):
                            import shutil
                            shutil.rmtree(item_path)
                            removed_count += 1

        # Return response dengan files_removed dan path
        return {
            "status": "success",
            "data": {
                "action": action,
                "target": target,
                "message": "Perintah dieksekusi",
                "exit_code": 0,
                "files_removed": removed_count,
                "path": CLEANUP_BASE_DIR,
            },
        }, 200

    # Fallback jika action tak dikenali (seharusnya sudah ditangkap oleh validasi di atas)
    return {
        "status": "error",
        "error": {
            "code": "ACTION_EXECUTION_ERROR",
            "message": "Aksi tak dikenal",
        },
    }, 500


# --- Icon endpoint support ---

import hashlib as _hashlib
import os as _os
import plistlib as _plistlib
import subprocess as _subprocess
import logging as _logging

logger = _logging.getLogger(__name__)

ICON_CACHE_DIR = "/tmp/qd-icon-cache"


def _sanitize_app_name(name: str) -> str:
    """Buat cache key dari nama app menggunakan hash sha256."""
    return _hashlib.sha256(name.encode("utf-8")).hexdigest()


def _find_app_path(name: str):
    """Cari path .app untuk nama yang sudah divalidasi.
    Return (app_path, display_name) atau (None, None)."""
    # Verify exact match with scanned apps
    app_names = [app["name"] for app in _scan_installed_apps()]
    if name not in app_names:
        return None, None

    app_folder = name + ".app"

    search_paths = [
        "/Applications",
        "/System/Applications",
        "/System/Applications/Utilities",
    ]
    home = _os.path.expanduser("~")
    search_paths.append(_os.path.join(home, "Applications"))

    for base in search_paths:
        candidate = _os.path.join(base, app_folder)
        if _os.path.isdir(candidate):
            info_path = _os.path.join(candidate, "Contents", "Info.plist")
            if _os.path.isfile(info_path):
                try:
                    with open(info_path, "rb") as f:
                        plist = _plistlib.load(f)
                    display_name = plist.get("CFBundleName")
                except Exception:
                    display_name = None
                return candidate, display_name
            return candidate, None

    home_candidate = _os.path.join(home, "Applications", app_folder)
    if _os.path.isdir(home_candidate):
        info_path = _os.path.join(home_candidate, "Contents", "Info.plist")
        if _os.path.isfile(info_path):
            try:
                with open(info_path, "rb") as f:
                    plist = _plistlib.load(f)
                display_name = plist.get("CFBundleName")
            except Exception:
                display_name = None
            return home_candidate, display_name

    return None, None


def _scan_installed_apps():
    """Wrapper to scan apps (cached)."""
    from api.actions import scan_installed_apps
    return scan_installed_apps()


def _get_icon_path(app_path: str):
    """Baca CFBundleIconFile dari Info.plist, tentukan path .icns.
    Return path ke file .icns atau None."""
    info_plist_path = _os.path.join(app_path, "Contents", "Info.plist")

    if not _os.path.isfile(info_plist_path):
        return None

    try:
        with open(info_plist_path, "rb") as f:
            plist = _plistlib.load(f)
    except Exception:
        return None

    # Cek CFBundleIconFile
    icon_file = plist.get("CFBundleIconFile")
    if icon_file:
        if not icon_file.endswith(".icns"):
            icon_file = icon_file + ".icns"
        icns_path = _os.path.join(app_path, "Contents", "Resources", icon_file)
        if _os.path.isfile(icns_path):
            return icns_path

    # Fallback ke CFBundleIconName
    icon_name = plist.get("CFBundleIconName")
    if icon_name:
        candidate = _os.path.join(app_path, "Contents", "Resources", icon_name)
        if _os.path.isfile(candidate):
            return candidate

    # Search first .icns file in Resources
    resources_dir = _os.path.join(app_path, "Contents", "Resources")
    if _os.path.isdir(resources_dir):
        try:
            for fname in _os.listdir(resources_dir):
                if fname.endswith(".icns"):
                    return _os.path.join(resources_dir, fname)
        except Exception:
            pass

    return None


def _convert_icns_to_png(icns_path: str, cache_path: str) -> bool:
    """Konversi .icns ke .png menggunakan sips.
    Return True jika sukses."""
    try:
        result = _subprocess.run(
            ["/usr/bin/sips", "-s", "format", "png", icns_path, "--out", cache_path],
            shell=False,
            timeout=10,
        )
        return result.returncode == 0
    except _subprocess.TimeoutExpired:
        logger.error(f"sips timeout for {icns_path}")
        return False
    except Exception as e:
        logger.error(f"sips error for {icns_path}: {e}")
        return False


class AppIconResource:
    """GET /api/actions/app-icon"""

    async def on_get(self, req, res, name):
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

        # Security guard: verify real path is inside the app bundle
        real_app_path = _os.path.realpath(app_path)
        known_prefixes = [
            "/Applications",
            "/System/Applications",
            _os.path.join(_os.path.expanduser("~"), "Applications"),
        ]
        is_valid = any(real_app_path.startswith(p) for p in known_prefixes)
        if not is_valid:
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
        cache_path = _os.path.join(ICON_CACHE_DIR, cache_filename)

        # Ensure cache directory exists
        _os.makedirs(ICON_CACHE_DIR, exist_ok=True)

        # 4. Check cache
        if _os.path.isfile(cache_path):
            # Serve cached PNG
            res.content_type = "image/png"
            res.status = falcon.HTTP_200
            with open(cache_path, "rb") as f:
                res.data = f.read()
            return

        # 5. Get icon path from plist
        icns_path = _get_icon_path(app_path)
        if icns_path is None or not _os.path.isfile(icns_path):
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


# ---------------------------------------------------------------------------
# Fast Ops API Resources
# ---------------------------------------------------------------------------

import logging

from platform_ops import get_fast_ops_actions, execute_action

logger = logging.getLogger(__name__)


class FastOpsActionsResource:
    """GET /api/actions/fast-ops

    Returns the list of fast-ops actions supported by the current platform.
    The response includes platform info and action metadata (title + command_display),
    but **never** returns the raw argv constants — those are server-side only.
    """

    async def on_get(self, req, res):
        actions = get_fast_ops_actions()
        platform_name = getattr(__import__("platform"), "system")()
        platform_id = platform_name.lower()

        # Build response data — exclude _argv_constant from client view
        action_summaries = {}
        for action_id, meta in actions.items():
            action_summaries[action_id] = {
                "id": action_id,
                "title": meta.get("title", action_id),
                "command_display": " ".join(meta.get("_argv_constant", [])),
            }

        response = {
            "status": "success",
            "data": {
                "platform": platform_id,
                "platform_name": _platform_name_from_id(platform_id),
                "actions": action_summaries,
            },
        }
        res.media = response
        res.status = falcon.HTTP_200

    async def on_options(self, req, res):
        res.status = falcon.HTTP_200


class FastOpResource:
    """POST /api/actions/fast-op

    Executes a whitelisted fast-ops action.

    Body: {"action": "<id>"}
    - action must exactly match a registered action_id for the current OS
    - otherwise returns 400 with code ACTION_NOT_ALLOWED
    - argv is built from server-side constants, never from body data
    - subprocess.run(argv, shell=False, timeout=...)
    - on failure (exit != 0): returns controlled error (ACTION_FAILED), NOT 500
    """

    async def on_post(self, req, res):
        body = {}
        try:
            body = await req.media
        except Exception:
            body = {}

        if not isinstance(body, dict):
            body = {}

        action = body.get("action", "") if isinstance(body, dict) else ""

        # --- Type validation: action must be a string for dict lookup ---
        if not isinstance(action, str):
            return_error = {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Nama aksi harus berupa teks",
                },
            }
            res.status = falcon.HTTP_400
            res.media = return_error
            return

        # --- Whitelist check: exact match against registered actions for current OS ---
        actions = get_fast_ops_actions()
        if action not in actions:
            return_error = {
                "status": "error",
                "error": {
                    "code": "ACTION_NOT_ALLOWED",
                    "message": "Aksi tidak dikenali atau tidak didukung platform ini",
                },
            }
            res.status = falcon.HTTP_400
            res.media = return_error
            return

        # Execute the action (argv built from constants, not from body)
        result = execute_action(action)

        # platform_ops.execute_action already returns the proper structure
        # with status, data/error, and stderr potong.
        res.media = result
        if result["status"] == "success":
            res.status = falcon.HTTP_200
        else:
            # Return the controlled error status (400/409 area), NOT 500
            status_code = (
                falcon.HTTP_400
                if result["error"]["code"] in ("ACTION_NOT_ALLOWED", "ACTION_FAILED")
                else falcon.HTTP_409
            )
            res.status = status_code

    async def on_options(self, req, res):
        res.status = falcon.HTTP_200


def _platform_name_from_id(platform_id: str) -> str:
    """Map lowercased platform id to human-readable name."""
    mapping = {
        "darwin": "macOS",
        "linux": "Linux",
        "windows": "Windows",
    }
    return mapping.get(platform_id, platform_id.title())