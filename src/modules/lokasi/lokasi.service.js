const db = require('../../config/database');

class LokasiService {
  async getAllPickupPoints({ activeOnly = true } = {}) {
    let sql = `
      SELECT 
        p.id,
        p.name,
        p.address,
        p.latitude,
        p.longitude,
        p.open_hour AS "openTime",
        p.close_hour AS "closeTime",
        p.pic_name AS "picName",
        p.pic_phone AS "picPhone",
        p.is_active AS "isActive",
        COUNT(d.id) FILTER (WHERE d.status = 'TERSEDIA' AND d.expires_at > NOW())::int AS "activeListingCount",
        p.created_at
      FROM pickup_points p
      LEFT JOIN donations d ON p.id = d.pickup_point_id
    `;

    const params = [];
    if (activeOnly) {
      sql += ' WHERE p.is_active = TRUE';
    }

    sql += ' GROUP BY p.id ORDER BY p.name ASC';

    const result = await db.query(sql, params);
    return result.rows;
  }

  async getNearbyPickupPoints({ latitude, longitude, radiusMeters = 5000 }) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radius = parseFloat(radiusMeters);

    if (isNaN(lat) || isNaN(lng)) {
      const error = new Error('Koordinat latitude dan longitude harus berupa angka valid.');
      error.statusCode = 400;
      throw error;
    }

    // PostGIS Query menggunakan geography type untuk kalkulasi jarak akurat dalam satuan meter
    const sql = `
      SELECT 
        p.id,
        p.name,
        p.address,
        p.latitude,
        p.longitude,
        p.open_hour AS "openTime",
        p.close_hour AS "closeTime",
        p.pic_name AS "picName",
        p.pic_phone AS "picPhone",
        p.is_active AS "isActive",
        ROUND(ST_Distance(
          p.location::geography, 
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        )) AS "distanceMeters",
        COUNT(d.id) FILTER (WHERE d.status = 'TERSEDIA' AND d.expires_at > NOW())::int AS "activeListingCount"
      FROM pickup_points p
      LEFT JOIN donations d ON p.id = d.pickup_point_id
      WHERE p.is_active = TRUE
        AND ST_DWithin(
          p.location::geography, 
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
          $3
        )
      GROUP BY p.id
      ORDER BY "distanceMeters" ASC
    `;

    const result = await db.query(sql, [lng, lat, radius]);
    return result.rows;
  }

  async getPickupPointById(id) {
    const sql = `
      SELECT 
        p.id,
        p.name,
        p.address,
        p.latitude,
        p.longitude,
        p.open_hour AS "openTime",
        p.close_hour AS "closeTime",
        p.pic_name AS "picName",
        p.pic_phone AS "picPhone",
        p.is_active AS "isActive",
        COUNT(d.id) FILTER (WHERE d.status = 'TERSEDIA' AND d.expires_at > NOW())::int AS "activeListingCount",
        p.created_at,
        p.updated_at
      FROM pickup_points p
      LEFT JOIN donations d ON p.id = d.pickup_point_id
      WHERE p.id = $1
      GROUP BY p.id
    `;

    const result = await db.query(sql, [id]);
    if (result.rows.length === 0) {
      const error = new Error('Titik lokasi pengambilan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    return result.rows[0];
  }

  async createPickupPoint({ name, address, latitude, longitude, openHour = '08:00', closeHour = '20:00', picName, picPhone }) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      const error = new Error('Koordinat latitude dan longitude harus berupa angka valid.');
      error.statusCode = 400;
      throw error;
    }

    const sql = `
      INSERT INTO pickup_points (
        name, address, location, latitude, longitude, open_hour, close_hour, pic_name, pic_phone
      ) VALUES (
        $1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $4, $3, $5, $6, $7, $8
      )
      RETURNING id, name, address, latitude, longitude, open_hour AS "openTime", close_hour AS "closeTime", pic_name AS "picName", pic_phone AS "picPhone", is_active AS "isActive", created_at
    `;

    const result = await db.query(sql, [name, address, lng, lat, openHour, closeHour, picName, picPhone]);
    return result.rows[0];
  }

  async updatePickupPoint(id, { name, address, latitude, longitude, openHour, closeHour, picName, picPhone, isActive }) {
    const current = await this.getPickupPointById(id);

    const lat = latitude !== undefined ? parseFloat(latitude) : current.latitude;
    const lng = longitude !== undefined ? parseFloat(longitude) : current.longitude;
    const active = isActive !== undefined ? isActive : current.isActive;

    const sql = `
      UPDATE pickup_points
      SET 
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        location = ST_SetSRID(ST_MakePoint($3, $4), 4326),
        latitude = $4,
        longitude = $3,
        open_hour = COALESCE($5, open_hour),
        close_hour = COALESCE($6, close_hour),
        pic_name = COALESCE($7, pic_name),
        pic_phone = COALESCE($8, pic_phone),
        is_active = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING id, name, address, latitude, longitude, open_hour AS "openTime", close_hour AS "closeTime", pic_name AS "picName", pic_phone AS "picPhone", is_active AS "isActive", updated_at
    `;

    const result = await db.query(sql, [name, address, lng, lat, openHour, closeHour, picName, picPhone, active, id]);
    return result.rows[0];
  }

  async deletePickupPoint(id) {
    // Cek keterkaitan donasi aktif
    const checkDonations = await db.query(
      "SELECT id FROM donations WHERE pickup_point_id = $1 AND status = 'TERSEDIA'",
      [id]
    );

    if (checkDonations.rows.length > 0) {
      const error = new Error('Tidak dapat menghapus titik pengambilan karena masih memiliki donasi aktif. Silakan nonaktifkan (soft delete) sebagai alternatif.');
      error.statusCode = 400;
      throw error;
    }

    // Soft delete dengan menonaktifkan is_active = FALSE
    const sql = `
      UPDATE pickup_points 
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING id, name, is_active AS "isActive"
    `;

    const result = await db.query(sql, [id]);
    if (result.rows.length === 0) {
      const error = new Error('Titik lokasi pengambilan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    return result.rows[0];
  }
}

module.exports = new LokasiService();

