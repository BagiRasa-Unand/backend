const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'bagirasa_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function runMigration() {
  const isSeed = process.argv.includes('--seed');
  const client = await pool.connect();

  try {
    console.log('🚀 Memulai migrasi database BagiRasa...');
    console.log(`🔌 Terhubung ke database: ${process.env.DB_NAME} di ${process.env.DB_HOST}:${process.env.DB_PORT}`);

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('⏳ Menjalankan schema.sql (Extensions, Enums, Tables, Indexes)...');
    await client.query(schemaSql);
    console.log('✅ Skema database berhasil dibuat/diverifikasi.');

    if (isSeed) {
      const seedPath = path.join(__dirname, 'seed.sql');
      if (fs.existsSync(seedPath)) {
        console.log('⏳ Menjalankan seed.sql (Data awal kategori, dummy user, lokasi)...');
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await client.query(seedSql);
        console.log('✅ Seed data berhasil dimasukkan.');
      }
    }

    console.log('🎉 Migrasi selesai dengan sukses!');
  } catch (error) {
    console.error('❌ Terjadi kesalahan saat migrasi database:', error.message);
    if (error.code === '3D000') {
      console.error(`💡 Tip: Database '${process.env.DB_NAME}' belum ada. Silakan buat database tersebut terlebih dahulu di PostgreSQL / pgAdmin 4:`);
      console.error(`   CREATE DATABASE ${process.env.DB_NAME};`);
    } else if (error.code === 'ECONNREFUSED') {
      console.error(`💡 Tip: Pastikan service PostgreSQL sudah berjalan di host ${process.env.DB_HOST}:${process.env.DB_PORT}.`);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

