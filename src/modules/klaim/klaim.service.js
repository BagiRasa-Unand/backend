const db = require('../../config/database');
const { generateClaimCode, generateQRPayload } = require('../../utils/code.util');
const notifikasiService = require('../notifikasi/notifikasi.service');

class KlaimService {
  /**
   * Prosedur Kritis: Transaksi Anti Race Condition dengan PostgreSQL FOR UPDATE
   * Sesuai PRD Section 6
   */
  async createClaim({ donationId, recipientId, requestedPortion = 1, hoursValid = 2 }) {
    const portionCount = parseInt(requestedPortion, 10);
    if (isNaN(portionCount) || portionCount <= 0) {
      const error = new Error('Jumlah porsi yang diminta harus minimal 1.');
      error.statusCode = 400;
      throw error;
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. Kunci baris donasi dengan FOR UPDATE agar transaksi lain menunggu
      const selectDonationSql = `
        SELECT id, donor_id, title, remaining_portions, total_portions, status, expires_at
        FROM donations
        WHERE id = $1
        FOR UPDATE
      `;
      const donationRes = await client.query(selectDonationSql, [donationId]);

      if (donationRes.rows.length === 0) {
        const error = new Error('Donasi makanan tidak ditemukan.');
        error.statusCode = 404;
        throw error;
      }

      const donation = donationRes.rows[0];

      // 2. Evaluasi kondisi ketersediaan dan masa berlaku
      if (donation.status !== 'TERSEDIA') {
        const error = new Error(`Donasi tidak tersedia lagi (Status: ${donation.status}).`);
        error.statusCode = 400;
        throw error;
      }

      const now = new Date();
      if (new Date(donation.expires_at) <= now) {
        const error = new Error('Waktu pengambilan donasi ini telah kedaluwarsa.');
        error.statusCode = 400;
        throw error;
      }

      if (donation.remaining_portions < portionCount) {
        const error = new Error(
          `Sisa kuota porsi tidak mencukupi (Tersisa: ${donation.remaining_portions} porsi, diminta: ${portionCount} porsi).`
        );
        error.statusCode = 409;
        throw error;
      }

      // 3. Kurangi kuota stok porsi secara atomik dan perbarui status jika habis
      const newRemaining = donation.remaining_portions - portionCount;
      const updateDonationSql = `
        UPDATE donations
        SET
          remaining_portions = $1,
          status = CASE WHEN $1 = 0 THEN 'HABIS'::donation_status_enum ELSE status END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;
      await client.query(updateDonationSql, [newRemaining, donationId]);

      // 4. Generate unique claim code & QR payload
      const claimCode = generateClaimCode();
      const expiresAt = new Date(Date.now() + hoursValid * 60 * 60 * 1000);

      const insertClaimSql = `
        INSERT INTO claims (
          donation_id, recipient_id, portion_count, claim_code, qr_payload, status, expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'MENUNGGU_PENGAMBILAN', $6
        )
        RETURNING id, donation_id, recipient_id, portion_count, claim_code, qr_payload, status, expires_at, claimed_at
      `;

      // Sementara qr_payload berisi kode klaim terenkripsi/payload JSON
      const tempQr = generateQRPayload({
        claimId: 'temp',
        claimCode,
        donationId,
        recipientId,
      });

      const claimRes = await client.query(insertClaimSql, [
        donationId,
        recipientId,
        portionCount,
        claimCode,
        tempQr,
        expiresAt,
      ]);

      const claim = claimRes.rows[0];

      // Update QR payload sebenarnya dengan id klaim
      const realQr = generateQRPayload({
        claimId: claim.id,
        claimCode,
        donationId,
        recipientId,
      });
      await client.query('UPDATE claims SET qr_payload = $1 WHERE id = $2', [realQr, claim.id]);
      claim.qr_payload = realQr;

      // 5. Catat log riwayat klaim
      await client.query(
        `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
         VALUES ($1, NULL, 'MENUNGGU_PENGAMBILAN', 'Klaim berhasil dibuat oleh penerima.')`,
        [claim.id]
      );

      await client.query('COMMIT');

      // Trigger Notifikasi ke pendonor tentang klaim baru
      notifikasiService.createNotification(donation.donor_id, {
        title: '📥 Klaim Baru Diterima',
        body: `Seseorang telah mengklaim ${portionCount} porsi "${donation.title}".`,
        metadata: {
          type: 'NEW_CLAIM',
          claimId: claim.id,
          donationId,
        },
      }).catch((e) => console.warn('⚠️ Gagal kirim notif klaim:', e.message));

      return await this.getClaimById(claim.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getClaimById(id) {
    const sql = `
      SELECT 
        c.id,
        c.donation_id AS "donationId",
        d.title AS "donationTitle",
        d.donor_id AS "donorId",
        donor.full_name AS "donorName",
        donor.phone AS "donorPhone",
        c.recipient_id AS "recipientId",
        recipient.full_name AS "recipientName",
        c.portion_count AS "quantity",
        c.claim_code AS "claimCode",
        c.qr_payload AS "qrPayload",
        c.status,
        c.expires_at AS "expiresAt",
        c.claimed_at AS "claimedAt",
        c.completed_at AS "completedAt",
        p.name AS "pickupPointName",
        p.address AS "pickupAddress",
        p.latitude AS "pickupLatitude",
        p.longitude AS "pickupLongitude",
        (
          SELECT photo_url 
          FROM donation_photos 
          WHERE donation_id = d.id 
          ORDER BY is_primary DESC, created_at ASC 
          LIMIT 1
        ) AS "photoPath"
      FROM claims c
      JOIN donations d ON c.donation_id = d.id
      JOIN users donor ON d.donor_id = donor.id
      JOIN users recipient ON c.recipient_id = recipient.id
      JOIN pickup_points p ON d.pickup_point_id = p.id
      WHERE c.id = $1
    `;

    const res = await db.query(sql, [id]);
    if (res.rows.length === 0) {
      const error = new Error('Data klaim tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    return res.rows[0];
  }

  async getMyClaims(recipientId) {
    const sql = `
      SELECT 
        c.id,
        c.donation_id AS "donationId",
        d.title AS "donationTitle",
        donor.full_name AS "donorName",
        c.portion_count AS "quantity",
        c.claim_code AS "claimCode",
        c.qr_payload AS "qrPayload",
        c.status,
        c.expires_at AS "expiresAt",
        c.claimed_at AS "claimedAt",
        c.completed_at AS "completedAt",
        p.name AS "pickupPointName",
        p.address AS "pickupAddress",
        p.latitude AS "pickupLatitude",
        p.longitude AS "pickupLongitude",
        (
          SELECT photo_url 
          FROM donation_photos 
          WHERE donation_id = d.id 
          ORDER BY is_primary DESC, created_at ASC 
          LIMIT 1
        ) AS "photoPath"
      FROM claims c
      JOIN donations d ON c.donation_id = d.id
      JOIN users donor ON d.donor_id = donor.id
      JOIN pickup_points p ON d.pickup_point_id = p.id
      WHERE c.recipient_id = $1
      ORDER BY c.claimed_at DESC
    `;

    const res = await db.query(sql, [recipientId]);
    return res.rows;
  }

  async getIncomingClaims(donorId) {
    const sql = `
      SELECT 
        c.id,
        c.donation_id AS "donationId",
        d.title AS "donationTitle",
        c.recipient_id AS "recipientId",
        recipient.full_name AS "recipientName",
        recipient.phone AS "recipientPhone",
        c.portion_count AS "quantity",
        c.claim_code AS "claimCode",
        c.status,
        c.expires_at AS "expiresAt",
        c.claimed_at AS "claimedAt"
      FROM claims c
      JOIN donations d ON c.donation_id = d.id
      JOIN users recipient ON c.recipient_id = recipient.id
      WHERE d.donor_id = $1
      ORDER BY c.claimed_at DESC
    `;

    const res = await db.query(sql, [donorId]);
    return res.rows;
  }

  async cancelClaim({ claimId, userId, reason }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const selectClaimSql = `
        SELECT c.id, c.donation_id, c.recipient_id, c.portion_count, c.status, c.claim_code, d.donor_id
        FROM claims c
        JOIN donations d ON c.donation_id = d.id
        WHERE c.id = $1
        FOR UPDATE
      `;
      const claimRes = await client.query(selectClaimSql, [claimId]);

      if (claimRes.rows.length === 0) {
        const error = new Error('Klaim tidak ditemukan.');
        error.statusCode = 404;
        throw error;
      }

      const claim = claimRes.rows[0];

      if (claim.recipient_id !== userId && claim.donor_id !== userId) {
        const error = new Error('Anda tidak memiliki izin membatalkan klaim ini.');
        error.statusCode = 403;
        throw error;
      }

      if (claim.status !== 'MENUNGGU_PENGAMBILAN') {
        const error = new Error(`Klaim tidak dapat dibatalkan (Status saat ini: ${claim.status}).`);
        error.statusCode = 400;
        throw error;
      }

      // 1. Update status klaim menjadi DIBATALKAN_PENGGUNA
      await client.query(
        "UPDATE claims SET status = 'DIBATALKAN_PENGGUNA' WHERE id = $1",
        [claimId]
      );

      // 2. Kembalikan kuota porsi ke tabel donasi
      await client.query(
        `UPDATE donations
         SET 
           remaining_portions = remaining_portions + $1,
           status = CASE WHEN status = 'HABIS' THEN 'TERSEDIA'::donation_status_enum ELSE status END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [claim.portion_count, claim.donation_id]
      );

      // 3. Catat log
      await client.query(
        `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
         VALUES ($1, 'MENUNGGU_PENGAMBILAN', 'DIBATALKAN_PENGGUNA', $2)`,
        [claimId, reason || 'Dibatalkan oleh pengguna']
      );

      await client.query('COMMIT');

      // Notifikasi
      notifikasiService.notifyClaimStatus({
        claimId,
        recipientId: claim.recipient_id,
        donorId: claim.donor_id,
        status: 'DIBATALKAN_PENGGUNA',
        notes: reason,
        claimCode: claim.claim_code,
      }).catch((e) => console.warn(e.message));

      return await this.getClaimById(claimId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async verifyPickup({ claimCode, verifierId }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const selectClaimSql = `
        SELECT c.id, c.donation_id, c.recipient_id, c.portion_count, c.status, c.expires_at, d.donor_id
        FROM claims c
        JOIN donations d ON c.donation_id = d.id
        WHERE c.claim_code = $1
        FOR UPDATE
      `;
      const claimRes = await client.query(selectClaimSql, [claimCode]);

      if (claimRes.rows.length === 0) {
        const error = new Error('Kode klaim tidak valid atau tidak ditemukan.');
        error.statusCode = 404;
        throw error;
      }

      const claim = claimRes.rows[0];

      if (claim.status !== 'MENUNGGU_PENGAMBILAN') {
        const error = new Error(`Klaim tidak dapat diverifikasi (Status saat ini: ${claim.status}).`);
        error.statusCode = 400;
        throw error;
      }

      if (new Date(claim.expires_at) < new Date()) {
        const error = new Error('Batas waktu penjemputan klaim ini telah hangus.');
        error.statusCode = 400;
        throw error;
      }

      // Update status menjadi SELESAI
      await client.query(
        `UPDATE claims 
         SET status = 'SELESAI', completed_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [claim.id]
      );

      // Catat log
      await client.query(
        `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
         VALUES ($1, 'MENUNGGU_PENGAMBILAN', 'SELESAI', 'Verifikasi penyerahan makanan fisik berhasil.')`,
        [claim.id]
      );

      await client.query('COMMIT');

      // Notifikasi ke penerima
      notifikasiService.notifyClaimStatus({
        claimId: claim.id,
        recipientId: claim.recipient_id,
        donorId: claim.donor_id,
        status: 'SELESAI',
        claimCode,
      }).catch((e) => console.warn(e.message));

      return await this.getClaimById(claim.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new KlaimService();

