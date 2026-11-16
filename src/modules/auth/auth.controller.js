const authService = require('./auth.service');
const { sendSuccess, sendError } = require('../../utils/response.util');

class AuthController {
  async register(req, res, next) {
    try {
      const { email, password, fullName, phone, role } = req.body;
      if (!email || !password || !fullName) {
        return sendError(res, {
          statusCode: 400,
          message: 'Email, password, dan nama lengkap wajib diisi.',
        });
      }

      const result = await authService.register({ email, password, fullName, phone, role });
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Registrasi akun berhasil.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return sendError(res, {
          statusCode: 400,
          message: 'Email dan password wajib diisi.',
        });
      }

      const result = await authService.login({ email, password });
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Login berhasil.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Token berhasil diperbarui.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async registerDeviceToken(req, res, next) {
    try {
      const { fcmToken, platform } = req.body;
      const result = await authService.registerDeviceToken(req.user.id, { fcmToken, platform });
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Token perangkat FCM berhasil didaftarkan.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const user = await authService.getProfile(req.user.id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Data profil berhasil diambil.',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();

