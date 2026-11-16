const express = require('express');
const router = express.Router();
const klaimController = require('./klaim.controller');
const { verifyToken, requireRole } = require('../../middlewares/auth.middleware');

/**
 * Modul B: Permintaan & Klaim Makanan (Anti Race-Condition + FIFO)
 * Penanggung Jawab (PIC): Larisa Alifia
 */

// Route Klaim oleh Penerima
router.post('/', verifyToken, requireRole('PENERIMA', 'ADMIN'), klaimController.createClaim);
router.get('/my-claims', verifyToken, klaimController.getMyClaims);
router.get('/:id', verifyToken, klaimController.getById);
router.patch('/:id/cancel', verifyToken, klaimController.cancelClaim);

// Route Donatur & Relawan
router.get('/incoming', verifyToken, requireRole('DONATUR', 'ADMIN'), klaimController.getIncomingClaims);
router.post('/verify', verifyToken, requireRole('DONATUR', 'RELAWAN', 'ADMIN'), klaimController.verifyPickup);

module.exports = router;
