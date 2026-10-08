# Adaptive Command Hub

Dashboard *Command Center* lokal: metrik sistem real-time dan *App Launcher* untuk macOS — dengan dua mode tampilan, **Casual** dan **Pro**.

## Deskripsi

Adaptive Command Hub adalah *local web app* yang berperilaku seperti aplikasi desktop native. Ia menampilkan metrik sistem (storage, RAM, CPU) secara *real-time* sekaligus menjadi *launcher* aplikasi: frontend menscan aplikasi yang terinstal di macOS, menampilkan ikon aslinya, dan membukanya lewat backend.

Yang membuat proyek ini menarik:

- **Progressive Disclosure** — satu state global (`isProMode`) mengubah seluruh karakter UI. *Casual Mode* terang, sudut membulat, fokus ke utilitas konsumen (pembersihan penyimpanan, peluncur aplikasi). *Pro Mode* gelap, font monospace, sudut tajam, fokus ke data engineering (metrik detail, log terminal).
- **Batas keamanan yang jelas** — frontend hanya merender UI. Semua eksekusi OS berada di backend Python dengan whitelist, validasi regex, dan pembatasan origin CORS.
- **Integrasi OS yang nyata** — ikon aplikasi diekstrak dari `.icns` bawaan macOS menjadi PNG oleh backend, lalu dirender oleh React dengan *fallback* bila ikon tidak tersedia.

## Fitur Utama

- Metrik sistem *real-time*: storage (total/used/free/persen), RAM, dan CPU (total, per-core, suhu, frekuensi).
- Dua mode tampilan: **Casual** (UI terang, utilitas konsumen) dan **Pro** (UI gelap, data engineering).
- *App Launcher* — menscan aplikasi terinstal di `/Applications`, `/System/Applications`, dan `~/Applications`, lalu membukanya.
- Ikon aplikasi asli (PNG) hasil konversi `.icns` via `sips`, dengan cache di `/tmp` dan *fallback icon* di frontend.
- Aksi OS terwhitelist (mis. `cleanup` / `temp-files`) lewat satu endpoint POST.
- **Fast Ops** — aksi cepat sesuai OS yang sedang berjalan (di macOS: *flush DNS*, restart Finder, Dock, dan SystemUIServer). Daftar aksi dibaca dari modul `platform_ops/` yang sesuai platform, lalu dieksekusi lewat whitelist dengan `shell=False` (tanpa mengekspos argv mentah ke klien).
- **Process Manager** — data proses *real* dari `psutil` (`pid`, `name`, `cpu_percent`, `memory_mb`, `uptime`, `role`), tanpa angka fiktif/hardcoded.
- Seluruh eksekusi OS hanya dari backend; frontend tidak pernah menyentuh `subprocess`.
- 39 unit test pytest pada endpoint metrik, aturan whitelist/validasi aksi, ikon aplikasi, Fast Ops, data proses real, dan konsistensi pembacaan storage.

Fast Ops dan Process Manager sudah terpasang di **Pro mode**: `FastOps.tsx` menampilkan daftar aksi dari `GET /api/actions/fast-ops` dan mengeksekusinya lewat `POST /api/actions/fast-op` (dengan konfirmasi untuk aksi berdampak); `ServerManager.tsx` menampilkan data proses real dari `GET /api/system/processes` dengan polling 2,5 detik. Keduanya sudah diverifikasi secara visual dengan **Playwright** (screenshot tersimpan di [`screenshots/`](screenshots/)): peluncuran aplikasi, hasil Fast Ops `EXIT 0`, dan pid backend yang cocok dengan `lsof` semuanya terkonfirmasi.

**Semua tampilan kini terhubung data real.** Metrik storage/RAM/CPU, App Launcher (scan + ikon + peluncuran), Clean Drive, Fast Ops, dan Process Manager terhubung ke backend; enam kartu telemetri Pro mode menampilkan metrik live dari `/api/metrics/*`, `/api/actions/apps`, dan `/api/system/processes`. *Terminal log* Pro mode kini berfungsi sebagai CLI nyata: perintah terbatas (`help`, `ping`, `status`, `ps`, `apps`, `clear`) dieksekusi lewat API dan setiap baris log mencatat latensi terukur (mis. `GET /api/metrics/cpu 200 OK (132.4ms)`). Nav sidebar menjadi tautan *anchor* ke section yang ada, dan chip statistik dekoratif (angka karangan, indikator latency/Docker/Redis palsu, `99.98% OPS`, avatar/search notifikasi) sudah dihapus dari UI. Sisa yang memang lokal by-design: **Universal Drop** memproses file di sisi browser (tidak ada upload ke backend) dan disebut demikian di UI-nya.

## Arsitektur

