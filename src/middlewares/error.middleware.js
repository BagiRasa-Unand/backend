const { sendError } = require('../utils/response.util');

function errorHandler(err, req, res, next) {
  console.error('💥 Unhandled Error:', err);

  // Error dari Multer
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, {
        statusCode: 400,
        message: 'Ukuran file melebihi batas maksimal (5 MB).',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return sendError(res, {
        statusCode: 400,
        message: 'Jumlah file melebihi batas maksimal (5 foto).',
      });
    }
    return sendError(res, {
      statusCode: 400,
      message: `Kesalahan unggah media: ${err.message}`,
    });
  }

  // Error dari PostgreSQL
  if (err.code === '23505') {
    // Unique violation
    return sendError(res, {
      statusCode: 409,
      message: 'Data sudah ada atau terjadi konflik keunikan (unique constraint violation).',
      errors: err.detail,
    });
  }

  if (err.code === '23503') {
    // Foreign key violation
    return sendError(res, {
      statusCode: 400,
      message: 'Referensi data terkait tidak ditemukan (foreign key constraint).',
      errors: err.detail,
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Terjadi kesalahan internal pada server.';

  return sendError(res, {
    statusCode,
    message,
    errors: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
}

module.exports = errorHandler;
