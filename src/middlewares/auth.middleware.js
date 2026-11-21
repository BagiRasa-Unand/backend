const { verifyAccessToken } = require('../utils/jwt.util');
const { sendError } = require('../utils/response.util');

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Fallback otomatis saat mode development agar frontend dapat langsung testing
    if (process.env.NODE_ENV === 'development') {
      req.user = {
        id: 'a0000000-0000-0000-0000-000000000001',
        email: 'donor@bagirasa.com',
        role: 'DONATUR',
        fullName: 'Warung Bu Siti (Dev Mode)',
      };
      return next();
    }

    return sendError(res, {
      statusCode: 401,
      message: 'Akses ditolak. Token otorisasi tidak ditemukan.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // { id, email, role, full_name }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, {
        statusCode: 401,
        message: 'Token telah kadaluwarsa. Silakan refresh token atau login kembali.',
      });
    }
    return sendError(res, {
      statusCode: 403,
      message: 'Token tidak valid atau telah dimodifikasi.',
    });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, {
        statusCode: 401,
        message: 'Pengguna belum terautentikasi.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, {
        statusCode: 403,
        message: `Akses dilarang. Peran '${req.user.role}' tidak memiliki izin untuk aksi ini.`,
      });
    }

    next();
  };
}

function optionalToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = verifyAccessToken(token);
    } catch (e) {
      // Abaikan token jika tidak valid untuk route publik opsional
    }
  }
  next();
}

module.exports = {
  verifyToken,
  requireRole,
  optionalToken,
};
