const notifikasiService = require('./notifikasi.service');
const { sendSuccess } = require('../../utils/response.util');

class NotifikasiController {
  async getNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const notifications = await notifikasiService.getUserNotifications(userId);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Daftar riwayat notifikasi berhasil dimuat.',
        data: notifications,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const result = await notifikasiService.markAsRead(userId, id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Notifikasi telah ditandai sebagai dibaca.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotifikasiController();
