const db = require('../../config/database');

class DonasiService {
  async getCategories() {
    const result = await db.query('SELECT id, name, slug, icon_url FROM categories ORDER BY id ASC');
    return result.rows;
  }

  async getDonations({
    categoryId,
    pickupPointId,
    isHalal,
    isUrgent,
    status,
    search,
    page = 1,
    limit = 20,
  } = {}) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (status && status !== 'all' && status !== '*') {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }

    if (categoryId) {
      params.push(categoryId);
      conditions.push(`d.category_id = $${params.length}`);
    }

    if (pickupPointId) {
      params.push(pickupPointId);
      conditions.push(`d.pickup_point_id = $${params.length}`);
    }

    if (isHalal !== undefined) {
      params.push(isHalal === 'true' || isHalal === true);
      conditions.push(`d.is_halal = $${params.length}`);
    }

    if (isUrgent !== undefined) {
      params.push(isUrgent === 'true' || isUrgent === true);
      conditions.push(`d.is_urgent = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(d.title ILIKE $${params.length} OR d.description ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total Count
    const countSql = `SELECT COUNT(*) FROM donations d ${whereClause}`;
    const countRes = await db.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    // Data query dengan join foto dan lokasi
    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const dataSql = `
      SELECT 
        d.id,
        d.donor_id AS "donorId",
        u.full_name AS "donorName",
        d.title AS "name",
        d.description,
        d.category_id AS "categoryId",
        c.name AS "categoryName",
        d.pickup_point_id AS "pickupPointId",
        p.name AS "pickupPointName",
        p.latitude AS "pickupLatitude",
        p.longitude AS "pickupLongitude",
        d.total_portions AS "quantityTotal",
        d.remaining_portions AS "quantityRemaining",
        (d.total_portions - d.remaining_portions) AS "claimedQuantity",
        'porsi' AS "unit",
        d.is_halal AS "isHalal",
        d.is_urgent AS "isUrgent",
        d.status,
        d.pickup_start_at AS "pickupStartAt",
        d.pickup_end_at AS "pickupEndAt",
        d.expires_at AS "expiresAt",
        d.created_at AS "createdAt",
        (
          SELECT photo_url 
          FROM donation_photos 
          WHERE donation_id = d.id 
          ORDER BY is_primary DESC, created_at ASC 
          LIMIT 1
        ) AS "photoPath",
        (
          SELECT json_agg(json_build_object('id', dp.id, 'photoUrl', dp.photo_url, 'isPrimary', dp.is_primary))
          FROM donation_photos dp
          WHERE dp.donation_id = d.id
        ) AS "photos"
      FROM donations d
      JOIN users u ON d.donor_id = u.id
      JOIN pickup_points p ON d.pickup_point_id = p.id
      JOIN categories c ON d.category_id = c.id
      ${whereClause}
      ORDER BY d.is_urgent DESC, d.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const dataRes = await db.query(dataSql, params);

    return {
      items: dataRes.rows,
      meta: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDonationById(id) {
    const sql = `
      SELECT 
        d.id,
        d.donor_id AS "donorId",
        u.full_name AS "donorName",
        u.phone AS "donorPhone",
        d.title AS "name",
        d.description,
        d.category_id AS "categoryId",
        c.name AS "categoryName",
        d.pickup_point_id AS "pickupPointId",
        p.name AS "pickupPointName",
        p.address AS "pickupAddress",
        p.latitude AS "pickupLatitude",
        p.longitude AS "pickupLongitude",
        p.open_hour AS "pickupOpenHour",
        p.close_hour AS "pickupCloseHour",
        d.total_portions AS "quantityTotal",
        d.remaining_portions AS "quantityRemaining",
        (d.total_portions - d.remaining_portions) AS "claimedQuantity",
        'porsi' AS "unit",
        d.is_halal AS "isHalal",
        d.is_urgent AS "isUrgent",
        d.status,
        d.pickup_start_at AS "pickupStartAt",
        d.pickup_end_at AS "pickupEndAt",
        d.expires_at AS "expiresAt",
        d.created_at AS "createdAt",
        (
          SELECT photo_url 
          FROM donation_photos 
          WHERE donation_id = d.id 
          ORDER BY is_primary DESC, created_at ASC 
          LIMIT 1
        ) AS "photoPath",
        (
          SELECT json_agg(json_build_object('id', dp.id, 'photoUrl', dp.photo_url, 'isPrimary', dp.is_primary))
          FROM donation_photos dp
          WHERE dp.donation_id = d.id
        ) AS "photos"
      FROM donations d
      JOIN users u ON d.donor_id = u.id
      JOIN pickup_points p ON d.pickup_point_id = p.id
      JOIN categories c ON d.category_id = c.id
      WHERE d.id = $1
    `;

    const result = await db.query(sql, [id]);
    if (result.rows.length === 0) {
      const error = new Error('Donasi makanan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    return result.rows[0];
  }

  async createDonation(donorId, data, files = []) {
    const {
      title,
      description,
      categoryId,
      pickupPointId,
      totalPortions,
      isHalal = true,
      isUrgent = false,
      pickupStartAt,
      pickupEndAt,
      expiresAt,
    } = data;

    const portions = parseInt(totalPortions, 10);
    if (isNaN(portions) || portions <= 0) {
      const error = new Error('Jumlah porsi harus lebih dari 0.');
      error.statusCode = 400;
      throw error;
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const insertDonationSql = `
        INSERT INTO donations (
          donor_id, pickup_point_id, category_id, title, description,
          total_portions, remaining_portions, is_halal, is_urgent,
          pickup_start_at, pickup_end_at, expires_at, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, 'TERSEDIA'
        )
        RETURNING id, title, total_portions, remaining_portions, status, created_at
      `;

      const start = pickupStartAt || new Date().toISOString();
      const end = pickupEndAt || new Date(Date.now() + 4 * 3600 * 1000).toISOString();
      const exp = expiresAt || end;

      const donationRes = await client.query(insertDonationSql, [
        donorId,
        pickupPointId,
        parseInt(categoryId, 10),
        title,
        description,
        portions,
        isHalal === 'true' || isHalal === true,
        isUrgent === 'true' || isUrgent === true,
        start,
        end,
        exp,
      ]);

      const donation = donationRes.rows[0];

      // Simpan foto makanan
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const photoUrl = `/uploads/donations/${file.filename}`;
          const isPrimary = i === 0;

          await client.query(
            'INSERT INTO donation_photos (donation_id, photo_url, is_primary) VALUES ($1, $2, $3)',
            [donation.id, photoUrl, isPrimary]
          );
        }
      }

      await client.query('COMMIT');

      return await this.getDonationById(donation.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateDonation(donorId, id, data) {
    const current = await this.getDonationById(id);

    if (current.donorId !== donorId) {
      const error = new Error('Anda tidak memiliki izin mengubah donasi ini.');
      error.statusCode = 403;
      throw error;
    }

    const { title, description, isHalal, isUrgent, pickupEndAt, expiresAt } = data;

    const sql = `
      UPDATE donations
      SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        is_halal = COALESCE($3, is_halal),
        is_urgent = COALESCE($4, is_urgent),
        pickup_end_at = COALESCE($5, pickup_end_at),
        expires_at = COALESCE($6, expires_at),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING id
    `;

    await db.query(sql, [title, description, isHalal, isUrgent, pickupEndAt, expiresAt, id]);
    return await this.getDonationById(id);
  }

  async cancelDonation(donorId, id) {
    const current = await this.getDonationById(id);

    if (current.donorId !== donorId) {
      const error = new Error('Anda tidak memiliki izin membatalkan donasi ini.');
      error.statusCode = 403;
      throw error;
    }

    const sql = `
      UPDATE donations
      SET status = 'DIBATALKAN', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, status
    `;

    const res = await db.query(sql, [id]);
    return res.rows[0];
  }

  async getMyDonations(donorId) {
    const sql = `
      SELECT 
        d.id,
        d.donor_id AS "donorId",
        d.title AS "name",
        d.description,
        d.total_portions AS "quantityTotal",
        d.remaining_portions AS "quantityRemaining",
        (d.total_portions - d.remaining_portions) AS "claimedQuantity",
        'porsi' AS "unit",
        d.status,
        d.created_at AS "createdAt",
        d.expires_at AS "expiresAt",
        p.name AS "pickupPointName",
        (
          SELECT photo_url 
          FROM donation_photos 
          WHERE donation_id = d.id 
          ORDER BY is_primary DESC, created_at ASC 
          LIMIT 1
        ) AS "photoPath"
      FROM donations d
      JOIN pickup_points p ON d.pickup_point_id = p.id
      WHERE d.donor_id = $1
      ORDER BY d.created_at DESC
    `;

    const result = await db.query(sql, [donorId]);
    return result.rows;
  }

  async getDonorStats(donorId) {
    const sql = `
      SELECT
        COALESCE(SUM(total_portions - remaining_portions), 0)::int AS "totalSaved",
        COUNT(id)::int AS "totalListings",
        COUNT(id) FILTER (WHERE status = 'KEDALUWARSA')::int AS "expiredCount"
      FROM donations
      WHERE donor_id = $1
    `;

    const result = await db.query(sql, [donorId]);
    return result.rows[0];
  }
}

module.exports = new DonasiService();

