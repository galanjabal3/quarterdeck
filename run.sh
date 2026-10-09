#!/usr/bin/env bash
#
# run.sh — jalankan backend + frontend sekaligus dalam satu perintah.
#
#   ./run.sh                    # backend + frontend
#   ./run.sh --backend-only     # hanya backend  (port $PORT_BACKEND, default 8000)
#   ./run.sh --frontend-only    # hanya frontend (port $PORT_FRONTEND, default 5173)
#   ./run.sh --kill             # boleh digabung: matikan dulu proses yang memakai
#                               # port target (dengan peringatan), lalu jalankan
#   ./run.sh --help             # tampilkan bantuan
#
# Override port/host lewat env var:
#   PORT_BACKEND=8010 PORT_FRONTEND=5180 API_HOST=127.0.0.1 ./run.sh
#
# Hanya memakai tool bawaan: bash, lsof, curl, poetry, npm.

set -euo pipefail

# ---------------------------------------------------------------- konfigurasi ---
PORT_BACKEND="${PORT_BACKEND:-8000}"
PORT_FRONTEND="${PORT_FRONTEND:-5173}"
API_HOST="${API_HOST:-127.0.0.1}"

RUN_BACKEND=1
RUN_FRONTEND=1
KILL_PORTS=0

BLUE='\033[34m'
GREEN='\033[32m'
YELLOW='\033[33m'
NC='\033[0m'

# Direktori root proyek = direktori tempat script ini berada (bukan CWD).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ------------------------------------------------------------------- usage ---
usage() {
  cat <<EOF
Usage: ./run.sh [OPTIONS]

Jalankan backend (Falcon/Uvicorn, port $PORT_BACKEND) dan frontend
(Vite/React, port $PORT_FRONTEND) secara bersamaan dengan log berprefix.

Options:
  --backend-only    Hanya jalankan backend.
  --frontend-only   Hanya jalankan frontend.
  --kill            Jika port target sudah dipakai, matikan proses penghuninya
                    dulu (dengan pesan peringatan), lalu jalankan seperti biasa.
                    Tanpa flag ini, script berhenti dengan pesan yang bisa
                    ditindaklanjuti bila port sudah terpakai.
  -h, --help        Tampilkan bantuan ini lalu keluar (exit 0).

Environment (override port/host):
  PORT_BACKEND      Port backend  (default: 8000)
  PORT_FRONTEND     Port frontend (default: 5173)
  API_HOST          Host bind     (default: 127.0.0.1)

Contoh:
  ./run.sh
  ./run.sh --backend-only
  PORT_BACKEND=8010 PORT_FRONTEND=5180 ./run.sh
  ./run.sh --kill              # paksa ambil alih port yang sedang terpakai

Contoh perintah manual (tanpa script):
  cd backend && poetry run uvicorn app:app --host 127.0.0.1 --port 8000
  cd frontend && npm run dev

Berhenti: tekan Ctrl+C — kedua proses dimatikan (graceful shutdown).
EOF
}

# ------------------------------------------------------------- arg parsing ---
for arg in "$@"; do
  case "$arg" in
    --backend-only)  RUN_FRONTEND=0 ;;
    --frontend-only) RUN_BACKEND=0 ;;
    --kill)          KILL_PORTS=1 ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "ERROR: opsi tidak dikenal: $arg" >&2; echo "" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$RUN_BACKEND" -eq 0 && "$RUN_FRONTEND" -eq 0 ]]; then
  echo "ERROR: --backend-only dan --frontend-only tidak bisa dipakai bersamaan." >&2
  exit 2
fi

# ------------------------------------------------------------ prasyarat ---
fail() { echo "ERROR: $1" >&2; exit 1; }

command -v poetry >/dev/null 2>&1 || fail "'poetry' tidak ditemukan di PATH. Instal dulu: https://python-poetry.org/docs/"
command -v node   >/dev/null 2>&1 || fail "'node' tidak ditemukan di PATH. Instal Node.js LTS dulu."
command -v npm    >/dev/null 2>&1 || fail "'npm' tidak ditemukan di PATH. Instal Node.js LTS (menyertakan npm)."
command -v curl   >/dev/null 2>&1 || fail "'curl' tidak ditemukan. Instal curl untuk health-check."
command -v lsof   >/dev/null 2>&1 || fail "'lsof' tidak ditemukan. Instal lsof untuk deteksi port."

