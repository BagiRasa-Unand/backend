const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.resolve(__dirname, '../../uploads/donations');

// Pastikan direktori uploads/donations tersedia
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!ext || ext === '') {
      if (file.mimetype === 'image/png') ext = '.png';
      else if (file.mimetype === 'image/webp') ext = '.webp';
      else ext = '.jpg';
    }
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `donation-${uniqueSuffix}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.jfif'];

  if (
    allowedMimeTypes.includes(file.mimetype) ||
    (file.mimetype && file.mimetype.startsWith('image/')) ||
    allowedExtensions.includes(ext) ||
    file.mimetype === 'application/octet-stream'
  ) {
    cb(null, true);
  } else {
    const err = new Error('Format file tidak didukung! Hanya file gambar (JPG, PNG, WEBP) yang diizinkan.');
    err.statusCode = 400;
    cb(err, false);
  }
}

const uploadDonationPhotos = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Maksimal 10 MB per foto
    files: 5, // Maksimal 5 foto per listing donasi
  },
});

module.exports = {
  uploadDonationPhotos,
};

