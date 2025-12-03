const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log(`📁 Loaded .env from: ${envPath}`);
} else {
  console.warn('⚠️ No .env file found at:', envPath);
  console.warn('   Using process.env directly');
}

// Initialize database pool
let pool = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    
    console.log('✅ Database pool initialized');
    
    // Test connection on startup
    pool.connect()
      .then(client => {
        console.log('🔌 Database connection successful');
        client.release();
      })
      .catch(err => {
        console.error('❌ Database connection failed:', err.message);
      });
      
  } catch (error) {
    console.error('❌ Failed to create pool:', error.message);
  }
} else {
  console.error('❌ DATABASE_URL is not set');
}

// Database functions
async function testConnection() {
  if (!pool) {
    console.error('❌ Database pool not initialized');
    return false;
  }

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connection test passed');
    console.log('   Server time:', result.rows[0].now);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

async function initializeDatabase() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(50) PRIMARY KEY,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        total_faces INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0,
        video_filename VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create minutes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS minutes (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(50) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        face_count INTEGER DEFAULT 0,
        minute_number INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Export
module.exports = {
  pool,
  testConnection,
  initializeDatabase,
  
  query: async (text, params) => {
    if (!pool) throw new Error('Database pool not initialized');
    return await pool.query(text, params);
  },
  
  getClient: async () => {
    if (!pool) throw new Error('Database pool not initialized');
    return await pool.connect();
  }
};