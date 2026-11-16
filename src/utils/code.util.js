const crypto = require('crypto');

/**
 * Menghasilkan kode unik klaim dengan format: BGR-XXXX (contoh: BGR-7X9A)
 */
function generateClaimCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Tanpa huruf/angka ambigu (O, 0, 1, I)
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    randomPart += chars[randomIndex];
  }
  return `BGR-${randomPart}`;
}

/**
 * Menghasilkan string QR payload untuk validasi serah terima di titik ambil
 */
function generateQRPayload({ claimId, claimCode, donationId, recipientId }) {
  const payload = {
    app: 'BagiRasa',
    cid: claimId,
    code: claimCode,
    did: donationId,
    uid: recipientId,
    t: Date.now(),
  };
  return JSON.stringify(payload);
}

module.exports = {
  generateClaimCode,
  generateQRPayload,
};

