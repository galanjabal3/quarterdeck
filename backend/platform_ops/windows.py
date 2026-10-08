"""Windows-specific Fast Ops actions (structural, NOT tested on this macOS machine).

Candidates that are generally considered safe (no admin/required privileges beyond normal user):
  • ipconfig /flushdns            → flush DNS cache
  • taskkill /im explorer.exe    → restart Explorer
  • taskkill /im conhost.exe     → restart conhost

NOTE: This module is imported by platform_ops.__init__ so that
"get_platform()" == "windows" can discover it.  The action lists here
are ideation-only; the actual whitelist for /api/actions/fast-op
will be empty/unknown until a Windows test machine is available.

Adding a new OS in the future only requires:
  1. Create platform_ops/windows.py populating
     fast_ops_actions registry with action_id → metadata.
  2. No changes to the core executor or API handlers.
"""

import logging

from platform_ops import fast_ops_actions as _registry

logger = logging.getLogger(__name__)

# Structural placeholder — no actions are registered here because
# they have not been verified on this machine.
# If someone adds actions, they must follow the same pattern as darwin.py:
#   "_argv_constant": ["/path/to/command", "arg"],
# and never use `sudo` or kill core system processes.

# Example skeleton (commented out):
# ACTIONS = {
#     "flush-dns": {
#         "title": "Flush DNS Cache",
#         "_argv_constant": ["/usr/bin/ipconfig", "/flushdns"],
#         "description": "Flush DNS cache on Windows",
#     },
# }
# for action_id, meta in ACTIONS.items():
#     meta["_platform"] = "windows"
#     _registry[action_id] = meta