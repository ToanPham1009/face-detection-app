// debug-full.js
console.log('🔧 FULL ENVIRONMENT DEBUG');
console.log('=========================\n');

// Load environment
require('dotenv').config();

// 1. Basic info
console.log('1. BASIC INFO:');
console.log('   Node.js:', process.version);
console.log('   Platform:', process.platform);
console.log('   Current directory:', process.cwd());
console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('   PORT:', process.env.PORT || '3000 (default)');

// 2. Environment variables
console.log('\n2. ENVIRONMENT VARIABLES:');

// DATABASE_URL
if (process.env.DATABASE_URL) {
  const masked = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
  console.log('   DATABASE_URL: ✓ Set');
  console.log('     Value:', masked);
  console.log('     Has neon:', process.env.DATABASE_URL.includes('neon') ? '✓ Yes' : '✗ No');
  console.log('     Has sslmode:', process.env.DATABASE_URL.includes('sslmode') ? '✓ Yes' : '✗ No');
} else {
  console.log('   DATABASE_URL: ✗ Not set');
}

// Cloudinary
console.log('   CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '✓ Set' : '✗ Not set');
console.log('   CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? '✓ Set' : '✗ Not set');
console.log('   CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✓ Set' : '✗ Not set');

// 3. File system check
console.log('\n3. FILE SYSTEM CHECK:');
const fs = require('fs');
const path = require('path');

const filesToCheck = [
  '.env',
  'package.json',
  'server/server.js',
  'server/config/database.js',
  'render.yaml'
];

filesToCheck.forEach(file => {
  const exists = fs.existsSync(path.join(process.cwd(), file));
  console.log(`   ${file}: ${exists ? '✓ Exists' : '✗ Missing'}`);
});

// 4. Database module check
console.log('\n4. DATABASE MODULE:');
try {
  const db = require('./server/config/database');
  console.log('   Module: ✓ Loaded successfully');
  console.log('   Pool:', db.pool ? '✓ Initialized' : '✗ Not initialized');
} catch (error) {
  console.log('   Module: ✗ Failed to load');
  console.log('   Error:', error.message);
}

// 5. Direct database test
console.log('\n5. DIRECT DATABASE TEST:');
async function testDb() {
  if (!process.env.DATABASE_URL) {
    console.log('   Skipped: No DATABASE_URL');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const start = Date.now();
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), version()');
    const duration = Date.now() - start;
    
    console.log('   Connection: ✓ Successful');
    console.log('   Response time:', duration + 'ms');
    console.log('   Database time:', result.rows[0].now);
    console.log('   Version:', result.rows[0].version.split(',')[0]);
    
    client.release();
    await pool.end();
  } catch (error) {
    console.log('   Connection: ✗ Failed');
    console.log('   Error:', error.message);
  }
}

// Run test
testDb().then(() => {
  console.log('\n🎯 DEBUG COMPLETED');
});