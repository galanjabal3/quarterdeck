# REVIEW.md — Laporan Hasil Kerja: Quarterdeck

Dokumen ini ditulis untuk **reviewer**: apa yang dikerjakan, keputusan desain, bug yang
ditemukan/diperbaiki, hasil verifikasi aktual, dan keterbatasan yang masih ada. Angka dibuat
dapat diverifikasi ulang lewat perintah di bagian 7. Tanggal verifikasi: 7 Oktober 2026;
mesin: macOS, Python 3.12, Node v20.20.0.

---

## 1. Ringkasan eksekutif

**Quarterdeck** adalah *local web app* di macOS yang berperilaku seperti aplikasi
desktop: dashboard metrik sistem real-time (storage / RAM / CPU) plus *App Launcher* yang
menscan aplikasi terinstal dan membukanya, dengan dua mode UI — **Casual** dan **Pro**
(progresif lewat satu state global `isProMode`).

| Layer | Stack | Alamat |
|---|---|---|
| Frontend | React 19 · TypeScript 5.9.3 · Vite 8 · Tailwind v4 (`@theme`, tanpa `tailwind.config.js`) · lucide-react | `http://localhost:5173` |
| Backend | Python 3.12 · Falcon 4 (ASGI) · Uvicorn · psutil · Poetry | `http://127.0.0.1:8000` |
| Orkestrasi | `./run.sh`: satu perintah untuk FE+BE, log prefix `[BE]`/`[FE]`, cek prasyarat (`poetry`, `node`, `npm`, `curl`, `lsof`), deteksi port, graceful shutdown Ctrl+C | `./run.sh --help` |

Status akhir: **Phase 1–5 sesuai `PLANNING.md` dinyatakan selesai** (seluruh milestone
bertanda `[x]`), 61 test backend lolos, type-check/lint/format/build frontend bersih, audit
input 60 kasus tanpa satu pun HTTP 500. Yang belum diverifikasi (mis. tampilan UI, Linux/
Windows) tercatat jujur di bagian 6.

Endpoint yang beroperasi:

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/metrics/storage`, `/api/metrics/ram`, `/api/metrics/cpu` | metrik via psutil |
| GET | `/api/actions/apps` | scan aplikasi terinstal (84 app) |
| GET | `/api/actions/app-icon?name=` | ikon PNG (konversi `.icns`→`.png` via `sips`, cache `/tmp`) |
| POST | `/api/actions/launch-game` | aksi whitelist (mis. `cleanup` / `temp-files`) |
| GET | `/api/actions/fast-ops` | daftar Fast Ops sesuai OS yang berjalan |
| POST | `/api/actions/fast-op` | eksekusi aksi Fast Ops whitelist |
| GET | `/api/system/processes` | data proses **real** via psutil |

---

## 2. Pekerjaan per fase (Phase 1–5)

Sumber: `PLANNING.md` bagian milestones — seluruh item bertanda `[x]`.

### Phase 1 — Foundation & Setup Visual
- Aset desain di `stitch_adaptive_command_hub_dashboard/` dipelajari sebagai acuan.
- Inisialisasi Vite + React + TS di `/frontend`; pasang Tailwind v4 dan lucide-react.
- `App.tsx` dengan state global `isProMode`, `Header.tsx` berisi toggle; struktur desain
  Stitch diterjemahkan ke `CasualDashboard` / `ProDashboard` dengan rendering kondisional.

### Phase 2 — Backend Scaffolding & API
- Inisialisasi Poetry di `/backend` (Python 3.12): `falcon`, `uvicorn`, `psutil`.
- `app.py` Falcon + middleware CORS **dibatasi** ke `http://localhost:5173` (bukan `*`).
- Endpoint metrik storage/RAM/CPU sesuai kontrak payload di `PLANNING.md`.

### Phase 3 — Wiring Data
- Hook `useSystemMetrics.ts` fetch berkala ke backend; data statis diganti state dinamis.

### Phase 4 — OS Action Execution
- `POST /api/actions/launch-game` dengan `shell=False`, argv list, whitelist aksi/target,
  timeout; tombol di React terhubung ke endpoint ini.

### Phase 5 — Quality & Delivery
- ESLint + Prettier terpasang, build produksi jalan; unit test pytest; README dibuat.

