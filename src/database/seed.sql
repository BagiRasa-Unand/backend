-- ============================================================================
-- SEED DATA BAGIRASA
-- Password default semua user: password123
-- Hash: $2a$10$wK1E745mSgV9s2bXqXqF3evcW78E9V7YqR2hK3vG3wY4tE5vS6p1y (bcrypt 10 rounds)
-- ============================================================================

-- 1. Kategori Makanan
INSERT INTO categories (id, name, slug, icon_url) VALUES 
(1, 'Makanan Siap Saji', 'makanan-siap-saji', 'assets/icons/food.png'),
(2, 'Roti & Kue', 'roti-kue', 'assets/icons/bakery.png'),
(3, 'Sayur & Buah', 'sayur-buah', 'assets/icons/fruit.png'),
(4, 'Bahan Makanan Mentah', 'bahan-mentah', 'assets/icons/raw.png'),
(5, 'Minuman', 'minuman', 'assets/icons/drink.png')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    icon_url = EXCLUDED.icon_url;

-- Reset sequence id kategori jika serial
SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- 2. Dummy Users
-- donor@bagirasa.com (DONATUR)
-- recipient@bagirasa.com (PENERIMA)
-- volunteer@bagirasa.com (RELAWAN)
-- admin@bagirasa.com (ADMIN)
INSERT INTO users (id, email, password_hash, full_name, phone, role, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'donor@bagirasa.com', '$2a$10$x8Xq99EwJ.mC.B70e4iE9.YhYQ9XoN.1F0N9m5o8i.gOq1z5r9aWy', 'Warung Bu Siti (Donatur)', '081234567890', 'DONATUR', true),
('a0000000-0000-0000-0000-000000000002', 'recipient@bagirasa.com', '$2a$10$x8Xq99EwJ.mC.B70e4iE9.YhYQ9XoN.1F0N9m5o8i.gOq1z5r9aWy', 'Ahmad Fadillah (Mahasiswa)', '081234567891', 'PENERIMA', true),
('a0000000-0000-0000-0000-000000000003', 'volunteer@bagirasa.com', '$2a$10$x8Xq99EwJ.mC.B70e4iE9.YhYQ9XoN.1F0N9m5o8i.gOq1z5r9aWy', 'Siti Relawan (Relawan PKM)', '081234567892', 'RELAWAN', true),
('a0000000-0000-0000-0000-000000000004', 'admin@bagirasa.com', '$2a$10$x8Xq99EwJ.mC.B70e4iE9.YhYQ9XoN.1F0N9m5o8i.gOq1z5r9aWy', 'Admin BagiRasa', '081234567899', 'ADMIN', true)
ON CONFLICT (email) DO NOTHING;

