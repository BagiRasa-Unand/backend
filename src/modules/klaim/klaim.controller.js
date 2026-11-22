const klaimService = require('./klaim.service');
const { sendSuccess, sendError } = require('../../utils/response.util');

class KlaimController {
  async createClaim(req, res, next) {
    try {
      const recipientId = req.user.id;
      const { donationId, portionCount } = req.body;

      if (!donationId) {
        return sendError(res, {
          statusCode: 400,
          message: 'ID donasi makanan (donationId) wajib disertakan.',
        });
      }

      const claim = await klaimService.createClaim({
        donationId,
        recipientId,
        requestedPortion: portionCount || 1,
      });

      const message = claim.isQueued
        ? 'Permintaan klaim Anda masuk dalam antrean (FIFO).'
        : 'Klaim makanan berhasil dibuat. Silakan ambil sebelum batas waktu berakhir.';

      return sendSuccess(res, {
        statusCode: 201,
        message,
        data: claim,
      });
    } catch (error) {
      next(error);
    }
  }

  async decisionClaim(req, res, next) {
    try {
      const donorId = req.user.id;
      const { id } = req.params;
      const { action, reason } = req.body;

      if (!action) {
        return sendError(res, {
          statusCode: 400,
          message: "Aksi keputusan ('action': 'ACCEPT' atau 'REJECT') wajib disertakan.",
        });
      }

      const claim = await klaimService.decisionClaim({
        claimId: id,
        donorId,
        action,
        reason,
      });

      const act = action.toUpperCase();
      const isAccepted = act === 'ACCEPT' || act === 'TERIMA';

      return sendSuccess(res, {
        statusCode: 200,
        message: isAccepted 
          ? 'Klaim makanan berhasil disetujui untuk penjemputan.' 
          : 'Klaim makanan berhasil ditolak.',
        data: claim,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyClaims(req, res, next) {
    try {
      const recipientId = req.user.id;
      const claims = await klaimService.getMyClaims(recipientId);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Riwayat klaim saya berhasil dimuat.',
        data: claims,
      });
    } catch (error) {
      next(error);
    }
  }

  async getIncomingClaims(req, res, next) {
    try {
      const donorId = req.user.id;
      const { status } = req.query;
      const incoming = await klaimService.getIncomingClaims(donorId, status);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Daftar klaim masuk berhasil dimuat.',
        data: incoming,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const claim = await klaimService.getClaimById(id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Detail tiket klaim berhasil dimuat.',
        data: claim,
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyPickup(req, res, next) {
    try {
      const { claimCode, qrPayload } = req.body;
      if (!claimCode && !qrPayload) {
        return sendError(res, {
          statusCode: 400,
          message: 'Kode klaim unik (claimCode) atau QR payload (qrPayload) wajib disertakan.',
        });
      }

      const claim = await klaimService.verifyPickup({
        claimCode,
        qrPayload,
        verifierId: req.user.id,
      });

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Verifikasi penyerahan makanan berhasil. Transaksi klaim selesai!',
        data: claim,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelClaim(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { reason } = req.body;

      const claim = await klaimService.cancelClaim({
        claimId: id,
        userId,
        reason,
      });

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Klaim berhasil dibatalkan.',
        data: claim,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new KlaimController();
