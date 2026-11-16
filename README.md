# 🍲 BagiRasa Backend Service

Backend RESTful API untuk platform **BagiRasa** (*Food Rescue & Waste Reduction System* di lingkungan kampus), dibangun dengan **Node.js (Express.js)**, **PostgreSQL 15+ (PostGIS)**, dan **Firebase Cloud Messaging (FCM)**.

---

## 👥 Pembagian Tugas & Penanggung Jawab Modul (PIC)

Sesuai dengan kesepakatan tim pada **Progress Report 1 BagiRasa v2 (Kelompok 2 Kelas B)**, arsitektur backend dipecah menjadi modul mandiri sehingga setiap anggota dapat bekerja langsung di foldernya masing-masing:

| Modul | Penanggung Jawab (PIC) | Folder Utama | Tanggung Jawab Utama |
| :--- | :--- | :--- | :--- |
| **Core, Auth & Setup** | **Dimas Radithya** (2311523026) | `src/modules/auth/`<br>`src/config/`<br>`src/database/` | Inisialisasi Express, PostgreSQL Connection, Migration DDL, JWT Auth Middleware, Firebase SDK wrapper. |
| **Modul C: Titik Pengambilan & Lokasi** | **Dimas Radithya** (2311523026) | `src/modules/lokasi/` | CRUD Titik Pengambilan (*pickup points*), query spasial PostGIS (`ST_DWithin`, `ST_Distance`) untuk pencarian lokasi terdekat dari GPS. |
| **Modul A: Donasi Makanan & Media** | **Trilen Surya Ningsih** (2311522004) | `src/modules/donasi/`<br>`uploads/donations/` | CRUD Donasi makanan, filter kategori/urgensi/halal, multi photo upload via Multer, riwayat donasi & statistik agregasi donatur. |
| **Modul B: Permintaan & Klaim Makanan** | **Larisa Alifia** (2411523026) | `src/modules/klaim/`<br>`src/cron/` | Transaksi klaim ACID anti race condition (`SELECT ... FOR UPDATE`), verifikasi kode unik/QR serah terima, pembatalan/auto-promotion FIFO, dan cron auto-expire klaim. |
| **Modul Notifikasi (Shared)** | **Dimas & Tim** | `src/modules/notifikasi/` | Penyimpanan in-app notifications, FCM multicast push alert saat ada donasi baru atau perubahan status klaim. |

---

## 📂 Struktur Direktori Modular

```text
backend/
├── .env.example              # Template konfigurasi environment
├── .env                      # File konfigurasi lokal (tidak di-commit)
├── package.json              # Dependensi dan skrip proyek
├── README.md                 # Panduan lengkap tim
├── uploads/                  # Penyimpanan lokal media foto donasi
│   └── donations/
└── src/
    ├── app.js                # Inisialisasi Express & mounting router per modul
    ├── server.js             # HTTP server entry point & graceful shutdown
    ├── config/               # Konfigurasi database, env loader, firebase
    │   ├── database.js
    │   ├── env.js
    │   └── firebase.js
    ├── database/             # Skrip DDL PostGIS, Seeder, dan Migrasi otomatis
    │   ├── schema.sql
    │   ├── seed.sql
    │   └── migrate.js
    ├── middlewares/          # Autentikasi JWT, Upload Multer, Error Handler
    │   ├── auth.middleware.js
    │   ├── error.middleware.js
    │   ├── notFound.middleware.js
    │   └── upload.middleware.js
    ├── utils/                # Standard API response, JWT helper, claim code & QR generator
    │   ├── code.util.js
    │   ├── jwt.util.js
    │   └── response.util.js
    ├── cron/                 # Background scheduler (node-cron) auto-expire
    │   └── index.js
    └── modules/              # MODUL BISNIS TERPISAH (KERJA PARALEL)
        ├── auth/             # [Dimas] Autentikasi & Pengguna
        ├── lokasi/           # [Dimas] Titik Pengambilan & Geospasial
        ├── donasi/           # [Trilen] Donasi Makanan & Media
        ├── klaim/            # [Larisa] Klaim & Penyelamatan Makanan
        └── notifikasi/       # [Shared] Push Notification FCM & In-App
```

---

## 🚀 Panduan Setup Cepat (Lokal)

### 1. Prasyarat
- **Node.js** v18+ (disarankan v20 atau v22 LTS)
- **PostgreSQL 15+** dengan ekstensi **PostGIS** aktif
- **pgAdmin 4** (opsional untuk inspeksi GUI)

### 2. Instalasi Dependensi
Buka terminal di dalam folder `backend`:
```bash
cd backend
npm install
```

### 3. Konfigurasi Database PostgreSQL
1. Buat database baru di PostgreSQL (melalui `psql` atau pgAdmin 4):
   ```sql
   CREATE DATABASE bagirasa_db;
   ```
