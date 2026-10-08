"""System process data endpoint: GET /api/system/processes"""

# Nama-nama shell/CLI transien yang kira-kira tidak relevan meski cmdline
# mengandung path proyek (mis. `zsh -c "cd <project> && ..."`).
# Pengecualian ini HANYA berlakua pada blok is_cmdline — is_own dan _is_vite
# tetap bekerja terlepas dari nama proses ini.
_TRANSIENT_CLI_NAMES = {
    "zsh", "bash", "sh", "dash", "fish", "curl", "wget",
    "grep", "sed", "awk", "head", "tail", "cat", "jq",
    "ps", "lsof", "env", "xargs",
}

# Cache psutil.Process per-PID agar cpu_percent(interval=None) mengukur
# delta sejak request terakhir (bukan 0.1 detik pertama), menghasilkan
# pembacaan yang representatif seiring waktu.
_process_cache: dict = {}

import time
import logging

import psutil
import os
import falcon

logger = logging.getLogger(__name__)


def get_system_processes():
    """Return real process data from the system.

    Returns dict with "status" and "data" containing:
      - processes: list of dicts with pid, name, cpu_percent, memory_mb, uptime, role
      - count: total number of processes returned

    Rules:
      - Gunakan psutil untuk membaca informasi proses secara nyata.
      - Tangani AccessDenied/NoSuchProcess dengan tenang.
      - Jangan pernah mengembalikan data fiktif/hardcoded.
      - Kalau proses tidak ditemukan, kembalikan null/absent — bukan angka karangan.
      - Batasi field agar ringkas (pid, name, cpu_percent, memory_mb, uptime).
      - DILARANG mengembalikan data backend sendiri (self-kill).
      - Sertikan proses backend ini sendiri (uvicorn app:app),
        Vite dev server (port 5173), dan proses python/node path proyek.
    """
    try:
        processes = []

        # Identifikasi path proyek untuk filtering
        # Root direktori proyek (satu level atas dari file ini)
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # Contoh: /Users/galanjabal/Documents/Portfolios/adaptive-command-hub
        my_pid = os.getpid()

        # Helper: ambil cwd safely
        def _safe_cwd(proc):
            try:
                return proc.cwd()
            except (psutil.NoSuchProcess, psutil.AccessDenied,
                    psutil.ZombieProcess, OSError):
                return None

        # Helper: ambil cmdline safely
        def _safe_cmdline(proc):
            try:
                return proc.cmdline()
            except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
                return []

        # CACHE: Ambil koneksi jaringan sekali di luar loop.
        # psutil.net_connections(kind="inet") bisa raise AccessDenied di mesin ini;
        # kita tangani tenang agar _is_vite selalu return False (bukan data fiktif).
        try:
            all_net_connections = psutil.net_connections(kind="inet")
        except (psutil.AccessDenied, OSError, ValueError):
            all_net_connections = []

        # Helper: deteksi Vite melalui port 5173 — pakai cache koneksi yang sudah diambil
        def _is_vite(proc_pid):
            try:
                for conn in all_net_connections:
                    if conn.laddr.port == 5173 and conn.pid == proc_pid:
                        return True
            except (psutil.AccessDenied, OSError, ValueError):
                pass
            return False

        for proc in psutil.process_iter(
                ["pid", "name", "memory_info", "create_time"]
        ):
            try:
                info = proc.info
                pid = info["pid"]
                name = info["name"] or None

                # Lewati proses sistem yang tidak valid
                if pid is None or pid <= 0:
                    continue

                # Ambil informasi memori
                try:
                    proc_mem = proc.memory_info()
                    memory_mb = round(proc_mem.rss / (1024 * 1024), 2) if proc_mem else None
                except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
                    memory_mb = None

                # --- Determinasi relevansi proses ---
                # Urutan: cek cepat tanpa biaya blocking terlebih dahulu.

                # 1. Proses milik sendiri (backend uvicorn) selalu termasuk
                is_own = (pid == my_pid)
                is_relevant = is_own  # backend sendiri selalu relevan

                # 2. Cmdline mengandung path root proyek
                #    Ini pengganti kriteria cwd yang terlalu longgar (menangkap zsh/curl/python3.10 transien).
                # Lewati pemeriksaan ini jika nama proses termasuk shell/CLI transien,
                # karena shell pembungkus menjalankan `cd <project> && <perintah>` dan menyesatkan filter.
                is_cmdline = False
                if not is_relevant:
                    # Jika ini shell transien, lewati filter cmdline,
                    # tetapi is_vite tetap akan dicek di bawah ini.
                    if name and name.lower() not in _TRANSIENT_CLI_NAMES:
                        cmdline_parts = _safe_cmdline(proc)
                        root_lower = project_root.lower().replace("\\", "/")
                        if any(root_lower in str(p).lower() for p in cmdline_parts):
                            is_cmdline = True
                            is_relevant = True

                # 3. Vite dev server: deteksi lewat port 5173 (dari cache, bukan per-loop)
                is_vite = False
                if not is_relevant:
                    if _is_vite(pid):
                        is_vite = True
                        is_relevant = True

                # Jika proses tidak relevan, lewati — cpu_percent DI SINI
                # Hanya proses terpilih (biasanya 2-4) yang sampai ke sini,
                # sehingga cpu_percent(interval=0.1) hanya dijalankan sedikit.
                if not is_relevant:
                    continue

                # --- HANYA PROSES YANG RELEVAN: ambil cpu_percent ---
                # Gunakan psutil.Process yang dicache per-PID agar
                # cpu_percent(interval=None) mengukur delta sejak request
                # sebelumnya (bukan 0.1 detik pertama), sehingga angka
                # searah dengan `ps -o %cpu` pada request kedua+.
                # Panggilan pertama untuk PID baru boleh 0.0 — wajar.
                # Jangan pernah menggunakan interval=0 (bug lama → ~100%).
                try:
                    if pid not in _process_cache:
                        _process_cache[pid] = psutil.Process(pid)
                    else:
                        # Handle PID recycling: kalau PID sudah diganggu,
                        # buat Process object baru.
                        if _process_cache[pid].pid != pid:
                            _process_cache[pid] = psutil.Process(pid)
                    proc_obj = _process_cache[pid]
                    cpu_p = proc_obj.cpu_percent(interval=None)
                    # Bersihkan cache jika process sudah mati
                    if cpu_p is None:
                        del _process_cache[pid]
                except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
                    cpu_p = None
                    if pid in _process_cache:
                        del _process_cache[pid]

                # Uptime sejak start
                try:
                    uptime_sec = time.time() - info["create_time"]
                    uptime_str = f"{int(uptime_sec // 3600)}h {int((uptime_sec % 3600) // 60)}m"
                except (psutil.NoSuchProcess, psutil.AccessDenied, OSError, ValueError):
                    uptime_str = None

                # Tentukan role untuk frontend
                if is_own:
                    role = "backend"
                elif is_vite:
                    role = "frontend"
                else:
                    role = "project"

                # Tambahkan ke daftar (maksimal ~8-10 entri akan dipotong setelah loop)
                processes.append({
                    "pid": pid,
                    "name": name,
                    "cpu_percent": cpu_p,
                    "memory_mb": memory_mb,
                    "uptime": uptime_str,
                    "role": role,
                })

            except psutil.NoSuchProcess:
                # Proses sudah mati antara iterasi, lewati
                continue
            except psutil.AccessDenied:
                # Tidak bisa baca informasi ini, lewati
                continue
            except Exception as e:
                logger.warning(f"Unexpected error reading process {proc.pid}: {e}")
                continue

        # Urutkan: backend (own) dulu, lalu vite, sisanya
        role_order = {"backend": 0, "frontend": 1, "project": 2}
        processes.sort(key=lambda p: role_order.get(p.get("role"), 99))

        # Batas output maksimal ~8-10 entri
        processes = processes[:10]

        return {
            "status": "success",
            "data": {
                "processes": processes,
                "count": len(processes),
            },
        }

    except Exception as e:
        logger.error(f"Error getting system processes: {e}")
        return {
            "status": "error",
            "error": {"code": "PROCESS_ERROR", "message": str(e)},
            "data": {"processes": [], "count": 0},
        }


class SystemProcessesResource:
    """Resource for GET /api/system/processes"""

    async def on_get(self, req, res):
        result = get_system_processes()
        res.media = result
        res.status = falcon.HTTP_200

    async def on_options(self, req, res):
        res.status = falcon.HTTP_200