```text
┌─────────────────────────────┐        ┌──────────────────────────────┐        ┌─────────────┐
│  Frontend (Vite :5173)      │  HTTP  │  Backend (Falcon ASGI :8000) │  OS    │  macOS      │
│  React 19 + TS + Tailwind   │ ─────► │  psutil · subprocess         │ ─────► │  psutil dat.│
│  render UI saja             │  JSON  │  whitelist + validasi        │        │  open · sips│
└─────────────────────────────┘        └──────────────────────────────┘        └─────────────┘
```

*Frontend* (Vite) hanya melakukan fetch ke `http://localhost:8000` dan me-render hasilnya. *Backend* (Falcon) membaca metrik via `psutil` dan mengeksekusi perintah OS via `subprocess` — selalu dengan `shell=False`, argv list, timeout, dan whitelist. Aturan emasnya: **frontend hanya UI, backend satu-satunya pintu ke sistem operasi.**

## Stack Teknologi

| Layer | Teknologi |
|---|---|
| Frontend | React 19 · TypeScript 5.9 · Vite 8 · Tailwind CSS v4 (`@theme`, tanpa `tailwind.config.js`) · lucide-react |
| Backend | Python 3.12 · Falcon 4 (ASGI) · Uvicorn · psutil · Poetry |
| Testing | pytest |
| Platform | macOS (eksekusi aksi memakai binary bawaan seperti `sips` dan `open`) |

## Cara Instalasi

Prasyarat:

