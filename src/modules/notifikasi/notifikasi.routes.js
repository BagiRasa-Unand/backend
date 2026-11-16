const express = require('express');
const router = express.Router();
const notifikasiController = require('./notifikasi.controller');
const { verifyToken } = require('../../middlewares/auth.middleware');

/**
 * Modul Notifikasi FCM & In-App
 * Penanggung Jawab (PIC): Shared / Dimas Radithya
 */

router.get('/', verifyToken, notifikasiController.getNotifications);
router.patch('/:id/read', verifyToken, notifikasiController.markAsRead);

module.exports = router;

