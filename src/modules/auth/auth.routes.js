const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { verifyToken } = require('../../middlewares/auth.middleware');

/**
 * Modul Autentikasi & Akun
 * Penanggung Jawab (PIC): Dimas Radithya
 */

// Route Publik
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

// Route Terproteksi JWT
router.post('/device-token', verifyToken, authController.registerDeviceToken);
router.get('/me', verifyToken, authController.getProfile);

module.exports = router;