- Node.js 20+ (dikembangkan dengan Node 20.20) dan npm
- Python 3.12
- [Poetry](https://python-poetry.org/) 2.x

Backend:

```bash
cd backend
poetry install
```

Frontend:

```bash
cd frontend
npm install
```

## Cara Menjalankan

### Cara utama — satu perintah dengan `run.sh`

Script di root proyek menjalankan backend dan frontend sekaligus, dengan log berprefix `[BE]` dan `[FE]`:

```bash
./run.sh
```

Opsi yang tersedia:

```bash
./run.sh --backend-only    # hanya backend
./run.sh --frontend-only   # hanya frontend
./run.sh --kill            # matikan proses yang sudah menghuni port, lalu jalankan
./run.sh --help            # tampilkan bantuan
```

- Port bisa di-override lewat environment variable `PORT_BACKEND` (default `8000`) dan `PORT_FRONTEND` (default `5173`); host bind backend lewat `API_HOST` (default `127.0.0.1`).
- Bila port sudah terpakai dan `--kill` tidak diberikan, script berhenti dengan pesan yang bisa ditindaklanjuti.
- Tekan `Ctrl+C` untuk berhenti: kedua proses dimatikan (graceful shutdown), sehingga tidak ada proses yatim yang tertinggal.

Buka `http://localhost:5173`.

### Alternatif manual — dua terminal

Terminal 1 — backend:

```bash
cd backend && poetry run uvicorn app:app --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:

```bash
cd frontend && npm run dev
```

Base URL backend defaultnya `http://localhost:8000` dan dapat diubah lewat environment variable `VITE_API_BASE_URL`.

## Struktur Folder

```text
adaptive-command-hub/
├── frontend/                    # Vite React App
│   ├── index.html
│   ├── vite.config.ts           # plugin React & Tailwind v4, port 5173
│   ├── package.json
│   └── src/
│       ├── main.tsx
│       ├── index.css            # @import "tailwindcss" + @theme
│       ├── App.tsx              # state global isProMode
│       ├── components/
│       │   ├── casual/          # CasualDashboard, CasualTopBar, GameLauncher, StorageOptimizer, UniversalDrop
│       │   ├── pro/             # ProDashboard, ProSidebar, ModeController, ServerManager, StatusGrid, TerminalLog
│       │   └── shared/          # Header, ToggleSwitch
│       ├── hooks/               # useSystemMetrics.ts
│       └── lib/                 # actions.ts, format.ts
├── backend/                     # Python API
│   ├── api/
│   │   ├── metrics.py           # endpoint CPU/RAM/storage (psutil)
│   │   ├── actions.py           # scan app, ikon, eksekusi OS (whitelist), Fast Ops
│   │   └── system_processes.py  # endpoint proses real (psutil)
│   ├── platform_ops/            # abstraksi multi-OS untuk Fast Ops
│   │   ├── darwin.py            # whitelist aksi macOS (yang teruji)
│   │   ├── linux.py             # struktur placeholder, belum diuji
│   │   └── windows.py           # struktur placeholder, belum diuji
│   ├── app.py                   # inisialisasi Falcon + routing endpoint + CORS middleware
│   ├── main.py                  # entry point uvicorn
│   ├── pyproject.toml           # Poetry (Python 3.12)
│   └── tests/                   # unit test pytest (test_metrics.py)
├── run.sh                       # menjalankan backend + frontend dalam satu perintah
├── PLANNING.md
├── REVIEW.md                    # laporan hasil kerja, temuan bug, dan hasil verifikasi untuk review
└── README.md
```

## API

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/metrics/storage` | Kapasitas disk |
| GET | `/api/metrics/ram` | Pemakaian RAM |
| GET | `/api/metrics/cpu` | Pemakaian CPU per-core |
| GET | `/api/actions/apps` | Daftar aplikasi terinstal (`name`, `display_name`, `bundle_id`, `source`) |
| GET | `/api/actions/app-icon?name=<app>` | Ikon PNG aplikasi (bila tidak ada: `404 ICON_NOT_FOUND`) |
| POST | `/api/actions/launch-game` | Eksekusi aksi OS terwhitelist (mis. `cleanup` / `temp-files`) |
| GET | `/api/actions/fast-ops` | Daftar aksi Fast Ops sesuai OS yang sedang berjalan (tanpa mengekspos argv) |
| POST | `/api/actions/fast-op` | Eksekusi 1 aksi Fast Ops terdaftar (`{"action": "<id>"}`); field wajib bertipe `str`, selain itu `400` |
| GET | `/api/system/processes` | Data proses **real** via psutil: `pid`, `name`, `cpu_percent`, `memory_mb`, `uptime`, `role` (tanpa data fiktif) |

Semua respons berbentuk `{ "status": "success", "data": {...} }` atau `{ "status": "error", "error": {...} }`. Detail payload ada di [`PLANNING.md`](PLANNING.md); Fast Ops, Process Manager, dan hasil verifikasinya dibahas di [`REVIEW.md`](REVIEW.md).

## Testing

```bash
cd backend && poetry run pytest
```

37 test lolos — mencakup endpoint metrik, aturan whitelist/validasi aksi (termasuk penolakan target yang tidak dikenal dan upaya path traversal), endpoint ikon aplikasi, Fast Ops, data proses real, serta regresi validasi tipe input (respons `400`, bukan `500`).

Perintah frontend yang tersedia: `npm run lint`, `npm run format`, dan `npm run build` (type-check TypeScript + build produksi).

## Keamanan

Prinsip keamanan yang diterapkan di backend:

- **`shell=False`** — semua `subprocess.run` memakai argv list, bukan string perintah.
- **Whitelist aksi dan target** — hanya aksi/target terdaftar yang dieksekusi; nilai dari klien tidak pernah disisipkan ke string perintah.
- **Validasi regex nama** — target harus cocok dengan pola `^[a-zA-Z0-9 ._-]+$` (menolak `../`, `/`, dan karakter khusus lain).
- **Exact-match terhadap hasil scan** — nama aplikasi wajib identik dengan entri hasil scan aplikasi sebelum dieksekusi.
- **Timeout wajib** — setiap eksekusi dibatasi `timeout` (30 detik untuk aksi; 10 detik untuk konversi ikon).
- **CORS dibatasi** — origin yang diizinkan hanya `http://localhost:5173`, bukan `*`.
- **Konversi ikon terisolasi** — `sips` dijalankan dengan argv list pada path hasil validasi, hasilnya di-cache di `/tmp/ach-icon-cache`.

## Roadmap

Tahapan pengembangan mengikuti `PLANNING.md`:

- **Phase 1 — Foundation & Setup Visual:** referensi desain Stitch, komponen `App.tsx` dengan `isProMode`, dashboard Casual/Pro.
- **Phase 2 — Backend Scaffolding & API:** inisialisasi Poetry, Falcon + CORS terbatas, endpoint metrik.
- **Phase 3 — Wiring Data:** `useSystemMetrics.ts` fetch berkala ke backend, data dinamis menggantikan data statis.
- **Phase 4 — OS Action Execution:** endpoint aksi dengan `shell=False` + whitelist, tombol frontend terhubung ke API.
- **Phase 5 — Quality & Delivery:** ESLint + Prettier, build produksi, unit test pytest, dokumentasi README.

Phase 1–5 di atas semuanya sudah selesai (seluruh milestone bertanda selesai di `PLANNING.md`). Setelahnya ada pekerjaan lanjutan yang tidak tercatat sebagai fase baru di `PLANNING.md`: ikon aplikasi, abstraksi multi-OS (`platform_ops/`) beserta Fast Ops, endpoint Process Manager dengan data proses real, script `run.sh`, quality gates frontend (ESLint/Prettier/build) dan backend (pytest), audit input keamanan, serta penulisan laporan `REVIEW.md`. Rincian hasil dan keterbatasannya ada di [`REVIEW.md`](REVIEW.md).
