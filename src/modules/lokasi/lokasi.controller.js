const lokasiService = require('./lokasi.service');
const { sendSuccess, sendError } = require('../../utils/response.util');

class LokasiController {
  async getAll(req, res, next) {
    try {
      const activeOnly = req.query.active !== 'false';
      const points = await lokasiService.getAllPickupPoints({ activeOnly });
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Daftar titik lokasi pengambilan berhasil dimuat.',
        data: points,
      });
    } catch (error) {
      next(error);
    }
  }

  async getNearby(req, res, next) {
    try {
      const { lat, lng, radius } = req.query;
      if (!lat || !lng) {
        return sendError(res, {
          statusCode: 400,
          message: 'Parameter lat (latitude) dan lng (longitude) wajib disertakan.',
        });
      }

      const points = await lokasiService.getNearbyPickupPoints({
        latitude: lat,
        longitude: lng,
        radiusMeters: radius || 5000,
      });

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Titik lokasi terdekat berhasil ditemukan.',
        data: points,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const point = await lokasiService.getPickupPointById(id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Detail titik lokasi berhasil dimuat.',
        data: point,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const { name, address, latitude, longitude, openHour, closeHour, picName, picPhone } = req.body;
      if (!name || !address || latitude === undefined || longitude === undefined) {
        return sendError(res, {
          statusCode: 400,
          message: 'Nama, alamat, latitude, dan longitude wajib diisi.',
        });
      }

      const newPoint = await lokasiService.createPickupPoint({
        name,
        address,
        latitude,
        longitude,
        openHour,
        closeHour,
        picName,
        picPhone,
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Titik lokasi penjemputan berhasil ditambahkan.',
        data: newPoint,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updated = await lokasiService.updatePickupPoint(id, req.body);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Informasi titik lokasi berhasil diperbarui.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const result = await lokasiService.deletePickupPoint(id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Titik lokasi berhasil dinonaktifkan.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LokasiController();
