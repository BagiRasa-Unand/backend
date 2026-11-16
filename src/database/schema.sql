-- ============================================================================
-- BAGIRASA DATABASE SCHEMA
-- Target Database: PostgreSQL 15+ with PostGIS
-- ============================================================================

-- 1. Ekstensi Wajib
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Tipe Enum
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('PENERIMA', 'DONATUR', 'RELAWAN', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE donation_status_enum AS ENUM ('TERSEDIA', 'HABIS', 'KEDALUWARSA', 'DIBATALKAN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE claim_status_enum AS ENUM ('MENUNGGU_PENGAMBILAN', 'SELESAI', 'BATAL_KEDALUWARSA', 'DIBATALKAN_PENGGUNA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Tabel Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    role user_role_enum NOT NULL DEFAULT 'PENERIMA',
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Perangkat Pengguna & Token FCM (Push Notif)
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT UNIQUE NOT NULL,
    device_platform VARCHAR(20) DEFAULT 'android', -- android / ios
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);

-- 5. Tabel Titik Lokasi Pengambilan (Pickup Points) dengan Spasial PostGIS
CREATE TABLE IF NOT EXISTS pickup_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL, -- Format WGS84
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    open_hour VARCHAR(10) NOT NULL DEFAULT '08:00',
    close_hour VARCHAR(10) NOT NULL DEFAULT '20:00',
    pic_name VARCHAR(100),
    pic_phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index Spasial GIST untuk pencarian radius cepat
CREATE INDEX IF NOT EXISTS idx_pickup_points_location ON pickup_points USING GIST(location);

-- 6. Tabel Kategori Makanan
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    icon_url TEXT
);

-- 7. Tabel Donasi Makanan
CREATE TABLE IF NOT EXISTS donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    pickup_point_id UUID NOT NULL REFERENCES pickup_points(id) ON DELETE RESTRICT,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    total_portions INT NOT NULL CHECK (total_portions > 0),
    remaining_portions INT NOT NULL CHECK (remaining_portions >= 0),
    is_halal BOOLEAN NOT NULL DEFAULT TRUE,
    is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
    pickup_start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    pickup_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status donation_status_enum NOT NULL DEFAULT 'TERSEDIA',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_portions CHECK (remaining_portions <= total_portions)
);

CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_pickup_point ON donations(pickup_point_id);
CREATE INDEX IF NOT EXISTS idx_donations_expires_at ON donations(expires_at);

-- 8. Tabel Foto Donasi
CREATE TABLE IF NOT EXISTS donation_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_donation_photos_donation_id ON donation_photos(donation_id);

-- 9. Tabel Klaim Makanan
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE RESTRICT,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    portion_count INT NOT NULL DEFAULT 1 CHECK (portion_count > 0),
    claim_code VARCHAR(12) UNIQUE NOT NULL, -- Kode unik misal: BGR-7X9A
    qr_payload TEXT NOT NULL,
    status claim_status_enum NOT NULL DEFAULT 'MENUNGGU_PENGAMBILAN',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Batas waktu ambil
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_claims_donation ON claims(donation_id);
CREATE INDEX IF NOT EXISTS idx_claims_recipient ON claims(recipient_id);
CREATE INDEX IF NOT EXISTS idx_claims_code ON claims(claim_code);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- 10. Tabel Log Riwayat Perubahan Status Klaim
CREATE TABLE IF NOT EXISTS claim_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    from_status claim_status_enum,
    to_status claim_status_enum NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tabel Riwayat Notifikasi In-App
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

