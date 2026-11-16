const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Middlewares kustom
const notFound = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/error.middleware');

// Routes per modul
const authRoutes = require('./modules/auth/auth.routes');
const lokasiRoutes = require('./modules/lokasi/lokasi.routes');
const donasiRoutes = require('./modules/donasi/donasi.routes');
const klaimRoutes = require('./modules/klaim/klaim.routes');
const notifikasiRoutes = require('./modules/notifikasi/notifikasi.routes');

const app = express();

// Keamanan & Utilitas Dasar
app.use(helmet({
  crossOriginResourcePolicy: false, // Memungkinkan akses gambar dari Flutter Client
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Folder Static untuk File Media / Foto Donasi
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Health Check & Root Info
app.get('/', (req, res) => {
  res.json({
    name: 'BagiRasa Backend API',
    version: '1.1.0',
    status: 'ONLINE',
    description: 'REST API Service untuk Penyelamatan Makanan (Food Rescue)',
    docs: '/api/v1',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Mounting Modul API v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/locations', lokasiRoutes);
app.use('/api/v1/donations', donasiRoutes);
app.use('/api/v1/claims', klaimRoutes);
app.use('/api/v1/notifications', notifikasiRoutes);

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

module.exports = app;
