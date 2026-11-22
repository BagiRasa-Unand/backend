const db = require('../../config/database');
const { generateClaimCode, generateQRPayload } = require('../../utils/code.util');
const notifikasiService = require('../notifikasi/notifikasi.service');

class KlaimService {
  /**
   * Helper internal: Mempromosikan antrean FIFO berikutnya saat kuota tersedia kembali.
   * Dijalankan dalam transaksi yang sama.
   */
  async promoteNextInQueue(client, donationId) {
    // 1. Ambil donasi dengan FOR UPDATE untuk melihat kuota tersisa
    const donRes = await client.query(
      `SELECT id, remaining_portions, status, expires_at, title 
       FROM donations 
       WHERE id = $1 
       FOR UPDATE`,
      [donationId]
    );

    if (donRes.rows.length === 0) return null;
    const donation = donRes.rows[0];

    // Jika donasi sudah tidak aktif atau kuota 0, tidak bisa mempromosikan
    if (donation.remaining_portions <= 0 || donation.status === 'KEDALUWARSA' || donation.status === 'DIBATALKAN') {
      return null;
    }

    // 2. Ambil antrean FIFO terdepan
    const queuedRes = await client.query(
      `SELECT c.id, c.recipient_id, c.portion_count, c.claim_code, c.queue_order
       FROM claims c
       WHERE c.donation_id = $1 AND c.status = 'ANTRE'
       ORDER BY c.queue_order ASC, c.claimed_at ASC
       LIMIT 1
       FOR UPDATE`,
      [donationId]
    );

    if (queuedRes.rows.length === 0) return null;
    const nextClaim = queuedRes.rows[0];

    // 3. Evaluasi apakah kuota mencukupi porsi yang diminta
    if (donation.remaining_portions < nextClaim.portion_count) {
      return null; // Kuota belum cukup untuk klaim ini, tetap antre
    }

    // 4. Kurangi stok dan update status donasi
    const newRemaining = donation.remaining_portions - nextClaim.portion_count;
    await client.query(
      `UPDATE donations
       SET
         remaining_portions = $1,
         status = CASE WHEN $1 = 0 THEN 'HABIS'::donation_status_enum ELSE status END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newRemaining, donationId]
    );

    // 5. Update klaim dari ANTRE menjadi MENUNGGU_PENGAMBILAN
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const donationExpiry = new Date(donation.expires_at);
    const expiresAt = twoHoursLater < donationExpiry ? twoHoursLater : donationExpiry;

    await client.query(
      `UPDATE claims
       SET 
         status = 'MENUNGGU_PENGAMBILAN',
         expires_at = $1,
         decided_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [expiresAt, nextClaim.id]
    );

    // 6. Catat log riwayat
    await client.query(
      `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
       VALUES ($1, 'ANTRE', 'MENUNGGU_PENGAMBILAN', 'Otomatis maju dari antrean FIFO.')`,
      [nextClaim.id]
    );

    // 7. Notifikasi ke pengguna yang berhasil naik antrean
    notifikasiService.notifyClaimStatus({
      claimId: nextClaim.id,
      recipientId: nextClaim.recipient_id,
      status: 'PROMOTED',
      claimCode: nextClaim.claim_code,
    }).catch((e) => console.warn('⚠️ Gagal kirim notif promosi antrean:', e.message));

    // Rekursif: Cek apakah sisa kuota masih bisa mempromosikan antrean berikutnya
    if (newRemaining > 0) {
      await this.promoteNextInQueue(client, donationId);
    }

    return nextClaim;
  }

