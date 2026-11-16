const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../../utils/jwt.util');

class AuthService {
  async register({ email, password, fullName, phone, role = 'PENERIMA' }) {
    // Validasi email unik
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      const error = new Error('Email sudah terdaftar. Silakan gunakan email lain atau login.');
      error.statusCode = 409;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, phone, role, avatar_url, created_at`,
      [email, passwordHash, fullName, phone, role]
    );

    const user = result.rows[0];
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async login({ email, password }) {
    const result = await db.query(
      'SELECT id, email, password_hash, full_name, phone, role, avatar_url, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      const error = new Error('Email atau password tidak valid.');
      error.statusCode = 401;
      throw error;
    }

    const user = result.rows[0];

    if (!user.is_active) {
      const error = new Error('Akun dinonaktifkan. Silakan hubungi administrator.');
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const error = new Error('Email atau password tidak valid.');
      error.statusCode = 401;
      throw error;
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    delete user.password_hash;

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(refreshToken) {
    if (!refreshToken) {
      const error = new Error('Refresh token diperlukan.');
      error.statusCode = 400;
      throw error;
    }

    try {
      const decoded = verifyRefreshToken(refreshToken);
      const userRes = await db.query(
        'SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = $1',
        [decoded.id]
      );

      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        const error = new Error('Pengguna tidak valid atau tidak aktif.');
        error.statusCode = 401;
        throw error;
      }

      const user = userRes.rows[0];
      const tokenPayload = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      };

      const newAccessToken = generateAccessToken(tokenPayload);
      return { accessToken: newAccessToken };
    } catch (err) {
      const error = new Error('Refresh token kadaluwarsa atau tidak valid.');
      error.statusCode = 401;
      throw error;
    }
  }

  async registerDeviceToken(userId, { fcmToken, platform = 'android' }) {
    if (!fcmToken) {
      const error = new Error('fcmToken wajib disertakan.');
      error.statusCode = 400;
      throw error;
    }

    await db.query(
      `INSERT INTO user_devices (user_id, fcm_token, device_platform, last_active_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (fcm_token)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         device_platform = EXCLUDED.device_platform,
         last_active_at = CURRENT_TIMESTAMP`,
      [userId, fcmToken, platform]
    );

    return { success: true };
  }

  async getProfile(userId) {
    const result = await db.query(
      'SELECT id, email, full_name, phone, role, avatar_url, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      const error = new Error('Pengguna tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    return result.rows[0];
  }
}

module.exports = new AuthService();

