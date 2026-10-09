Markdown
# 🚀 Quarterdeck - Master Project Blueprint

## 📖 Konsep Inti & Filosofi (Context for AI)
Proyek ini adalah **Local Web App** yang bertindak layaknya aplikasi *desktop native* untuk manajemen sistem operasi dan alur kerja *developer*.
Aplikasi ini menggunakan pola **Progressive Disclosure** melalui satu *state global* (`isProMode`).
- **Casual Mode (`isProMode = false`):** UI terang, sudut melengkung (`rounded-2xl`), fungsionalitas utilitas konsumen (pembersihan penyimpanan, peluncur *game*).
- **Pro Mode (`isProMode = true`):** UI gelap (`bg-gray-900`), *font monospace* untuk data, sudut tajam, fungsionalitas *engineering* (manajemen *environment* Python, metrik RAM/CPU *real-time*, terminal *log*).

**Aturan Emas:** *Frontend* hanya bertugas merender UI. Semua logika eksekusi sistem operasi (Windows/macOS) harus ditangani oleh *Backend* Python.

## 🛠️ Tech Stack Utama
- **Frontend:** Node 20 LTS (dikembalikan dari Node 24 karena Node 20.20.0 yang aktif di mesin pengembangan), React 19, TypeScript 5.x, Vite 8, Tailwind CSS v4 (konfigurasi via `@theme` di CSS, **bukan** `tailwind.config.js`), Lucide React (untuk ikon).
- **Backend:** Python 3.12.3, Falcon 4 (REST Framework ringan), Uvicorn 0.x (ASGI server).
  - **Catatan:** Gunicorn **tidak** dipakai karena tidak berjalan di Windows. Uvicorn dipakai untuk semua OS (dev & produksi skala kecil).
- **Environment & OS:** Poetry 2.x (Python package manager), `psutil` (metrik sistem), `subprocess` (eksekusi terminal, wajib lolos whitelist).
- **Base URL Backend:** `http://localhost:8000` — seluruh request frontend menuju alamat ini (dapat diubah lewat environment variable `VITE_API_BASE_URL`).

## 📂 Struktur Arsitektur Monorepo
AI Agent harus mengikuti struktur *folder* ini secara ketat (semua berada di *root* utama proyek):

```text
/
├── stitch_adaptive_command_hub_dashboard/  # Referensi UI statis dari Google Stitch (.html & .png)
├── frontend/               # Vite React App
│   ├── index.html           # Entry HTML
│   ├── vite.config.ts       # Konfigurasi Vite + plugin React & Tailwind v4
│   ├── tsconfig.json        # Konfigurasi TypeScript strict
│   ├── package.json
│   └── src/
│       ├── main.tsx         # Bootstrap ReactDOM
│       ├── index.css        # @import "tailwindcss" + @theme (token desain)
│       ├── components/
│       │   ├── casual/      # Komponen khusus Mode Kasual (cth: GameLauncher.tsx)
│       │   ├── pro/         # Komponen khusus Mode Pro (cth: ServerManager.tsx)
│       │   └── shared/      # Komponen yang dipakai bersama (Header.tsx, ToggleSwitch.tsx)
│       ├── hooks/           # Custom hooks (cth: useSystemMetrics.ts)
│       └── App.tsx          # Entry point & State pengontrol isProMode
├── backend/                 # Python API
│   ├── api/
│   │   ├── metrics.py       # Endpoint pembaca CPU/RAM/Storage (psutil)
│   │   └── actions.py       # Endpoint pengeksekusi OS commands (subprocess, wajib whitelist)
│   ├── app.py               # Inisialisasi Falcon & CORS Middleware (port 8000)
│   ├── main.py              # Entry point uvicorn (python main.py)
│   ├── pyproject.toml       # Konfigurasi Poetry (Python 3.12)
│   └── tests/               # Unit test pytest
├── .gitignore               # Abaikan node_modules, venv, __pycache__, .env
├── README.md                # Dokumentasi proyek
└── PLANNING.md              # Dokumen instruksi (File ini)
```

> **Catatan struktur:** folder `backend/api/` wajib memiliki `__init__.py` agar Python menganggapnya sebagai paket.

## 📡 Spesifikasi Kontrak API (Data Payload)
Untuk mencegah miskomunikasi antara Frontend dan Backend, gunakan format respons JSON berikut.

**Base URL:** `http://localhost:8000`

**Aturan umum respons:**
- Selalu berbentuk `{ "status": "...", "data": {...} }` (untuk sukses) atau `{ "status": "error", "error": {...} }` (untuk gagal).
- `status` hanya bernilai `"success"` atau `"error"`.
- Semua angka bertipe `float` (desimal), satuan **GB** atau **persen (0-100)**.
- Kode HTTP: `200` untuk sukses, `400` untuk permintaan tidak valid, `500` untuk kegagalan internal.

### 1. GET /api/metrics/storage
JSON

```json
{
  "status": "success",
  "data": {
    "total_gb": 512.0,
    "used_gb": 382.0,
    "free_gb": 130.0,
    "percent_used": 74.5
  }
}
```

### 2. GET /api/metrics/ram
JSON