  /**
   * Prosedur Kritis: Pengajuan Klaim Makanan (Anti Race-Condition + FIFO Queue)
   * Sesuai PRD Section 3.4, 6, & 10.3
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

      // 1. Kunci baris donasi dengan FOR UPDATE agar transaksi konkuren menunggu
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

      // 2. Evaluasi kondisi aktif dan masa berlaku
      if (donation.status === 'KEDALUWARSA' || donation.status === 'DIBATALKAN') {
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

      // Cek apakah user yang sama sudah punya klaim aktif atau antre pada donasi ini
      const activeClaimRes = await client.query(
        `SELECT id, status, claim_code 
         FROM claims 
         WHERE donation_id = $1 AND recipient_id = $2 
           AND status IN ('MENUNGGU_PENGAMBILAN', 'MENUNGGU_PERSETUJUAN', 'ANTRE')`,
        [donationId, recipientId]
      );

      if (activeClaimRes.rows.length > 0) {
        const existing = activeClaimRes.rows[0];
        const error = new Error(
          `Anda sudah memiliki transaksi klaim aktif untuk donasi ini (Kode: ${existing.claim_code}, Status: ${existing.status}).`
        );
        error.statusCode = 400;
        throw error;
      }

      // Cek apakah sudah ada antrean aktif pada donasi ini
      const queueCheckRes = await client.query(
        "SELECT COUNT(*)::int AS count FROM claims WHERE donation_id = $1 AND status = 'ANTRE'",
        [donationId]
      );
      const hasExistingQueue = queueCheckRes.rows[0].count > 0;

      const claimCode = generateClaimCode();

      // =========================================================================
      // CABANG A: Masuk Antrean FIFO jika kuota tidak cukup ATAU sudah ada antrean
      // =========================================================================
      if (hasExistingQueue || donation.remaining_portions < portionCount || donation.status === 'HABIS') {
        // Ambil nomor urutan antrean berikutnya
        const orderRes = await client.query(
          "SELECT COALESCE(MAX(queue_order), 0)::int + 1 AS next_order FROM claims WHERE donation_id = $1",
          [donationId]
        );
        const queueOrder = orderRes.rows[0].next_order;

        const tempQr = generateQRPayload({
          claimId: 'temp',
          claimCode,
          donationId,
          recipientId,
        });

        const insertQueueSql = `
          INSERT INTO claims (
            donation_id, recipient_id, portion_count, claim_code, qr_payload, status, queue_order, expires_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'ANTRE', $6, $7
          )
          RETURNING id, donation_id, recipient_id, portion_count, claim_code, qr_payload, status, queue_order, expires_at, claimed_at
        `;

        const queueRes = await client.query(insertQueueSql, [
          donationId,
          recipientId,
          portionCount,
          claimCode,
          tempQr,
          queueOrder,
          donation.expires_at, // Batas antrean mengikuti masa berlaku donasi
        ]);

        const claim = queueRes.rows[0];
        const realQr = generateQRPayload({
          claimId: claim.id,
          claimCode,
          donationId,
          recipientId,
        });
        await client.query('UPDATE claims SET qr_payload = $1 WHERE id = $2', [realQr, claim.id]);
        claim.qr_payload = realQr;

        // Catat log
        await client.query(
          `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
           VALUES ($1, NULL, 'ANTRE', $2)`,
          [claim.id, `Klaim masuk ke antrean FIFO (Urutan ke-${queueOrder}).`]
        );

        await client.query('COMMIT');

        // Notifikasi ke penerima bahwa klaim masuk antrean
        notifikasiService.createNotification(recipientId, {
          title: '⏳ Masuk Antrean Klaim (FIFO)',
          body: `Permintaan ${portionCount} porsi "${donation.title}" masuk dalam antrean (Urutan ke-${queueOrder}).`,
          metadata: {
            type: 'CLAIM_QUEUED',
            claimId: claim.id,
            donationId,
            queueOrder,
          },
        }).catch((e) => console.warn('⚠️ Gagal kirim notif antrean:', e.message));

        const detail = await this.getClaimById(claim.id);
        detail.isQueued = true;
        detail.message = `Klaim Anda masuk antrean ke-${queueOrder} (FIFO) karena kuota aktif sedang penuh/dipesan.`;
        return detail;
      }

      // =========================================================================
      // CABANG B: Kuota cukup & antrean kosong -> Klaim langsung aktif
      // =========================================================================
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

      // Batas waktu ambil: 2 jam dari sekarang atau batas donasi (mana yang lebih dulu)
      const twoHours = new Date(Date.now() + hoursValid * 60 * 60 * 1000);
      const donExpiry = new Date(donation.expires_at);
      const expiresAt = twoHours < donExpiry ? twoHours : donExpiry;

      const tempQr = generateQRPayload({
        claimId: 'temp',
        claimCode,
        donationId,
        recipientId,
      });

      const insertClaimSql = `
        INSERT INTO claims (
          donation_id, recipient_id, portion_count, claim_code, qr_payload, status, queue_order, expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'MENUNGGU_PENGAMBILAN', 0, $6
        )
        RETURNING id, donation_id, recipient_id, portion_count, claim_code, qr_payload, status, queue_order, expires_at, claimed_at
      `;

      const claimRes = await client.query(insertClaimSql, [
        donationId,
        recipientId,
        portionCount,
        claimCode,
        tempQr,
        expiresAt,
      ]);

      const claim = claimRes.rows[0];

      const realQr = generateQRPayload({
        claimId: claim.id,
        claimCode,
        donationId,
        recipientId,
      });
      await client.query('UPDATE claims SET qr_payload = $1 WHERE id = $2', [realQr, claim.id]);
      claim.qr_payload = realQr;

      // Catat log
      await client.query(
        `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
         VALUES ($1, NULL, 'MENUNGGU_PENGAMBILAN', 'Klaim berhasil dibuat oleh penerima.')`,
        [claim.id]
      );

      await client.query('COMMIT');

      // Trigger notifikasi ke pendonor
      notifikasiService.createNotification(donation.donor_id, {
        title: '📥 Klaim Baru Masuk',
        body: `Seseorang telah mengklaim ${portionCount} porsi "${donation.title}".`,
        metadata: {
          type: 'NEW_CLAIM',
          claimId: claim.id,
          donationId,
        },
      }).catch((e) => console.warn('⚠️ Gagal kirim notif klaim ke donor:', e.message));

      const detail = await this.getClaimById(claim.id);
      detail.isQueued = false;
      return detail;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * REST API Keputusan Pendonor: Terima atau Tolak klaim masuk
   * Sesuai PRD Section 3.4, 7.2 D, & 10.3
   */
  async decisionClaim({ claimId, donorId, action, reason }) {
    const act = (action || '').toUpperCase();
    if (act !== 'ACCEPT' && act !== 'REJECT' && act !== 'TERIMA' && act !== 'TOLAK') {
      const error = new Error("Aksi keputusan tidak valid. Gunakan 'ACCEPT'/'TERIMA' atau 'REJECT'/'TOLAK'.");
      error.statusCode = 400;
      throw error;
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const selectSql = `
        SELECT c.id, c.donation_id, c.recipient_id, c.portion_count, c.status, c.claim_code, 
               d.donor_id, d.title AS donation_title, d.remaining_portions
        FROM claims c
        JOIN donations d ON c.donation_id = d.id
        WHERE c.id = $1
        FOR UPDATE OF c, d
      `;
      const res = await client.query(selectSql, [claimId]);

      if (res.rows.length === 0) {
        const error = new Error('Klaim tidak ditemukan.');
        error.statusCode = 404;
        throw error;
      }

      const claim = res.rows[0];

      // Verifikasi pemilik listing donasi
      if (claim.donor_id !== donorId) {
        const error = new Error('Anda tidak memiliki izin mengambil keputusan untuk klaim donasi ini.');
        error.statusCode = 403;
        throw error;
      }

      if (claim.status === 'SELESAI' || claim.status === 'DITOLAK' || claim.status === 'DIBATALKAN_PENGGUNA') {
        const error = new Error(`Klaim tidak dapat diproses lagi (Status saat ini: ${claim.status}).`);
        error.statusCode = 400;
        throw error;
      }

      // ==========================
      // KASUS 1: Pendonor MENERIMA
      // ==========================
      if (act === 'ACCEPT' || act === 'TERIMA') {
        await client.query(
          `UPDATE claims 
           SET status = 'MENUNGGU_PENGAMBILAN', decided_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [claimId]
        );

        await client.query(
          `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
           VALUES ($1, $2, 'MENUNGGU_PENGAMBILAN', 'Klaim disetujui oleh pendonor.')`,
          [claimId, claim.status]
        );

        await client.query('COMMIT');

        notifikasiService.notifyClaimStatus({
          claimId,
          recipientId: claim.recipient_id,
          status: 'MENUNGGU_PENGAMBILAN',
          claimCode: claim.claim_code,
        }).catch((e) => console.warn(e.message));

        return await this.getClaimById(claimId);
      }

      // ==========================
      // KASUS 2: Pendonor MENOLAK
      // ==========================
      const rejectReason = reason || 'Ditolak oleh pendonor';

      // Update klaim menjadi DITOLAK
      await client.query(
        `UPDATE claims 
         SET status = 'DITOLAK', reject_reason = $1, decided_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [rejectReason, claimId]
      );

      // Kembalikan kuota jika klaim sebelumnya memegang porsi (bukan dalam status antre)
      if (claim.status === 'MENUNGGU_PENGAMBILAN' || claim.status === 'MENUNGGU_PERSETUJUAN') {
        await client.query(
          `UPDATE donations
           SET 
             remaining_portions = remaining_portions + $1,
             status = CASE WHEN status = 'HABIS' THEN 'TERSEDIA'::donation_status_enum ELSE status END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [claim.portion_count, claim.donation_id]
        );
      }

      await client.query(
        `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
         VALUES ($1, $2, 'DITOLAK', $3)`,
        [claimId, claim.status, rejectReason]
      );

      // AUTO-PROMOTION FIFO: Majukan antrean berikutnya jika ada
      await this.promoteNextInQueue(client, claim.donation_id);

      await client.query('COMMIT');

      notifikasiService.notifyClaimStatus({
        claimId,
        recipientId: claim.recipient_id,
        status: 'DITOLAK',
        notes: rejectReason,
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

  /**
   * Pembatalan Klaim oleh Pengguna / Pemohon (dengan Auto-Promotion FIFO)
   */
  async cancelClaim({ claimId, userId, reason }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const selectClaimSql = `
        SELECT c.id, c.donation_id, c.recipient_id, c.portion_count, c.status, c.claim_code, d.donor_id
        FROM claims c
        JOIN donations d ON c.donation_id = d.id
        WHERE c.id = $1
        FOR UPDATE OF c, d
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

      if (claim.status === 'SELESAI' || claim.status === 'DITOLAK' || claim.status === 'BATAL_KEDALUWARSA') {
        const error = new Error(`Klaim tidak dapat dibatalkan (Status saat ini: ${claim.status}).`);
        error.statusCode = 400;
        throw error;
      }

      // 1. Update status klaim menjadi DIBATALKAN_PENGGUNA
      await client.query(
        "UPDATE claims SET status = 'DIBATALKAN_PENGGUNA' WHERE id = $1",
        [claimId]
      );

      // 2. Kembalikan kuota porsi ke tabel donasi jika klaim sebelumnya memegang stok
      if (claim.status === 'MENUNGGU_PENGAMBILAN' || claim.status === 'MENUNGGU_PERSETUJUAN') {
        await client.query(
          `UPDATE donations
           SET 
             remaining_portions = remaining_portions + $1,
             status = CASE WHEN status = 'HABIS' THEN 'TERSEDIA'::donation_status_enum ELSE status END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [claim.portion_count, claim.donation_id]
        );
      }

      // 3. Catat log
      await client.query(
        `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
         VALUES ($1, $2, 'DIBATALKAN_PENGGUNA', $3)`,
        [claimId, claim.status, reason || 'Dibatalkan oleh pengguna']
      );

      // 4. Auto-promotion FIFO jika ada antrean
      await this.promoteNextInQueue(client, claim.donation_id);

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

  /**
   * Verifikasi serah terima makanan fisik dengan Kode Unik / QR
   * Sesuai PRD Section 3.4 & 10.3
   */
  async verifyPickup({ claimCode, qrPayload, verifierId }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      let queryCondition = '';
      let queryParam = '';

      if (claimCode) {
        queryCondition = 'c.claim_code = $1';
        queryParam = claimCode.trim().toUpperCase();
      } else if (qrPayload) {
        queryCondition = 'c.qr_payload = $1';
        queryParam = qrPayload.trim();
      } else {
        const error = new Error('Kode klaim (claimCode) atau QR payload wajib disertakan.');
        error.statusCode = 400;
        throw error;
      }

      const selectClaimSql = `
        SELECT c.id, c.donation_id, c.recipient_id, c.portion_count, c.status, c.expires_at, c.claim_code, d.donor_id
        FROM claims c
        JOIN donations d ON c.donation_id = d.id
        WHERE ${queryCondition}
        FOR UPDATE
      `;
      const claimRes = await client.query(selectClaimSql, [queryParam]);

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
        claimCode: claim.claim_code,
      }).catch((e) => console.warn(e.message));

      return await this.getClaimById(claim.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Detail tiket klaim tunggal
   */
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
        recipient.phone AS "recipientPhone",
        c.portion_count AS "quantity",
        c.claim_code AS "claimCode",
        c.qr_payload AS "qrPayload",
        c.status,
        c.queue_order AS "queueOrder",
        c.reject_reason AS "rejectReason",
        c.decided_at AS "decidedAt",
        c.expires_at AS "expiresAt",
        c.claimed_at AS "claimedAt",
        c.completed_at AS "completedAt",
        p.name AS "pickupPointName",
        p.address AS "pickupAddress",
        p.latitude::float AS "pickupLatitude",
        p.longitude::float AS "pickupLongitude",
        (
          SELECT photo_url 
          FROM donation_photos 
          WHERE donation_id = d.id 
          ORDER BY is_primary DESC, created_at ASC 
          LIMIT 1
        ) AS "photoPath",
        CASE 
          WHEN c.status = 'ANTRE' THEN (
            SELECT COUNT(*)::int + 1 
            FROM claims q 
            WHERE q.donation_id = c.donation_id 
              AND q.status = 'ANTRE' 
              AND (q.queue_order < c.queue_order OR (q.queue_order = c.queue_order AND q.claimed_at < c.claimed_at))
          )
          ELSE NULL 
        END AS "queuePosition"
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

  /**
   * Riwayat klaim milik pengguna (Klaim Saya)
   */
  async getMyClaims(recipientId) {
    const sql = `
      SELECT 
        c.id,
        c.donation_id AS "donationId",
        d.title AS "donationTitle",
        donor.full_name AS "donorName",
        donor.phone AS "donorPhone",
        c.portion_count AS "quantity",
        c.claim_code AS "claimCode",
        c.qr_payload AS "qrPayload",
        c.status,
        c.queue_order AS "queueOrder",
        c.reject_reason AS "rejectReason",
        c.decided_at AS "decidedAt",
        c.expires_at AS "expiresAt",
        c.claimed_at AS "claimedAt",
        c.completed_at AS "completedAt",
        p.name AS "pickupPointName",
        p.address AS "pickupAddress",
        p.latitude::float AS "pickupLatitude",
        p.longitude::float AS "pickupLongitude",
        (
          SELECT photo_url 
          FROM donation_photos 
          WHERE donation_id = d.id 
          ORDER BY is_primary DESC, created_at ASC 
          LIMIT 1
        ) AS "photoPath",
        CASE 
          WHEN c.status = 'ANTRE' THEN (
            SELECT COUNT(*)::int + 1 
            FROM claims q 
            WHERE q.donation_id = c.donation_id 
              AND q.status = 'ANTRE' 
              AND (q.queue_order < c.queue_order OR (q.queue_order = c.queue_order AND q.claimed_at < c.claimed_at))
          )
          ELSE NULL 
        END AS "queuePosition"
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

  /**
   * Daftar klaim masuk untuk donatur (Permintaan Masuk)
   */
  async getIncomingClaims(donorId, statusFilter) {
    let sql = `
      SELECT 
        c.id,
        c.donation_id AS "donationId",
        d.title AS "donationTitle",
        c.recipient_id AS "recipientId",
        recipient.full_name AS "recipientName",
        recipient.phone AS "recipientPhone",
        c.portion_count AS "quantity",
        c.claim_code AS "claimCode",
        c.qr_payload AS "qrPayload",
        c.status,
        c.queue_order AS "queueOrder",
        c.reject_reason AS "rejectReason",
        c.decided_at AS "decidedAt",
        c.expires_at AS "expiresAt",
        c.claimed_at AS "claimedAt",
        p.name AS "pickupPointName"
      FROM claims c
      JOIN donations d ON c.donation_id = d.id
      JOIN users recipient ON c.recipient_id = recipient.id
      JOIN pickup_points p ON d.pickup_point_id = p.id
      WHERE d.donor_id = $1
    `;

    const params = [donorId];
    if (statusFilter) {
      params.push(statusFilter);
      sql += ` AND c.status = $${params.length}`;
    }

    sql += ' ORDER BY c.claimed_at DESC';

    const res = await db.query(sql, params);
    return res.rows;
  }
}

module.exports = new KlaimService();