Di luar daftar milestones, fitur berikut juga dibangun dan diuji: scan 84 aplikasi + ikon
PNG, Fast Ops per-OS (`platform_ops/`), `GET /api/system/processes`, dan `run.sh`.

---

## 3. Keputusan desain penting

1. **Abstraksi multi-OS dibangun sekarang, hanya macOS yang teruji.**
   `backend/platform_ops/` berisi `darwin.py`, `linux.py`, `windows.py` + deteksi
   `platform.system()`. Modul Linux/Windows masih kerangka (daftar aksi dikomentari,
   diberi label *"structural, NOT tested"*) agar penambahan OS nanti tidak menyentuh
   executor/API; hanya `darwin.py` yang berisi aksi aktif.
2. **Ikon disajikan per-request (lazy), bukan base64 inline.** 84 ikon ≈ 3,8 MB; dengan
   endpoint + cache `/tmp` (83 PNG saat verifikasi) hanya ikon yang dirender yang dimuat
   dan konversi tidak diulang.
3. **Fast Ops diisi aksi macOS yang aman & nyata**, menggantikan 4 command Linux dari
   desain awal (`resolvectl`, `fuser`, `docker system prune`, `c_rehash`) yang tidak ada
   di macOS: `flush-dns` (`dscacheutil -flushcache`), `restart-finder`, `restart-dock`,
   `restart-systemuiserver` (tiga `killall` yang auto-restart).
4. **Process Manager memakai data real**, bukan angka fiktif seperti desain awal
   (Gunicorn/Redis/PID palsu yang tidak ada di proyek ini). Field dibatasi: `pid`, `name`,
   `cpu_percent`, `memory_mb`, `uptime`, `role`; daftar dipotong ke 10 entri.
5. **Semua eksekusi OS hanya di backend.** Frontend murni render; `subprocess` hanya
   dipanggil di backend (4 titik, semuanya `shell=False`).

---

## 4. Temuan bug & perbaikan

13 temuan, semuanya sudah diperbaiki dan masuk ke test/lint. Format per item:
**Gejala → Akar → Perbaikan → Status**.

1. **Guard `realpath` menolak Safari** — *Gejala:* ikon Safari 404. *Akar:*
   `/Applications/Safari.app` adalah *cryptex* di macOS, `realpath` menghasilkan
   `/System/Volumes/Preboot/...` sehingga `startswith("/Applications")` gagal.
   *Perbaikan:* validasi berbasis path yang dibangun (bukan hasil `realpath`) plus guard
   `os.path.commonpath` untuk file ikon (`app.py:270-357`). *Status:* selesai —
   `app-icon?name=Safari` → 200 PNG.

2. **TypeScript diam-diam di-remap ke alias menyesatkan** — *Gejala:* `tsc` melaporkan
   7.0.2 padahal kebutuhan TS 5.x. *Akar:* `package.json` memuat
   `"typescript": "npm:@typescript/typescript6"` dan `@typescript/native: npm:typescript@^7`.
   *Perbaikan:* dikembalikan ke `typescript@^5.9.3` standar; `@typescript/native` dihapus.
   *Status:* selesai — `npx tsc --version` → `Version 5.9.3`, tidak ada alias `npm:` di
   `package-lock.json`.

3. **2 warning lint diturunkan ke `warn` di config** — *Gejala:* masalah lint tetap ada
   tapi tidak terlihat. *Akar:* pola *adjust state during render* untuk mereset
   `failedIcons` di `GameLauncher.tsx`. *Perbaikan:* kodenya diperbaiki (reset state saat
   daftar kartu berubah — `GameLauncher.tsx:143-148`), rule dikembalikan ke level **error**;
   config kini tanpa penurunan level (`frontend/eslint.config.js`). *Status:* selesai —
   `npm run lint` → 0 error / 0 warning.

4. **README berisi fakta salah** — *Gejala:* "Node 24 LTS" dan "Testing: httpx".
   *Akar:* dokumen ditulis dari asumsi awal, tidak dicek ke lingkungan aktual.
   *Perbaikan:* dikoreksi — README kini menyebut Node 20+ (aktual 20.20.0) dan pytest.
   *Status:* selesai. **Catatan sisa:** `README.md` baris 23 dan 138 pernah menyebut
   "18 unit test/18 test lolos" (aktual kini **61 test**) dan `PLANNING.md` baris 13 pernah
   "Node 24 LTS" (kini "Node 20 LTS"); keduanya pada sesi itu di luar ruang lingkup file
   yang boleh diubah, tetapi kini sudah ikut dikoreksi.

