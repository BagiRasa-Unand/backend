const app = require('./app');
const config = require('./config/env');
const { testConnection } = require('./config/database');
const { initCronJobs } = require('./cron');

async function bootstrap() {
  console.log('====================================================');
  console.log('       🌱 MEMULAI BAGIRASA BACKEND SERVICE        ');
  console.log('====================================================');

  // Uji koneksi ke PostgreSQL & PostGIS
  await testConnection();

  // Jalankan background cron jobs
  initCronJobs();

  // Jalankan HTTP Server
  const server = app.listen(config.port, () => {
    console.log(`🚀 Server BagiRasa aktif dan mendengarkan pada port ${config.port}`);
    console.log(`📡 URL API: http://localhost:${config.port}/api/v1`);
    console.log(`🏥 Health Check: http://localhost:${config.port}/health`);
    console.log('====================================================');
  });

  // Graceful shutdown
  const handleExit = (signal) => {
    console.log(`\n🛑 Menerima sinyal ${signal}. Menutup server BagiRasa dengan aman...`);
    server.close(() => {
      console.log('🔒 HTTP Server ditutup.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
}

bootstrap();

