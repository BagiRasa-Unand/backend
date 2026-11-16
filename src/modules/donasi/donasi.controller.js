const donasiService = require('./donasi.service');
const notifikasiService = require('../notifikasi/notifikasi.service');
const { sendSuccess, sendError } = require('../../utils/response.util');

class DonasiController {
  async getCategories(req, res, next) {
    try {
      const categories = await donasiService.getCategories();
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Daftar kategori makanan berhasil dimuat.',
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const { categoryId, pickupPointId, isHalal, isUrgent, status, search, page, limit } = req.query;

      const result = await donasiService.getDonations({
        categoryId,
        pickupPointId,
        isHalal,
        isUrgent,
        status,
        search,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 10,
      });

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Daftar donasi makanan berhasil dimuat.',
        data: result.items,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const donation = await donasiService.getDonationById(id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Detail donasi berhasil dimuat.',
        data: donation,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const donorId = req.user.id;
      const files = req.files || [];

      const { title, pickupPointId, categoryId, totalPortions } = req.body;
      if (!title || !pickupPointId || !categoryId || !totalPortions) {
        return sendError(res, {
          statusCode: 400,
          message: 'Judul makanan, titik pengambilan, kategori, dan jumlah porsi wajib diisi.',
        });
      }

      const donation = await donasiService.createDonation(donorId, req.body, files);

      // Trigger event notifikasi listing donasi baru di background
      notifikasiService.broadcastNewDonation(donation).catch((err) => {
        console.warn('⚠️ Gagal broadcast notifikasi donasi baru:', err.message);
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Donasi makanan berhasil dibuat dan dipublikasikan.',
        data: donation,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const donorId = req.user.id;
      const { id } = req.params;
      const updated = await donasiService.updateDonation(donorId, id, req.body);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Donasi berhasil diperbarui.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req, res, next) {
    try {
      const donorId = req.user.id;
      const { id } = req.params;
      const result = await donasiService.cancelDonation(donorId, id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Donasi berhasil dibatalkan.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyDonations(req, res, next) {
    try {
      const donorId = req.user.id;
      const donations = await donasiService.getMyDonations(donorId);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Riwayat donasi saya berhasil dimuat.',
        data: donations,
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(req, res, next) {
    try {
      const donorId = req.user.id;
      const stats = await donasiService.getDonorStats(donorId);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Statistik donasi berhasil dimuat.',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DonasiController();