5. **Dependensi mati `httpx`** — *Gejala:* terpasang di `pyproject.toml` tapi tidak
   di-import di mana pun. *Akar:* sisa penyusunan awal; test memakai client internal.
   *Perbaikan:* dihapus + `poetry lock` disinkronkan. *Status:* selesai — dependensi kini
   hanya `falcon`, `uvicorn`, `psutil` (+ dev `pytest`).

6. **Fast Ops memakai command Linux** — *Gejala:* aksi Fast Ops tidak ada/gagal di macOS.
   *Akar:* whitelist disalin dari desain awal berbasis Linux. *Perbaikan:* diganti 4 aksi
   macOS yang terbukti jalan (bagian 3, butir 3); argv dikonstanta di module-level, tidak
   pernah disusun dari body POST. *Status:* selesai — `GET /api/actions/fast-ops`
   melaporkan `platform: darwin` dengan 4 aksi; `POST flush-dns` → 200 `exit_code: 0`.

7. **Filter proses memakai substring `"app" in name`** — *Gejala:* 36 proses acak sistem
   (WhatsApp, `appstoreagent`, `com.apple.*`) masuk, sedangkan backend sendiri tidak muncul
   (nama prosesnya `python`). *Akar:* kriteria nama terlalu longgar. *Perbaikan:* jadi
   (a) pid sendiri, (b) cmdline berisi path root proyek (pengganti `cwd` yang terlalu
   longgar), (c) deteksi port 5173 untuk Vite; daftar diurutkan backend → frontend →
   project lalu dipotong ke 10 (`api/system_processes.py`). *Status:* selesai — `pid`
   backend cocok `lsof -t -i:8000`, tanpa proses acak.

8. **`cpu_percent` menghasilkan ~100% palsu** — *Gejala:* CPU proses ratusan persen;
   kenyataannya `ps` menunjukkan ~0,3%. *Akar:* `process_iter(attrs=[..., "cpu_percent"])`
   memanggil sekali, lalu `proc.cpu_percent(interval=0)` dipanggil lagi mikrodetik
   kemudian → Δwall ≈ 0 → pembacaan meledak. *Perbaikan:* objek `psutil.Process` di-cache
   per-PID lalu `cpu_percent(interval=None)` (delta sejak request sebelumnya), dengan
   komentar "jangan pakai interval=0" (`system_processes.py:13-16, 141-157`). *Status:*
   selesai — panggilan pertama untuk PID baru boleh `0.0` (first-call psutil yang wajar,
   bukan angka karangan).

9. **Endpoint proses hang ±60 detik** — *Gejala:* `pytest` berhenti setelah 22 passed dan
   endpoint memakan ±60 detik. *Akar:* `cpu_percent(interval=0.1)` dijalankan untuk **semua**
   606 proses **sebelum** filter (606 × 0,1s ≈ 60s). *Perbaikan:* pengukuran dipindahkan
   ke **setelah** filter relevansi (hanya 2–4 proses). *Status:* selesai — endpoint terukur
   0,043 detik; seluruh suite selesai 0,21 detik.

10. **Noise `zsh`/`curl`/`python3.10` bocor ke daftar proses** — *Gejala:* proses transien
    yang `cd` ke folder proyek ikut masuk. *Akar:* filter `cwd` menangkap siapa pun yang
    pernah berada di folder proyek. *Perbaikan:* pengecualian daftar shell/CLI transien
    (`_TRANSIENT_CLI_NAMES`), **hanya** pada jalur `is_cmdline`; `is_own` dan deteksi port
    tetap lolos (`system_processes.py:7-11, 117-126`). *Status:* selesai.