2. Pastikan file `.env` sudah sesuai dengan kredensial PostgreSQL lokal Anda:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=bagirasa_db
   DB_USER=postgres
   DB_PASSWORD=postgres
   ```

### 4. Menjalankan Migrasi & Data Dummy (Seed)
Jalankan migrasi skema tabel DDL dan data awal (kategori, pickup points Unand, akun dummy):
```bash
# Membuat skema tabel dan ekstensi PostGIS
npm run migrate

# Atau membuat skema sekaligus memasukkan seed dummy data:
npm run migrate:seed
```

### 5. Menjalankan Server
```bash
# Mode development (live reload dengan nodemon)
npm run dev

# Mode production
npm start
```

Server akan aktif di: `http://localhost:5000`  
Health check: `http://localhost:5000/health`

---

## 🔑 Akun Uji Coba Default (Seed)
Semua akun bawaan seed memiliki password: `password123`

- **Donatur:** `donor@bagirasa.com` (Role: `DONATUR`)
- **Penerima:** `recipient@bagirasa.com` (Role: `PENERIMA`)
- **Relawan:** `volunteer@bagirasa.com` (Role: `RELAWAN`)
- **Admin:** `admin@bagirasa.com` (Role: `ADMIN`)

---

## 📋 Ringkasan API Endpoints & Integrasi Frontend Flutter

Semua respons menggunakan format standar JSON:
```json
{
  "success": true,
  "message": "Pesan status",
  "data": {},
  "meta": { "page": 1, "limit": 10, "total": 50 }
}
```

### 1. Autentikasi (`/api/v1/auth`)
- `POST /register`: Registrasi penerima / donatur.
- `POST /login`: Login (mengembalikan `accessToken` & `refreshToken`).
- `POST /refresh-token`: Memperbarui token kadaluwarsa.
- `POST /device-token`: Mendaftarkan FCM token (Header: `Bearer <token>`).
- `GET /me`: Profil akun aktif.

### 2. Lokasi & Peta (`/api/v1/locations`)
- `GET /pickup-points`: Daftar semua titik pengambilan donasi.
- `GET /pickup-points/nearby?lat=-0.9145&lng=100.4632&radius=5000`: Titik jemput terdekat dalam radius meter (menggunakan PostGIS).
- `GET /pickup-points/:id`: Detail titik jemput.
- `POST /pickup-points`: Tambah titik jemput (*Donatur/Admin*).
- `PUT /pickup-points/:id`: Ubah info titik jemput.
- `DELETE /pickup-points/:id`: Nonaktifkan titik jemput (*soft delete*).

### 3. Donasi Makanan (`/api/v1/donations`)
- `GET /donations/categories`: Daftar kategori makanan (Makanan Siap Saji, Roti, dll).
- `GET /donations`: Daftar donasi publik (Filter: `categoryId`, `pickupPointId`, `isHalal`, `isUrgent`, `search`, `page`, `limit`).
- `GET /donations/:id`: Detail donasi makanan + foto + info titik ambil.
- `POST /donations`: Buat donasi baru (*Multipart*: text fields + `photos` files).
- `PUT /donations/:id`: Update donasi.
- `PATCH /donations/:id/cancel`: Batalkan listing donasi.
- `GET /donations/my-donations`: Riwayat listing donasi milik donatur login.
- `GET /donations/stats`: Statistik porsi diselamatkan, total listing, kadaluarsa.

### 4. Klaim Makanan (`/api/v1/claims`)
- `POST /claims`: Buat klaim porsi makanan (Anti-race condition dengan row lock `FOR UPDATE`).
- `GET /claims/my-claims`: Daftar tiket klaim milik penerima yang login.
- `GET /claims/:id`: Detail tiket klaim (QR string, countdown, batas waktu).
- `GET /claims/incoming`: Permintaan klaim masuk untuk donatur.
- `POST /claims/verify`: Verifikasi fisik serah terima via kode klaim / QR.
- `PATCH /claims/:id/cancel`: Batalkan klaim (otomatis mengembalikan stok porsi ke donasi).

### 5. Notifikasi (`/api/v1/notifications`)
- `GET /notifications`: Riwayat notifikasi in-app.
- `PATCH /notifications/:id/read`: Menandai notifikasi telah dibaca.

---

## 🛠️ Standar Kolaborasi Git

1. Setiap fitur dikerjakan pada branch masing-masing:
   - Dimas: `feature/backend-modul-c-lokasi` & `setup/project-foundation`
   - Trilen: `feature/backend-modul-a-donasi`
   - Larisa: `feature/backend-modul-b-klaim`
2. Jangan mengedit file milik modul lain tanpa koordinasi.
3. Selalu uji endpoint menggunakan Postman / HTTP client sebelum membuat Pull Request ke `master`.
