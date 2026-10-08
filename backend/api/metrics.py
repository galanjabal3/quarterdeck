"""Metrics endpoints: /api/metrics/storage, /api/metrics/ram, /api/metrics/cpu"""

import os
import psutil

# Warm-up CPU percent to avoid first-call 0.0
_ = psutil.cpu_percent(interval=None)

# macOS: /System/Volumes/Data is the user-data volume root.
# On APFS, "/" resolves to the system volume (tiny ~12GB used),
# while /System/Volumes/Data reflects actual user storage (~140GB used).
# Fall back to "/" for Linux/Windows/other OSes.
if os.path.exists("/System/Volumes/Data"):
    _STORAGE_PATH = "/System/Volumes/Data"
else:
    _STORAGE_PATH = "/"


def get_storage_metrics():
    """GET /api/metrics/storage"""
    try:
        usage = psutil.disk_usage(_STORAGE_PATH)
        return {
            "status": "success",
            "data": {
                "total_gb": round(usage.total / (1024 ** 3), 2),
                "used_gb": round(usage.used / (1024 ** 3), 2),
                "free_gb": round(usage.free / (1024 ** 3), 2),
                "percent_used": round(usage.percent, 2),
            },
        }
    except Exception as e:
        return {"status": "error", "error": {"code": "METRICS_UNAVAILABLE", "message": str(e)}}


def get_ram_metrics():
    """GET /api/metrics/ram"""
    try:
        mem = psutil.virtual_memory()
        return {
            "status": "success",
            "data": {
                "total_gb": round(mem.total / (1024 ** 3), 2),
                "used_gb": round(mem.used / (1024 ** 3), 2),
                "percent_used": round(mem.percent, 2),
            },
        }
    except Exception as e:
        return {"status": "error", "error": {"code": "METRICS_UNAVAILABLE", "message": str(e)}}


def get_cpu_metrics():
    """GET /api/metrics/cpu"""
    try:
        percent_used = psutil.cpu_percent(interval=None)
        core_count = psutil.cpu_count(logical=True) or 1
        per_core = psutil.cpu_percent(interval=None, percpu=True)

        # temperature_c: bisa None jika tidak didukung (misal macOS)
        temperature_c = None
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                for sensor_list in temps.values():
                    if sensor_list:
                        temperature_c = round(sensor_list[0].current, 2)
                        break
        except (AttributeError, TypeError):
            pass  # tidak didukung di sistem ini

        # frequency_ghz: bisa None jika tidak didukung
        frequency_ghz = None
        try:
            freq = psutil.cpu_freq()
            if freq and freq.current is not None:
                frequency_ghz = round(freq.current / 1000, 3)  # convert MHz to GHz
        except (AttributeError, TypeError):
            pass  # tidak didukung

        return {
            "status": "success",
            "data": {
                "percent_used": round(percent_used, 2),
                "core_count": core_count,
                "per_core": [round(p, 2) for p in per_core],
                "temperature_c": temperature_c,
                "frequency_ghz": frequency_ghz,
            },
        }
    except Exception as e:
        return {"status": "error", "error": {"code": "METRICS_UNAVAILABLE", "message": str(e)}}