11. **`stderr` tidak pernah tertangkap** — *Gejala:* pesan kegagalan aksi selalu kosong.
    *Akar:* `subprocess.run` tanpa `capture_output` sehingga `result.stderr` selalu `None`.
    *Perbaikan:* `capture_output=True` + `text=True` di `platform_ops/__init__.py` dan dua
    jalur aksi di `api/actions.py`, plus sanitasi karakter kontrol & potong 200 karakter
    (konversi ikon `sips` tetap tanpa capture karena hanya memakai `returncode`).
    *Status:* selesai — uji `flush-dns` mengembalikan `stderr: ""`.

12. **Input bertipe salah → HTTP 500 + bocor pesan internal** — *Gejala:* body
    `{"action": ["..."]}` menghasilkan `500 unhashable type: 'list'` dengan pesan exception
    bocor ke klien. *Akar:* nilai dipakai sebagai key dict tanpa validasi tipe; error
    handler menampilkan `str(ex)`. *Perbaikan:* validasi tipe nama aksi → 400 envelope
    standar; pesan klien diganti generik. *Status:* selesai — `list`/`dict`/`null`/`bool`
    semuanya 400, ada test khusus `TestActionTypeValidation`.

13. **Regresi saat memperbaiki butir 12** — *Gejala:* 404/405 berubah jadi 500 dan body
    jadi teks polos. *Akar:* `logger.error(..., extra={"exc_info": True})` — `exc_info`
    kunci terlarang di `LogRecord.extra`, sehingga `KeyError` terjadi **di dalam** error
    handler. *Perbaikan:* menjadi `logger.error(..., exc_info=True)` (`app.py:51-54`) plus
    pendaftaran handler 404/405 sebelum handler `Exception` umum (`app.py:389-397`).
    *Status:* selesai — 404 path tak dikenal dan 405 method salah kembali benar dengan
    envelope JSON (diverifikasi ulang via curl).

---

## 5. Hasil verifikasi (angka aktual)

Semua angka di bagian ini **dijalankan ulang oleh penulis dokumen ini** saat menyusun
laporan, kecuali yang ditandai lain.

### 5.1 Backend
| Perintah | Hasil |
|---|---|
| `cd backend && poetry run pytest -q` | **61 passed** in 1.12s (0 gagal, 0 skip, 0 warning) |

Rincian class: `TestMetrics`, `TestActions`, `TestAppIcon`, `TestFastOps`,
`TestActionTypeValidation`, `TestSystemProcesses`, `TestEndpointIntegrity`, serta
`TestAuthIntegration` dan `TestStartupGuardrail` di `tests/test_auth.py` (15 test
integrasi auth token & guardrail startup; 39 lainnya di `tests/test_metrics.py`).

**Perbaikan storage (temuan dari uji visual).** Endpoint `/api/metrics/storage` semula
memanggil `psutil.disk_usage("/")`; di macOS (APFS) path itu adalah volume sistem, jadi
UI menampilkan **"12 GB / 460 GB Used (4%"** padahal data user terpakai **140 GB**.
Diperbaiki memakai path sadar-OS (`/System/Volumes/Data` bila ada, fallback `/`) —
sekarang `used_gb: 140.17`, `percent_used: 33.1`, cocok dengan
`df -h /System/Volumes/Data` (`460Gi 140Gi 284Gi 34%`). Dua test baru mengunci
keberadaan path dan konsistensi keempat field.

### 5.2 Frontend
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | exit 0 (TypeScript 5.9.3) |
| `npm run lint` | exit 0 — 0 error, 0 warning |
| `npm run format:check` | bersih ("All matched files use Prettier code style!") |
| `npm run build` | sukses — `assets/index-*.js` 294,57 kB (gzip 88,55 kB), `index-*.css` 47,82 kB (gzip 8,58 kB) |

Wiring frontend terakhir (belum termuat saat dokumen ini disusun): `components/pro/FastOps.tsx`
dibuat untuk memanggil `GET /api/actions/fast-ops` + `POST /api/actions/fast-op`, dan
`ServerManager.tsx` **mengganti `DAEMONS` fiktif** (Gunicorn/Redis/PID karangan) dengan
`GET /api/system/processes` (polling 2,5 detik, sort CPU desc, maks 10 baris, cleanup
`AbortController`); `FastOps` dirender di `ProDashboard.tsx`. Tipe TS diturunkan dari
payload curl yang nyata, bukan tebakan. **Status verifikasi sama seperti di atas: lolos
`tsc`/`lint`/`format`/`build` saja — tampilan visualnya belum pernah dilihat** (lihat poin 1
bagian 6).

