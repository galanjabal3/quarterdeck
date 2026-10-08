"""Entry point using uvicorn ASGI server, port 8000"""

import uvicorn
import os
import sys

# Add the backend directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000)