[[ -d backend ]]  || fail "folder 'backend/' tidak ada (jalankan dari root proyek)."
[[ -d frontend ]] || fail "folder 'frontend/' tidak ada (jalankan dari root proyek)."

if [[ ! -d frontend/node_modules ]]; then
  fail "dependensi frontend belum terpasang (frontend/node_modules tidak ada). Jalankan: cd frontend && npm install"
fi

# Dependensi Poetry terpasang? Cek impor modul kunci di dalam env Poetry.
# (Venv Poetry bisa di cache global, bukan backend/.venv — jadi cek via impor.)
if ! (cd backend && poetry run python -c "import falcon, uvicorn" >/dev/null 2>&1); then
  fail "dependensi backend belum terpasang/lengkap. Jalankan: cd backend && poetry install"
fi

# ------------------------------------------------------------ port check ---
# Kembalikan daftar PID yang LISTEN di port TCP tertentu (kosong bila bebas).
port_pids() {
  local port="$1"
  lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
}

describe_pids() {
  local pid
  for pid in $1; do
    echo "    - PID $pid: $(ps -p "$pid" -o command= 2>/dev/null || echo '(proses tak dikenal)')"
  done
}

handle_port() {
  local name="$1" port="$2"
  local pids
  pids="$(port_pids "$port")"
  [[ -z "$pids" ]] && return 0

  # Normalisasi ke satu baris (lsof mencetak satu PID per baris).
  pids="$(echo "$pids" | tr '\n' ' ')"

  if [[ "$KILL_PORTS" -eq 1 ]]; then
    echo -e "${YELLOW}WARN: port $port ($name) sedang dipakai — menghentikan proses penghuni (--kill):${NC}"
    describe_pids "$pids"
    # shellcheck disable=SC2086
    kill -TERM $pids 2>/dev/null || true
    sleep 2
    local remain
    remain="$(port_pids "$port")"
    if [[ -n "$remain" ]]; then
      echo -e "${YELLOW}WARN: masih ada yang bertahan, paksa dengan SIGKILL.${NC}"
      # shellcheck disable=SC2086
      kill -KILL $remain 2>/dev/null || true
      sleep 1
    fi
    if [[ -n "$(port_pids "$port")" ]]; then
      fail "port $port ($name) masih terpakai setelah --kill. Matikan manual lalu coba lagi."
    fi
    echo "INFO: port $port ($name) sekarang bebas."
  else
    echo -e "${YELLOW}WARN: port $port ($name) sudah dipakai oleh:${NC}" >&2
    describe_pids "$pids" >&2
    echo "" >&2
    echo "Pilih salah satu:" >&2
    echo "  1) ./run.sh --kill            # matikan penghuni port lalu jalankan" >&2
    echo "  2) PORT_BACKEND=8010 PORT_FRONTEND=5180 ./run.sh   # pakai port lain" >&2
    echo "     (atau hanya salah satu yang bentrok)" >&2
    echo "Script berhenti tanpa membunuh proses apa pun." >&2
    exit 1
  fi
}

if [[ "$RUN_BACKEND" -eq 1 ]]; then
  handle_port "backend" "$PORT_BACKEND"
fi
if [[ "$RUN_FRONTEND" -eq 1 ]]; then
  handle_port "frontend" "$PORT_FRONTEND"
fi

# ---------------------------------------------------- shutdown & logging ---
# Prefix log berwarna per baris (unbuffered, aman untuk pipe panjang).
prefix_be() { while IFS= read -r line; do printf "${BLUE}[BE]${NC} %s\n" "$line"; done; }
prefix_fe() { while IFS= read -r line; do printf "${GREEN}[FE]${NC} %s\n" "$line"; done; }

