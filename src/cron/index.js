const cron = require('node-cron');
const db = require('../config/database');
const notifikasiService = require('../modules/notifikasi/notifikasi.service');
const klaimService = require('../modules/klaim/klaim.service');

function initCronJobs() {
  console.log('⏰ Inisialisasi background cron scheduler...');

  // 1. Auto-expire Claim: setiap 5 menit
  cron.schedule('*/5 * * * *', async () => {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Cari klaim hangus
      const expiredClaimsRes = await client.query(`
        SELECT c.id, c.donation_id, c.portion_count, c.recipient_id, c.claim_code
        FROM claims c
        WHERE c.status = 'MENUNGGU_PENGAMBILAN' AND c.expires_at < NOW()
        FOR UPDATE
      `);

      for (const claim of expiredClaimsRes.rows) {
        // Update status klaim
        await client.query(
          "UPDATE claims SET status = 'BATAL_KEDALUWARSA' WHERE id = $1",
          [claim.id]
        );

        // Kembalikan porsi ke tabel donasi
        await client.query(
          `UPDATE donations 
           SET 
             remaining_portions = remaining_portions + $1,
             status = CASE WHEN status = 'HABIS' THEN 'TERSEDIA'::donation_status_enum ELSE status END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [claim.portion_count, claim.donation_id]
        );

        // Catat log
        await client.query(
          `INSERT INTO claim_logs (claim_id, from_status, to_status, notes)
           VALUES ($1, 'MENUNGGU_PENGAMBILAN', 'BATAL_KEDALUWARSA', 'Otomatis dibatalkan sistem karena melewati batas waktu pengambilan.')`,
          [claim.id]
        );

        // Kirim notifikasi
        notifikasiService.notifyClaimStatus({
          claimId: claim.id,
          recipientId: claim.recipient_id,
          status: 'BATAL_KEDALUWARSA',
          claimCode: claim.claim_code,
        }).catch((e) => console.warn(e.message));

        // Auto-promotion FIFO jika ada antrean yang menunggu
        await klaimService.promoteNextInQueue(client, claim.donation_id);
      }

      await client.query('COMMIT');
      if (expiredClaimsRes.rows.length > 0) {
        console.log(`[Cron] ⌛ ${expiredClaimsRes.rows.length} klaim hangus berhasil diproses & porsi dikembalikan.`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Cron] Error auto-expire claims:', err.message);
    } finally {
      client.release();
    }
  });

  // 2. Auto-expire Donation: setiap 15 menit
  cron.schedule('*/15 * * * *', async () => {
    try {
      const res = await db.query(`
        UPDATE donations
        SET status = 'KEDALUWARSA', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'TERSEDIA' AND (expires_at < NOW() OR pickup_end_at < NOW())
        RETURNING id, title
      `);

      if (res.rows.length > 0) {
        console.log(`[Cron] ⌛ ${res.rows.length} donasi kedaluwarsa berhasil diperbarui statusnya.`);
      }
    } catch (err) {
      console.error('[Cron] Error auto-expire donations:', err.message);
    }
  });

  // 3. Trigger FCM Reminder: setiap 10 menit (30 menit sebelum klaim hangus)
  cron.schedule('*/10 * * * *', async () => {
    try {
      const res = await db.query(`
        SELECT c.id, c.recipient_id, c.claim_code, d.title
        FROM claims c
        JOIN donations d ON c.donation_id = d.id
        WHERE c.status = 'MENUNGGU_PENGAMBILAN'
          AND c.expires_at BETWEEN NOW() AND NOW() + INTERVAL '35 MINUTES'
          AND NOT EXISTS (
            SELECT 1 FROM notifications n 
            WHERE n.user_id = c.recipient_id 
              AND n.metadata->>'type' = 'PICKUP_REMINDER_30M' 
              AND n.metadata->>'claimId' = c.id::text
          )
      `);

      for (const row of res.rows) {
        await notifikasiService.createNotification(row.recipient_id, {
          title: '⏰ Pengingat Pengambilan Makanan',
          body: `Batas waktu klaim "${row.title}" tersisa kurang dari 30 menit. Tunjukkan kode ${row.claim_code} ke petugas!`,
          metadata: {
            type: 'PICKUP_REMINDER_30M',
            claimId: row.id,
            claimCode: row.claim_code,
          },
        });
      }
    } catch (err) {
      console.error('[Cron] Error sending pickup reminders:', err.message);
    }
  });
}

module.exports = {
  initCronJobs,
};