### 5.3 Audit keamanan (input & konfigurasi)
`python3 /tmp/audit_keamanan.py` (skrip masih ada, 60 kasus uji) dijalankan terhadap server
yang hidup — **keluaran: nol respons 500**. Audit berjalan dengan auth dalam kondisi
default (mati); sejak audit ditulis ada tambahan perilaku `401 UNAUTHORIZED` bila
`QD_AUTH_TOKEN` diset, sehingga kasus-kasus di bawah kini berlaku saat auth mati
(jumlah dan hasil 60 kasus tidak berubah saat audit dilakukan).

| Kelompok | Kasus | Hasil |
|---|---|---|
| Injeksi shell ke `action` | 17 pola | semua **400** |
| Bentuk body aneh (JSON rusak, tanpa body, `null`/`array`/`object`/`bool`, 10k karakter, 5 MB) | 9 | **400** |
| Path traversal / nama aneh di `app-icon` | 9 | pola traversal → **400** |
| Metode salah (`PUT`/`DELETE`/`PATCH`/`HEAD`) | 4 | **405** |
| Path tak dikenal | 1 | **404** |
| Preflight & CORS origin asing | 5 | `Access-Control-Allow-Origin` selalu `http://localhost:5173` |
| `launch-game` target/action berbahaya | 11 | selain `cleanup` yang valid → **400** |

Catatan jujur untuk dua entri yang tampak "aneh" di keluaran skrip: body dengan key
ekstra (`__proto__`) → 200 karena aksinya valid (`flush-dns`) dan key ekstra diabaikan
server; `name=Safari\n` dilaporkan 200 oleh `urllib`, sedangkan via `curl` `Safari%0A`
responsnya **400** (nama berspasi memunculkan `InvalidURL` di client skrip; via `curl`
`%20` → **400**).

Konfigurasi pendukung (dibaca dari kode): bind `127.0.0.1` (terkonfirmasi `lsof`:
`127.0.0.1:8000`), 4 titik `subprocess.run` semuanya `shell=False`, timeout tiap eksekusi,
nol `os.system`/`eval`, CORS dibatasi satu origin.

### 5.4 Fungsional
- **Aplikasi:** `GET /api/actions/apps` → 200, **84** aplikasi.
- **Ikon:** 84 request → **83 ber-200**; satu gagal: `Claude Code URL Handler` → 404
  (memang tanpa ikon; 404 fallback yang sah). Cache `/tmp/qd-icon-cache` berisi 83 PNG.
- **Proses:** `GET /api/system/processes` → 200 dalam 0,043 detik; `pid` backend **59044**
  cocok `lsof -t -i:8000` pada saat pengukuran; tidak ada proses acak sistem.
- **Fast Ops:** `GET /api/actions/fast-ops` → `platform: darwin`, 4 aksi;
  `POST fast-op {"action":"flush-dns"}` → 200, `exit_code: 0`. Aksi `restart-finder`,
  `restart-dock`, `restart-systemuiserver` **tidak dijalankan ulang** saat review ini agar
  tidak mengganggu sesi reviewer; keempatnya sudah diverifikasi pada sesi pengembangan.
- **Metrik:** storage/RAM/CPU → 200; `temperature_c` bernilai `null` di macOS (sesuai
  kontrak).

### 5.5 Verifikasi visual (Playwright)
Dijalankan dengan Playwright (Python) + Chrome headless, viewport **1440×900**,
menghasilkan **6 screenshot di [`screenshots/`](screenshots/)`** plus
`_console-and-checks.txt` (rekaman console/page error & HTTP ≥ 400).

| Uji | Hasil |
|---|---|
| Peluncuran **Calculator** via App Launcher | kartu + ikon asli tampil → klik `Launch` → banner *"Calculator launched — Exit code 0"* → proses **benar-benar terbuka** (terverifikasi `pgrep`, lalu ditutup kembali) |
| Pencarian App Launcher | `"Calculator"` → *"Menampilkan 1 dari 1 aplikasi yang cocok"*; **84** app terdeteksi |
| **Fast Ops** Flush DNS | indikator **`EXIT 0 // PERINTAH DIEKSEKUSI`** di UI |
| **Process Manager** | `python3.12 PID 59044 · ROLE backend` — cocok `lsof -i:8000`; angka CPU berubah antar screenshot (polling hidup) |
| Metrik | RAM 84.8%; CPU berubah 0.0% → 98.5% mengikuti beban — angka nyata, bukan statis |
| Toggle Casual ↔ Pro | berpindah mulus, kedua mode ter-render |
| Kesehatan JS | `pageerror: 0`; request API ≥ 400: **0**; console error: **1** (favicon 404 — kini diperbaiki, `public/favicon.svg` + `<link rel="icon">`) |