CLEANING_UP=0
cleanup() {
  # Guard anti-reentrancy. Ditulis sebagai `if` (bukan `A && return`)
  # karena di bawah `set -e`, kegagalan `[[ ... ]]` pada bentuk `&&`
  # akan langsung mengakhiri handler trap sebelum body berjalan —
  # inilah jebakan `set -e` + `trap` yang klasik.
  if [[ "$CLEANING_UP" -eq 1 ]]; then
    return 0
  fi
  CLEANING_UP=1
  trap - INT TERM EXIT
  echo ""
  echo "INFO: Ctrl+C diterima — mematikan backend & frontend ..."
  # 1) Matikan semua job langsung script (termasuk subshell prefix log).
  #    `kill $(jobs -p)` tidak cukup sendirian karena server adalah kepala
  #    pipeline (cucu dari script), jadi dilengkapi langkah 2 & 3.
  kill "$(jobs -p)" 2>/dev/null || true
  # 2) Matikan apa pun yang masih LISTEN di port yang kita pakai
  #    (menangkap server yang lolos dari kill grup pipeline).
  local p
  for p in $([[ "$RUN_BACKEND" -eq 1 ]] && echo "$PORT_BACKEND") \
           $([[ "$RUN_FRONTEND" -eq 1 ]] && echo "$PORT_FRONTEND"); do
    [[ -z "$p" ]] && continue
    local holders
    holders="$(port_pids "$p")"
    if [[ -n "$holders" ]]; then
      # shellcheck disable=SC2086
      kill -TERM $holders 2>/dev/null || true
    fi
  done
  # 3) Jaring pengaman: anak langsung yang tersisa.
  pkill -P $$ 2>/dev/null || true
  # `wait` di sini pasti mengembalikan non-nol (anak mati oleh sinyal),
  # jadi lindungi dari `set -e` dengan `|| true`.
  wait 2>/dev/null || true
  echo "INFO: semua proses berhenti. Sampai jumpa!"
}
trap cleanup INT TERM EXIT

# ------------------------------------------------------------- jalankan ---
echo "INFO: menjalankan ${API_HOST}: backend=${PORT_BACKEND} frontend=${PORT_FRONTEND}"

if [[ "$RUN_BACKEND" -eq 1 ]]; then
  # `poetry run` harus dieksekusi dari dalam backend/ agar menemukan pyproject.
  (cd backend && poetry run uvicorn app:app --host "$API_HOST" --port "$PORT_BACKEND" 2>&1 | prefix_be) &
fi

if [[ "$RUN_FRONTEND" -eq 1 ]]; then
  # Argumen setelah `--` diteruskan ke `vite`: bind host+port eksplisit agar
  # health-check via 127.0.0.1 bisa (Vite default kadang hanya bind IPv6 ::1)
  # dan --strictPort agar gagal cepat bila port ternyata direbut.
  (cd frontend && npm run dev -- --host "$API_HOST" --port "$PORT_FRONTEND" --strictPort 2>&1 | prefix_fe) &
fi

# ---------------------------------------------------------- health check ---
wait_for() {
  local label="$1" url="$2" tries=40
  local i
  # Build curl auth header if QD_AUTH_TOKEN is set
  # (${QD_AUTH_TOKEN:-} wajib: script ini jalan dengan `set -u`, tanpa default
  # ini ./run.sh crash di mesin yang tidak menyetel QD_AUTH_TOKEN.)
  local curl_opts=(-fs --max-time 2)
  if [ -n "${QD_AUTH_TOKEN:-}" ]; then
    curl_opts+=(-H "Authorization: Bearer $QD_AUTH_TOKEN")
  fi
  for ((i = 1; i <= tries; i++)); do
    if curl "${curl_opts[@]}" -o /dev/null "$url" 2>/dev/null; then
      echo "INFO: $label siap ($url) setelah ${i}x percobaan."
      return 0
    fi
    sleep 1
  done
  echo -e "${YELLOW}WARN: $label belum merespons $url setelah ${tries}s — cek log [${label}] di atas.${NC}"
  return 0  # jangan gagalkan script; server mungkin hanya lambat (HMR/Vite)
}

if [[ "$RUN_BACKEND" -eq 1 ]]; then
  wait_for "BE" "http://${API_HOST}:${PORT_BACKEND}/api/metrics/cpu"
fi
if [[ "$RUN_FRONTEND" -eq 1 ]]; then
  wait_for "FE" "http://${API_HOST}:${PORT_FRONTEND}/"
fi

echo ""
echo "================ READY ================"
if [[ "$RUN_BACKEND" -eq 1 ]]; then
  echo -e "  Backend : ${BLUE}http://${API_HOST}:${PORT_BACKEND}${NC}"
fi
if [[ "$RUN_FRONTEND" -eq 1 ]]; then
  echo -e "  Frontend: ${GREEN}http://${API_HOST}:${PORT_FRONTEND}${NC}"
fi
echo "  Tekan Ctrl+C untuk berhenti (keduanya ikut mati)."
echo "======================================="
echo ""

# Tahan script selama kedua server hidup. `|| true` agar `set -e` tidak
# memicu exit ganda saat trap cleanup sudah berjalan (wait = rewel + set -e).
wait || true
