"""Entry point using uvicorn ASGI server, port 8000"""

import uvicorn
import os
import sys

# Add the backend directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import auth middleware guardrail - this will raise RuntimeError at import
# if API_HOST is non-loopback and ACH_AUTH_TOKEN is not set, preventing
# accidental exposure of the server without authentication in production.
from api.auth_middleware import validate_startup_host

if __name__ == "__main__":
    validate_startup_host()
    uvicorn.run("app:app", host="127.0.0.1", port=8000)