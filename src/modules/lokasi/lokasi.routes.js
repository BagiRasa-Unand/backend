const express = require('express');
const router = express.Router();
const lokasiController = require('./lokasi.controller');
const { verifyToken, requireRole } = require('../../middlewares/auth.middleware');

/**
 * Modul C: Titik Pengambilan & Geospasial PostGIS
 * Penanggung Jawab (PIC): Dimas Radithya
 */

// Route Publik
router.get('/pickup-points', lokasiController.getAll);
router.get('/pickup-points/nearby', lokasiController.getNearby);
router.get('/pickup-points/:id', lokasiController.getById);

// Route Manajemen (Donatur & Admin)
router.post('/pickup-points', verifyToken, requireRole('DONATUR', 'ADMIN', 'RELAWAN'), lokasiController.create);
router.put('/pickup-points/:id', verifyToken, requireRole('DONATUR', 'ADMIN', 'RELAWAN'), lokasiController.update);
router.delete('/pickup-points/:id', verifyToken, requireRole('DONATUR', 'ADMIN'), lokasiController.delete);

module.exports = router;

