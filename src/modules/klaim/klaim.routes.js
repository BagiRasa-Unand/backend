const express = require('express');
const router = express.Router();
const klaimController = require('./klaim.controller');
const { verifyToken, requireRole } = require('../../middlewares/auth.middleware');

/**
 * Modul B: Permintaan & Klaim Makanan (Anti Race-Condition + FIFO Queue + Keputusan Pendonor)
 * Penanggung Jawab (PIC): Larisa Alifia (2411523026)
 */

// Route Klaim oleh Penerima / Pengguna
router.post('/', verifyToken, klaimController.createClaim);
router.get('/my-claims', verifyToken, klaimController.getMyClaims);
router.get('/:id', verifyToken, klaimController.getById);
router.patch('/:id/cancel', verifyToken, klaimController.cancelClaim);

// Route Keputusan Donatur (Terima / Tolak klaim masuk)
router.patch('/:id/decision', verifyToken, requireRole('DONATUR', 'ADMIN'), klaimController.decisionClaim);

// Route Donatur & Relawan
router.get('/incoming', verifyToken, requireRole('DONATUR', 'ADMIN'), klaimController.getIncomingClaims);
router.post('/verify', verifyToken, requireRole('DONATUR', 'RELAWAN', 'ADMIN'), klaimController.verifyPickup);

module.exports = router;
