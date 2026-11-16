const express = require('express');
const router = express.Router();
const donasiController = require('./donasi.controller');
const { verifyToken, requireRole } = require('../../middlewares/auth.middleware');
const { uploadDonationPhotos } = require('../../middlewares/upload.middleware');

/**
 * Modul A: Donasi Makanan & Media
 * Penanggung Jawab (PIC): Trilen Surya Ningsih
 */

// Route Publik
router.get('/categories', donasiController.getCategories);
router.get('/', donasiController.getAll);
router.get('/my-donations', verifyToken, requireRole('DONATUR', 'ADMIN'), donasiController.getMyDonations);
router.get('/stats', verifyToken, requireRole('DONATUR', 'ADMIN'), donasiController.getStats);
router.get('/:id', donasiController.getById);

// Route Donatur
router.post(
  '/',
  verifyToken,
  requireRole('DONATUR', 'ADMIN'),
  uploadDonationPhotos.array('photos', 5),
  donasiController.create
);

router.put('/:id', verifyToken, requireRole('DONATUR', 'ADMIN'), donasiController.update);
router.patch('/:id/cancel', verifyToken, requireRole('DONATUR', 'ADMIN'), donasiController.cancel);

module.exports = router;

