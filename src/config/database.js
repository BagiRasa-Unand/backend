const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool(config.db);

pool.on('error', (err) => {
  console.error('⚠️ Unexpected error on idle PostgreSQL client:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.nodeEnv === 'development') {
    // Logging query execution in debug/dev mode if desired
  }
  return res;
}

async function getClient() {
  const client = await pool.connect();
  return client;
}

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() as current_time');
    try {
      const postgisRes = await pool.query('SELECT PostGIS_Version() as postgis_version');
      console.log(`✅ Database terhubung! PostGIS Version: ${postgisRes.rows[0].postgis_version}`);
    } catch {
      console.log('✅ Database PostgreSQL terhubung! (Mode fallback koordinat numerik GPS)');
    }
    return true;
  } catch (error) {
    console.error('❌ Gagal terhubung ke PostgreSQL:', error.message);
    console.error('💡 Pastikan PostgreSQL berjalan dan database "bagirasa_db" sudah di-migrate (npm run migrate).');
    return false;
  }
}

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
};