**Putaran pembersihan UI (lanjutan).** Setelah elemen dekoratif dihapus (§6.10),
verifikasi visual dijalankan ulang: 6 screenshot di `screenshots/` dirender dari
versi baru; DOM Playwright kedua mode tak lagi memuat elemen lama (`THREAD POOL`,
`REDIS LATENCY`, chip `99.98% OPS`, nav mati, log hardcoded) — hanya branding
`SYS.CORE` yang tersisa secara disengaja; console/page error & API ≥ 400 tetap **0**;
baris log terminal memuat latensi terukur sungguhan dari API (mis.
`GET /api/metrics/cpu 200 OK (132.4ms)`).

Batasan verifikasi visual ini: **headless, satu viewport desktop (1440×900)** —
sesuai lingkup proyek yang memang **desktop-only** (keputusan pemilik: dukungan
mobile sengaja di luar cakupan, sehingga bukan celah yang tertunda). Keyboard-only
kini teruji otomatis (lihat §6.1); yang belum: screen reader sungguhan, aksi
`restart-*` tidak diklik (dampak ke sesi desktop), dan screenshot tidak diverifikasi
otomatis (dinilai manual oleh penulis).

---

## 6. Keterbatasan & risiko yang diketahui

Bagian ini sengaja dipertahankan lengkap; jangan dihapus saat review.

1. **Verifikasi visual kini tersedia, tapi terbatas.** Sesi pengembangan awal tanpa tool
   browser; verifikasi visual baru dilakukan di akhir via **Playwright headless,
   viewport 1440×900** (6 screenshot di `screenshots/`, lihat bagian 5.5). Lingkup
   proyek **desktop-only** (keputusan pemilik: dukungan mobile sengaja di luar
   cakupan — bukan keterbatasan yang tertunda).

   **Audit aksesibilitas otomatis (Playwright + axe-core, WCAG 2.0/2.1 A & AA)
   kini berjalan di kedua mode: 0 pelanggaran** setelah perbaikan yang dipicu
   audit — 5 node kontras warna di Casual (label "Workspace Optimizer", "Pro HUD",
   "RAM Usage", "/ 460 GB Used", status RAM) dinaikkan kontrasnya, termasuk varian
   status `(High)`/`(Optimal)` yang belum sempat ter-render saat audit. Urutan Tab
   tercatat rapi (30 elemen teruji di kedua mode: semuanya punya focus ring dan
   accessible name), landmark `<nav>` + `<aside>` tersedia di mode Pro (mode Casual
   memang tanpa sidebar — bukan celah). Yang **masih** belum diuji: screen reader
   sungguhan (VoiceOver) dan lintas browser (hanya Chrome). Klaim "UI berjalan"
   harus dibaca sebatas itu.
2. **Linux & Windows belum teruji.** `platform_ops/linux.py` dan `windows.py` bersifat
   struktural (daftar aksi dikomentari, dilabeli belum teruji); hanya macOS yang diuji.
