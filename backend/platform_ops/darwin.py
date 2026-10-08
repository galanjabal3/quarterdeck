"""macOS-specific Fast Ops actions.

Verified commands (all return exit code 0 on this machine):
  • dscacheutil -flushcache     → flush DNS cache
  • killall Finder              → Finder auto-restart
  • killall Dock                → Dock auto-restart
  • killall SystemUIServer      → menu bar auto-restart

Design:
- action_id → human-readable title + _argv_constant (stdlib list)
- No sudo, no core process kill, no data deletion.
- argv is a module-level constant; never constructed from POST body.

Sub-module interface: exports an ``ACTIONS`` dict keyed by action_id,
mapping to metadata dicts.  The parent ``platform_ops`` __init__.py reads
this and populates ``fast_ops_actions``.
"""

import logging

import subprocess as _subprocess

# ----------------------------------------
# ACTIONS dict — this is what __init__.py reads
# ----------------------------------------

ACTIONS = {
    "flush-dns": {
        "title": "Flush DNS Cache",
        # The real argv list passed to subprocess.run(shell=False).
        "_argv_constant": ["dscacheutil", "-flushcache"],
        "description": "Flush DNS cache without root privileges",
    },
    "restart-finder": {
        "title": "Restart Finder",
        "_argv_constant": ["killall", "Finder"],
        "description": "Restart Finder (auto-restarts, no data loss)",
    },
    "restart-dock": {
        "title": "Restart Dock",
        "_argv_constant": ["killall", "Dock"],
        "description": "Restart Dock (auto-restarts, no data loss)",
    },
    "restart-systemuiserver": {
        "title": "Restart SystemUIServer",
        "_argv_constant": ["killall", "SystemUIServer"],
        "description": "Restart SystemUIServer (menu-bar icons auto-restore)",
    },
}