```json
{
  "status": "success",
  "data": {
    "total_gb": 16.0,
    "used_gb": 8.5,
    "percent_used": 53.1
  }
}
```

### 3. GET /api/metrics/cpu
JSON

```json
{
  "status": "success",
  "data": {
    "percent_used": 42.7,
    "core_count": 8,
    "per_core": [38.2, 44.1, 51.0, 29.7, 45.6, 40.3, 47.8, 46.2],
    "temperature_c": 58.0,
    "frequency_ghz": 3.2
  }
}
```

> **Catatan:** `temperature_c` dan `frequency_ghz` boleh bernilai `null` jika tidak didukung perangkat (khususnya macOS). Frontend wajib menangani `null` tanpa error.

### 4. POST /api/actions/launch-game
**Request body:**
JSON

```json
{
  "action": "launch-game",
  "target": "cyberpunk-2077"
}
```

**Respons sukses (200):**
JSON

```json
{
  "status": "success",
  "data": {
    "action": "launch-game",
    "target": "cyberpunk-2077",
    "message": "Perintah dijalankan",
    "exit_code": 0
  }
}
```

**Respons gagal (400 / 500):**
JSON

```json
{
  "status": "error",
  "error": {
    "code": "ACTION_NOT_ALLOWED",
    "message": "Aksi atau target tidak dikenali"
  }
}
```

> **Aturan Keamanan `subprocess` (WAJIB):**
> 1. **Whitelist aksi** — hanya `action` yang terdaftar di dictionary perbolehkan; selain itu balas `400 ACTION_NOT_ALLOWED`.
> 2. **Whitelist target** — `target` harus cocok persis dengan entri yang sudah didefinisikan server. Nilai bebas dari user **tidak pernah** disisipkan ke string perintah.
> 3. **`shell=False`** — selalu kirim argumen sebagai *list*, bukan string.
> 4. **Timeout wajib** — setiap `subprocess.run` wajib `timeout=30` detik.
> 5. **Log** — semua eksekusi dicatat ke log backend.

### 5. Contoh Respons Error Umum
JSON

```json
{
  "status": "error",
  "error": {
    "code": "METRICS_UNAVAILABLE",
    "message": "psutil tidak dapat membaca metrik penyimpanan"
  }
}
```

### Daftar Endpoint Lengkap
| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/metrics/storage` | Kapasitas disk |
| GET | `/api/metrics/ram` | Pemakaian RAM |
| GET | `/api/metrics/cpu` | Pemakaian CPU per-core |
| POST | `/api/actions/launch-game` | Eksekusi aksi OS (whitelist) |

## 📋 Eksekusi Bertahap (Step-by-Step Milestones)

### Phase 1: Foundation & Setup Visual
- [x] Review: Ekstrak dan pelajari aset HTML dan PNG dari folder /stitch_adaptive_command_hub_dashboard sebagai acuan desain pixel-perfect.
- [x] Frontend: Inisialisasi Vite + React + TS di dalam folder /frontend. Pasang Tailwind v4 dan Lucide.
- [x] Frontend: Buat App.tsx dengan state isProMode. Buat Header.tsx yang memuat tombol toggle.
- [x] Frontend: Terjemahkan struktur HTML dari desain Stitch ke dalam komponen React (CasualDashboard.tsx dan ProDashboard.tsx). Terapkan kondisional rendering berdasarkan isProMode.

### Phase 2: Backend Scaffolding & API
- [x] Backend: Inisialisasi poetry init di dalam folder /backend (Python 3.12). Instal falcon, uvicorn, psutil.
- [x] Backend: Setup app.py dengan Falcon. WAJIB tambahkan middleware CORS agar `http://localhost:5173` (Vite) bisa memanggil API tanpa eror. **Batasi origin ke Vite saja** (jangan pakai `*`).
- [x] Backend: Implementasikan route metrik (`/api/metrics/storage`, `/api/metrics/ram`, `/api/metrics/cpu`) menggunakan library psutil, sesuai kontrak payload di atas.

### Phase 3: Wiring Data (Frontend <-> Backend)
- [x] Frontend: Buat custom hook useSystemMetrics.ts yang melakukan fetch data ke `http://localhost:8000` (gunakan setInterval setiap 3 detik untuk simulasi real-time khusus metrik RAM).
- [x] Frontend: Ganti data statis dengan state dinamis dari API.

### Phase 4: OS Action Execution (Proof of Concept)
- [x] Backend: Buat POST /api/actions/launch-game (atau aksi clean dasar). Gunakan subprocess dengan **`shell=False`**, whitelist aksi/target, dan `timeout=30` — rujuk bagian Aturan Keamanan `subprocess`.
- [x] Frontend: Hubungkan tombol di komponen React ke endpoint aksi tersebut.

### Phase 5: Quality & Delivery
- [x] Frontend: Pasang ESLint + Prettier, jalankan build produksi tanpa error.
- [x] Backend: Tulis unit test pytest minimal untuk endpoint metrik dan whitelist aksi.
- [x] Docs: Buat README.md (deskripsi, fitur, instalasi, cara pakai).