3. **Autentikasi kini tersedia tapi opsional; rate limit kini terpasang.** Bila env
   `QD_AUTH_TOKEN` diset, semua request wajib token via `Authorization: Bearer <t>`,
   `X-Auth-Token: <t>`, atau `?token=<t>` (untuk `<img>` ikon); perbandingan
   `hmac.compare_digest`, gagal → `401` envelope
   `{"status":"error","error":{"code":"UNAUTHORIZED",...}}` (header CORS tetap ada,
   OPTIONS preflight dikecualikan), plus
   guardrail: `API_HOST` non-loopback tanpa `QD_AUTH_TOKEN` → proses gagal start
   (`RuntimeError` saat import `app.py`, kena `uvicorn app:app`/`run.sh`/`python main.py`).
   **Tapi default tetap mati** — tanpa env itu, API menerima semua request; selama auth
   mati, proses lokal mana pun dapat memanggil API, termasuk `POST /api/actions/fast-op`.
   **Rate limit kini terpasang** (`RateLimitMiddleware`, urutan cors → rate limit → auth): sliding window 60 detik per IP, default 300 request/menit (env `QD_RATE_LIMIT_PER_MIN`; `0` menonaktifkan; nilai tidak valid jatuh ke default), tolak `429` envelope `RATE_LIMITED` + header `Retry-After`, OPTIONS dikecualikan, store in-memory per proses dengan batas 4096 key (key tertua dibuang) — reset saat restart, **bukan limiter terdistribusi**; karena berjalan sebelum auth, percobaan brute-force token ikut terhitung. API juga aman karena bind `127.0.0.1`, dan **CORS melindungi
   browser, bukan `curl`** — CORS tetap mengizinkan origin hardcoded
   `http://localhost:5173` saja (dev server di port lain ditolak CORS).
4. **Fast Ops berdampak nyata** ke sistem (restart Dock/Finder/SystemUIServer). Aman,
   auto-restart, tanpa `sudo` dan tanpa penghapusan data — tetap aksi tulis.
5. **`/api/system/processes` membocorkan** pid dan nama proses lokal ke setiap client
   yang dapat menembus port 8000.
6. **Ini bukan penetration test.** Audit berupa baca kode + pengujian input terhadap
   endpoint hidup; tanpa fuzzing berat, tanpa review dependensi eksternal, tanpa pihak
   ketiga.
7. **Riwayat git baru dimulai dari baseline.** Repository diinisialisasi di akhir
   pengembangan; commit pertama (`3bc9d6e`) sudah memuat seluruh baseline sekaligus,
   sehingga riwayat perubahan halus sebelumnya (Phase 1–5) tidak dapat ditelusuri per
   commit. Perubahan sesudah baseline di-commit terpisah mengikuti konvensi satu
   commit = satu perubahan logis (mis. `fff9639` pembersihan UI, `4116d6d` auth
   backend, `61748e1` pengiriman token frontend).
8. **`cpu_percent` bisa `0.0` pada request pertama** untuk PID baru (first call psutil) —
   diizinkan dan jujur, bukan angka karangan; angka representatif muncul pada request
   kedua dan seterusnya.
9. **Dokumen yang sudah disinkronkan:** `README.md` semula menulis "18 test" (waktu itu
   39, kini 54) dan `PLANNING.md` semula menulis "Node 24 LTS" (aktual 20.20.0) — keduanya
   sudah dikoreksi, dan tabel API `README.md` kini mencantumkan ketiga endpoint Fast Ops /
   Process Manager beserta `run.sh` dan struktur folder terkini. Kini `README.md` juga
   sudah mencerminkan fitur auth token opsional (`QD_AUTH_TOKEN`/`VITE_AUTH_TOKEN`,
   guardrail, limitasi, rate limit) beserta angka test terbaru (**61 test**).
