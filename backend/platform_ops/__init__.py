"""Platform abstraction layer for multi-OS support.

Provides:
- OS detection via platform.system()
- Per-OS action abstractions (Fast Ops, process scanning)
- Structure: adding a new OS = adding one module, no if-else scattering
"""

import platform
import sys
import logging
import subprocess
import re

# ---------------------------------------------------------------------------
# OS Detection
# ---------------------------------------------------------------------------

_PLATFORM = platform.system()


def get_platform() -> str:
    """Return lowercased platform identifier: 'darwin', 'linux', 'windows'."""
    return _PLATFORM.lower()


def is_darwin() -> bool:
    return _PLATFORM == "Darwin"


def is_linux() -> bool:
    return _PLATFORM == "Linux"


def is_windows() -> bool:
    return _PLATFORM == "Windows"


# ---------------------------------------------------------------------------
# Per-OS action registry
# ---------------------------------------------------------------------------

#: Registry of fast-ops actions keyed by action_id.
#: Each value is a dict with at least: "title", "_argv_constant", "description",
#: and "_platform" indicating the OS.
#:
#: Populated by importing platform-specific sub-modules (e.g. platform_ops.darwin).
fast_ops_actions: dict = {}


#: Return the current fast-ops action registry.
#: Useful for API handlers that need to list supported actions.
def get_fast_ops_actions() -> dict:
    return dict(fast_ops_actions)  # return a copy


# ---------------------------------------------------------------------------
# Action execution
# ---------------------------------------------------------------------------

def execute_action(action_id: str, timeout: int = 15) -> dict:
    """Execute a whitelisted fast-ops action.

    Returns dict with "status", "data" (or "error"), and HTTP-suitable fields.
    The actual argv is built from platform-constant modules — never from body data.
    """
    actions = get_fast_ops_actions()
    action_meta = actions.get(action_id)
    if action_meta is None:
        return {
            "status": "error",
            "error": {
                "code": "ACTION_NOT_ALLOWED",
                "message": "Aksi tidak dikenali untuk platform ini",
            },
        }

    # Build argv from the module-level constant (stdlib list, not user input)
    argv = action_meta.get("_argv_constant")
    if argv is None:
        return {
            "status": "error",
            "error": {
                "code": "ACTION_EXECUTION_ERROR",
                "message": "Konfigurasi aksi tidak lengkap",
            },
        }

    logger = logging.getLogger(__name__)

    try:
        result = subprocess.run(
            argv,
            shell=False,
            timeout=timeout,
            capture_output=True,
            text=True,
        )
        exit_code = result.returncode
        # Clean stderr: remove control characters, truncate, avoid leaking paths
        stderr_raw = result.stderr or ""
        stderr_clean = re.sub(r'[\x00-\x1f\x7f]', '', stderr_raw)
        stderr_potong = stderr_clean.replace('\n', ' ').replace('\r', ' ')[:200]

        if exit_code == 0:
            return {
                "status": "success",
                "data": {
                    "action": action_id,
                    "exit_code": exit_code,
                    "message": "Perintah dieksekusi",
                },
                "stderr": stderr_potong,
            }
        else:
            return {
                "status": "error",
                "error": {
                    "code": "ACTION_FAILED",
                    "message": f"Perintah gagal dengan exit code {exit_code}",
                },
                "stderr": stderr_potong,
            }
    except subprocess.TimeoutExpired:
        logger.warning(f"Subprocess timeout for action {action_id}")
        return {
            "status": "error",
            "error": {
                "code": "ACTION_TIMEOUT",
                "message": "Aksi melebihi batas waktu",
            },
        }
    except Exception as e:
        logger.error(f"Subprocess error for {action_id}: {e}")
        return {
            "status": "error",
            "error": {
                "code": "ACTION_EXECUTION_ERROR",
                "message": str(e),
            },
        }


# ---------------------------------------------------------------------------
# Auto-import platform-specific module to populate the registry.
# This must happen after fast_ops_actions is defined, and we avoid circular
# imports by having sub-modules NOT import from platform_ops directly.
# Instead, each sub-module exports an ``ACTIONS`` dict that we merge here.
# ---------------------------------------------------------------------------

if is_darwin():
    # Import darwin module and merge its ACTIONS
    import importlib.util
    import os as _os
    import sys as _sys
    if "platform_ops.darwin" not in _sys.modules:
        # Path relatif terhadap file ini (jangan hardcode absolute path —
        # harus tetap jalan setelah repo di-clone di mesin lain).
        _darwin_py = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "darwin.py")
        spec = importlib.util.spec_from_file_location("platform_ops.darwin", _darwin_py)
        darwin_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(darwin_mod)
        for action_id, meta in darwin_mod.ACTIONS.items():
            meta_copy = dict(meta)
            meta_copy["_platform"] = "darwin"
            fast_ops_actions[action_id] = meta_copy

elif is_linux():
    # Structural placeholder — no actions registered (not tested on this machine)
    pass

elif is_windows():
    # Structural placeholder — no actions registered (not tested on this machine)
    pass