-- 3. Dummy Pickup Points (Area Kampus Unand & Limau Manis)
INSERT INTO pickup_points (id, name, address, location, latitude, longitude, open_hour, close_hour, pic_name, pic_phone, is_active) VALUES
(
    'b0000000-0000-0000-0000-000000000001',
    'Posko PKM Unand (Pusat Kegiatan Mahasiswa)',
    'Lantai 1 Gedung PKM Universitas Andalas, Limau Manis, Padang',
    ST_SetSRID(ST_MakePoint(100.463200, -0.914500), 4326),
    -0.91450000,
    100.46320000,
    '08:00',
    '18:00',
    'Rahmat PIC PKM',
    '081211112222',
    true
),
(
    'b0000000-0000-0000-0000-000000000002',
    'Gedung Kuliah Bersama (GKB) E',
    'Lobi Utama GKB E Kampus Unand Limau Manis',
    ST_SetSRID(ST_MakePoint(100.458900, -0.913200), 4326),
    -0.91320000,
    100.45890000,
    '09:00',
    '17:00',
    'Budi Satpam GKB',
    '081233334444',
    true
),
(
    'b0000000-0000-0000-0000-000000000003',
    'Kantin Fakultas Teknologi Informasi (FTI)',
    'Kantin Sebelah Timur Gedung B FTI Unand',
    ST_SetSRID(ST_MakePoint(100.465100, -0.915800), 4326),
    -0.91580000,
    100.46510000,
    '08:30',
    '16:30',
    'Ibu Ani Kantin',
    '081255556666',
    true
),
(
    'b0000000-0000-0000-0000-000000000004',
    'Kantin Teknik Sisfo',
    'Gedung Teknik Informasi, Lt. 1, Kampus Unand',
    ST_SetSRID(ST_MakePoint(100.458700, -0.913300), 4326),
    -0.91330000,
    100.45870000,
    '08:00',
    '16:00',
    'PIC Sisfo',
    '081266667777',
    true
),
(
    'b0000000-0000-0000-0000-000000000005',
    'Kantin Rektorat',
    'Gedung Rektorat, Lantai Dasar, Kampus Unand',
    ST_SetSRID(ST_MakePoint(100.460200, -0.913500), 4326),
    -0.91350000,
    100.46020000,
    '07:30',
    '17:00',
    'PIC Rektorat',
    '081277778888',
    true
),
(
    'b0000000-0000-0000-0000-000000000006',
    'Kantin Asrama Putra',
    'Gedung Asrama Putra Blok A, Kampus Unand',
    ST_SetSRID(ST_MakePoint(100.457800, -0.914800), 4326),
    -0.91480000,
    100.45780000,
    '07:00',
    '15:00',
    'PIC Asrama',
    '081288889999',
    true
),
(
    'b0000000-0000-0000-0000-000000000007',
    'Kantin FEB Corner',
    'Gedung Fakultas Ekonomi Bisnis, Selasar Timur',
    ST_SetSRID(ST_MakePoint(100.457500, -0.912000), 4326),
    -0.91200000,
    100.45750000,
    '09:00',
    '17:00',
    'PIC FEB',
    '081299990000',
    true
),
(
    'b0000000-0000-0000-0000-000000000008',
    'Kantin Faperta Barat',
    'Gedung Pertanian, Pintu Barat, Kampus Unand',
    ST_SetSRID(ST_MakePoint(100.460800, -0.915500), 4326),
    -0.91550000,
    100.46080000,
    '08:00',
    '15:00',
    'PIC Faperta',
    '081200001111',
    true
),
(
    'b0000000-0000-0000-0000-000000000009',
    'Stand BEM Pusat',
    'Gedung PKM, Halaman Utama, Kampus Unand',
    ST_SetSRID(ST_MakePoint(100.461000, -0.913000), 4326),
    -0.91300000,
    100.46100000,
    '09:00',
    '18:00',
    'PIC BEM',
    '081211113333',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 4. Dummy Listing Donasi Makanan
INSERT INTO donations (
    id, donor_id, pickup_point_id, category_id, title, description,
    total_portions, remaining_portions, is_halal, is_urgent,
    pickup_start_at, pickup_end_at, expires_at, status
) VALUES
(
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    1,
    'Nasi Ayam Bakar & Lalapan',
    'Kelebihan pesanan katering seminar siang tadi, masih hangat dan higienis.',
    10,
    7,
    true,
    true,
    NOW(),
    NOW() + INTERVAL '4 HOURS',
    NOW() + INTERVAL '4 HOURS',
    'TERSEDIA'
),
(
    'c0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    2,
    'Roti Manis & Croissant Bakery',
    'Donasi dari toko bakery harian, dikemas rapi satuan.',
    15,
    15,
    true,
    false,
    NOW(),
    NOW() + INTERVAL '6 HOURS',
    NOW() + INTERVAL '8 HOURS',
    'TERSEDIA'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Dummy Photo Donasi
INSERT INTO donation_photos (donation_id, photo_url, is_primary) VALUES
('c0000000-0000-0000-0000-000000000001', '/uploads/donations/sample_nasi_ayam.jpg', true),
('c0000000-0000-0000-0000-000000000002', '/uploads/donations/sample_roti.jpg', true)
ON CONFLICT DO NOTHING;