10. **Elemen dekoratif Pro mode — sudah dihapus (pekerjaan lanjutan tuntas).** Temuan
    asli dari uji visual: kartu `THREAD POOL`, `REDIS LATENCY`, `DOCKER DAEMON`,
    `INGRESS/EGRESS` menampilkan angka **statis identik di setiap render**; *terminal
    log* berisi log hardcoded bertanggal `2025-05-18` dan input terminal membalas
    respons hardcoded (`ping` → `PONG 127.0.0.1 time=0.18ms`); nav sidebar (Live
    Telemetry, Node Clusters, Audit Logs, dll.) tidak menampilkan konten apa pun.
    Pada putaran berikutnya (bersama pemilik proyek) diputuskan untuk **membersihkannya**:
    - **Kartu telemetri** → 6 kartu semuanya menampilkan data live dari
      `/api/metrics/*`, `/api/actions/apps`, dan `/api/system/processes` (CPU, memory,
      disk, jumlah app, jumlah proses, jumlah aksi Fast Ops).
    - **Terminal** → kini CLI nyata (`help`, `ping`, `status`, `ps`, `apps`, `clear`)
      yang dieksekusi lewat API; setiap baris log mencatat latensi terukur. Perintah di
      luar whitelist membalas pesan error yang jujur, bukan respons karangan.
    - **Nav sidebar** → tautan *anchor* ke section yang benar-benar ada
      (`#overview`, `#process-manager`, `#fast-ops`, `#terminal`).
    - **Dihapus total:** chip `99.98% OPS // 12ms`, `Cluster State ACTIVE`, `kbd P
      toggle` (tidak ada handler keydown), indikator `BACKEND API` statis (kini menunjuk
      API sungguhan), serta nav/search/notif/avatar mati di `Header` dan chip statistik
      statis di `CasualTopBar`.
    Verifikasi: grep seluruh `src/` bersih dari angka karangan, DOM Playwright kedua
    mode tak lagi memuat elemen lama, dan screenshot terbaru di `screenshots/`
    dirender dari versi baru (lihat §5.5). Sisa yang lokal by-design dan disebut
    jujur di UI: **Universal Drop** (pemrosesan file di browser, tanpa upload).
 11. **Auth bersifat opt-in; cakupan verifikasinya terbatas.** Auth diuji di origin
    `localhost:5173` saja — lintas port/origin lain ditolak CORS; `uvicorn --host`
    **manual** tanpa env `API_HOST` tidak dicegah guardrail; verifikasi integrasi
    frontend ↔ backend-auth dilakukan via Playwright (**26 request API, 0 gagal,
    12/12 ikon bertoken**).

---

## 7. Cara reviewer memverifikasi ulang

```bash
cd /Users/galanjabal/Documents/Portfolios/quarterdeck

# backend — harap 61 passed
cd backend && poetry run pytest -q

# frontend — harap exit 0, tanpa output lint, build sukses
cd ../frontend && npm run lint && npx tsc --noEmit && npm run build

# skrip bantuan
cd .. && ./run.sh --help

# audit input (60 kasus); kalau file hilang, uji manual via curl seperti di bawah
python3 /tmp/audit_keamanan.py
```

Contoh uji manual via curl:

```bash
curl -i -X POST http://127.0.0.1:8000/api/actions/fast-op \
  -H 'Content-Type: application/json' -d '{"action":["flush-dns"]}'   # harap 400 envelope
curl -i -X POST http://127.0.0.1:8000/api/actions/fast-op \
  -H 'Content-Type: application/json' -d '{"action":"; rm -rf /"}'    # harap 400
curl -i http://127.0.0.1:8000/api/nope                                # harap 404 JSON
curl -i -X POST http://127.0.0.1:8000/api/metrics/ram                 # harap 405 JSON
```

Contoh uji auth token — jalankan backend dengan `QD_AUTH_TOKEN` (dari folder
`backend/`: `QD_AUTH_TOKEN=$(openssl rand -hex 32) poetry run uvicorn app:app --host 127.0.0.1 --port 8000`),
pastikan `$QD_AUTH_TOKEN` juga diekspor di shell tempat curl dijalankan, lalu:

```bash
# auth-off (default): 200
curl -i http://127.0.0.1:8000/api/metrics/cpu

# auth-on: jalankan backend dengan QD_AUTH_TOKEN, lalu
curl -i http://127.0.0.1:8000/api/metrics/cpu                    # harap 401 UNAUTHORIZED
curl -i -H "Authorization: Bearer $QD_AUTH_TOKEN" http://127.0.0.1:8000/api/metrics/cpu   # harap 200

# guardrail (dari folder backend/; token dikosongkan agar kondisi "tanpa token" pasti)
QD_AUTH_TOKEN= API_HOST=0.0.0.0 poetry run python -c "import app"   # harap RuntimeError (guardrail)
```

Catatan saat review:
- Server kemungkinan **sedang hidup** di port 8000 (PID 59044 saat penulisan dokumen ini).
  Bila port terpakai, `./run.sh` berhenti dengan pesan yang bisa ditindaklanjuti;
  `./run.sh --kill` memaksa mengambil alih.
- Angka (61 test, 84 app, 83 ikon, 0 warning) diukur di mesin ini; angka ikon/proses bisa
  berbeda bila daftar aplikasi atau proses yang berjalan berubah.
