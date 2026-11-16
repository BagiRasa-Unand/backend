const db = require('../../config/database');
const fcmService = require('./fcm.service');

class NotifikasiService {
  async createNotification(userId, { title, body, metadata = {} }) {
    // 1. Simpan riwayat ke tabel notifications
    const sql = `
      INSERT INTO notifications (user_id, title, body, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, title, body, metadata, is_read, created_at
    `;

    const res = await db.query(sql, [userId, title, body, JSON.stringify(metadata)]);
    const notification = res.rows[0];

    // 2. Cari token FCM pengguna di user_devices
    const devicesRes = await db.query(
      'SELECT fcm_token FROM user_devices WHERE user_id = $1',
      [userId]
    );

    const tokens = devicesRes.rows.map((r) => r.fcm_token);
    if (tokens.length > 0) {
      await fcmService.sendMulticastNotification(tokens, {
        title,
        body,
        data: {
          notificationId: notification.id,
          ...metadata,
        },
      });
    }

    return notification;
  }

  async broadcastNewDonation(donation) {
    const title = '🍲 Makanan Baru Tersedia!';
    const body = `Ada donasi baru "${donation.name}" di ${donation.pickupPointName}. Buruan ambil sebelum kehabisan!`;

    // Ambil token semua pengguna dengan role PENERIMA yang aktif
    const recipientsRes = await db.query(`
      SELECT ud.fcm_token, u.id as user_id
      FROM user_devices ud
      JOIN users u ON ud.user_id = u.id
      WHERE u.role = 'PENERIMA' AND u.is_active = TRUE
      LIMIT 100
    `);

    const tokens = recipientsRes.rows.map((r) => r.fcm_token);
    if (tokens.length > 0) {
      await fcmService.sendMulticastNotification(tokens, {
        title,
        body,
        data: {
          type: 'NEW_DONATION',
          donationId: donation.id,
        },
      });
    }
  }

  async notifyClaimStatus({ claimId, recipientId, donorId, status, notes, claimCode }) {
    let title = 'Status Klaim Diperbarui';
    let body = `Status klaim Anda sekarang: ${status}`;

    if (status === 'MENUNGGU_PENGAMBILAN') {
      title = '🎉 Klaim Disetujui!';
      body = `Klaim Anda telah disetujui. Tunjukkan kode ${claimCode} saat pengambilan makanan.`;
    } else if (status === 'SELESAI') {
      title = '✅ Penyerahan Selesai';
      body = 'Terima kasih telah menyelamatkan makanan hari ini bersama BagiRasa!';
    } else if (status === 'BATAL_KEDALUWARSA') {
      title = '⌛ Waktu Klaim Hangus';
      body = 'Batas waktu pengambilan telah habis. Makanan telah dikembalikan ke donasi.';
    } else if (status === 'DIBATALKAN_PENGGUNA') {
      title = '❌ Klaim Dibatalkan';
      body = notes ? `Klaim dibatalkan: ${notes}` : 'Klaim Anda telah berhasil dibatalkan.';
    }

    await this.createNotification(recipientId, {
      title,
      body,
      metadata: {
        type: 'CLAIM_STATUS_UPDATE',
        claimId,
        status,
        claimCode,
      },
    });
  }

  async getUserNotifications(userId, { limit = 30 } = {}) {
    const sql = `
      SELECT id, title, body, metadata, is_read AS "isRead", created_at AS "createdAt"
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const res = await db.query(sql, [userId, limit]);
    return res.rows;
  }

  async markAsRead(userId, notificationId) {
    const sql = `
      UPDATE notifications
      SET is_read = TRUE
      WHERE id = $1 AND user_id = $2
      RETURNING id, is_read AS "isRead"
    `;

    const res = await db.query(sql, [notificationId, userId]);
    if (res.rows.length === 0) {
      const error = new Error('Notifikasi tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    return res.rows[0];
  }
}

module.exports = new NotifikasiService();

