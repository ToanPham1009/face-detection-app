const { Pool } = require('pg');

// Sử dụng connection string từ Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Create tables
async function initializeDatabase() {
  try {
    // Create sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(50) PRIMARY KEY,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        total_faces INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0,
        video_filename VARCHAR(500)
      )
    `);

    // Create minutes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS minutes (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(50) REFERENCES sessions(id),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        face_count INTEGER DEFAULT 0,
        minute_number INTEGER
      )
    `);

    // Trong hàm initializeDatabase(), thêm:
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Database tables verified/created successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

module.exports = { pool, initializeDatabase };