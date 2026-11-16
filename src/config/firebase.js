const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const config = require('./env');

let fcmAvailable = false;

if (config.firebase.serviceAccountPath) {
  const resolvedPath = path.resolve(process.cwd(), config.firebase.serviceAccountPath);
  if (fs.existsSync(resolvedPath)) {
    try {
      const serviceAccount = require(resolvedPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      fcmAvailable = true;
      console.log('✅ Firebase Admin SDK berhasil diinisialisasi.');
    } catch (err) {
      console.warn('⚠️ Gagal inisialisasi Firebase Admin SDK:', err.message);
    }
  } else {
    console.warn(`⚠️ File service account Firebase tidak ditemukan di: ${resolvedPath}. Push notification FCM dalam mode simulasi.`);
  }
} else {
  // Mode simulasi / dev
  console.log('ℹ️ Firebase FCM: Belum ada kredensial service account (dev mode simulasi aktif).');
}

module.exports = {
  admin,
  fcmAvailable,
};
