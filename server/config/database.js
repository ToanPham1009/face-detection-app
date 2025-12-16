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
let retryCount = 0;
const MAX_RETRIES = 3;

function initializePool() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set');
    return;
  }

  try {
    // Log connection info (mask password)
    const maskedUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
    console.log(`🔗 Database URL: ${maskedUrl}`);

    // Parse connection string to check
    const url = new URL(process.env.DATABASE_URL);
    console.log(`   Host: ${url.hostname}`);
    console.log(`   Database: ${url.pathname.substring(1)}`);

    // Add connection parameters for Neon
    let connectionString = process.env.DATABASE_URL;

    // Ensure sslmode is set for Neon
    if (!connectionString.includes('sslmode=')) {
      connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=require';
    }

    // Add connection limit for pooling
    if (!connectionString.includes('connection_limit')) {
      connectionString += (connectionString.includes('?') ? '&' : '?') + 'connection_limit=10';
    }

    pool = new Pool({
      connectionString: connectionString,
      ssl: {
        rejectUnauthorized: false,
        // For Neon specific SSL
      },
      max: 5, // Smaller pool for Render free tier
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000, // Increase timeout
      maxUses: 7500, // Prevent connection leaks
    });

    // Pool event handlers
    pool.on('connect', () => {
      console.log('✅ New client connected to database');
      retryCount = 0; // Reset retry count on successful connection
    });

    pool.on('error', (err) => {
      console.error('❌ Unexpected pool error:', err.message);

      // Retry logic
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`🔄 Retrying connection (${retryCount}/${MAX_RETRIES})...`);
        setTimeout(initializePool, 2000 * retryCount);
      }
    });

    console.log('✅ Database pool initialized');

  } catch (error) {
    console.error('❌ Failed to create pool:', error.message);

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`🔄 Retrying pool initialization (${retryCount}/${MAX_RETRIES})...`);
      setTimeout(initializePool, 2000 * retryCount);
    }
  }
}

// Initialize pool
initializePool();

// Database functions with retry logic
async function testConnectionWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await testConnection();
      if (result) return true;
    } catch (error) {
      console.log(`🔄 Connection test failed (${i + 1}/${retries}), retrying...`);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }
  return false;
}

async function testConnection() {
  if (!pool) {
    console.error('❌ Database pool not initialized');
    return false;
  }

  try {
    console.log('🔌 Testing database connection...');
    const client = await pool.connect();

    // Simple query to test connection
    const result = await client.query('SELECT NOW() as time, version() as version');

    console.log('✅ Database connection successful');
    console.log(`   Server time: ${result.rows[0].time}`);
    console.log(`   Version: ${result.rows[0].version.split(',')[0]}`);

    client.release();
    return true;

  } catch (error) {
    console.error('❌ Database connection failed:', error.message);

    // Specific error handling
    if (error.message.includes('connection terminated')) {
      console.log('💡 Tip: Check Neon IP whitelist and connection pooling');
    } else if (error.message.includes('timeout')) {
      console.log('💡 Tip: Increase connectionTimeoutMillis in pool config');
    } else if (error.message.includes('password')) {
      console.log('💡 Tip: Check DATABASE_URL credentials');
    }

    return false;
  }
}

async function initializeDatabase() {
  console.log('🗄️ Starting database initialization...');

  // Test connection first
  const isConnected = await testConnectionWithRetry();
  if (!isConnected) {
    throw new Error('Cannot initialize database: Connection failed after retries');
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
    console.log('✅ Sessions table verified');

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
    console.log('✅ Minutes table verified');

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
    console.log('✅ Users table verified');

    await client.query(`
      CREATE TABLE IF NOT EXISTS captures (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          filename TEXT NOT NULL,
          session_id TEXT,
          source TEXT NOT NULL,
          video_time REAL,
          face_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ captures table verified');

    await client.query('COMMIT');
    console.log('🎉 Database initialization completed');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Export
module.exports = {
  pool,
  testConnection,
  testConnectionWithRetry,
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