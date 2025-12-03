// test-connection.js
console.log('🚀 TESTING NEON DATABASE CONNECTION');
console.log('====================================\n');

// Load environment
require('dotenv').config();

// Check if DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL not found in environment');
  console.log('\n💡 Please add to .env file:');
  console.log('DATABASE_URL=postgresql://username:password@host/database?sslmode=require');
  process.exit(1);
}

// Mask password for logging
const maskedUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
console.log('🔗 Connection string:', maskedUrl);
console.log('');

// Test connection
const { Pool } = require('pg');

async function testConnection() {
  console.log('🔄 Connecting to database...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  let client;
  
  try {
    const start = Date.now();
    client = await pool.connect();
    const result = await client.query('SELECT NOW(), current_database(), current_user');
    const duration = Date.now() - start;
    
    const row = result.rows[0];
    
    console.log('✅ CONNECTION SUCCESSFUL!');
    console.log('');
    console.log('📊 DATABASE INFO:');
    console.log('   Response time:', duration + 'ms');
    console.log('   Database:', row.current_database);
    console.log('   User:', row.current_user);
    console.log('   Server time:', row.now);
    console.log('');
    console.log('🎉 Ready to use!');
    
    return true;
    
  } catch (error) {
    console.error('❌ CONNECTION FAILED:');
    console.error('   Error:', error.message);
    
    // Provide helpful suggestions
    console.log('\n🔧 TROUBLESHOOTING:');
    if (error.message.includes('password authentication')) {
      console.log('   • Check if password in DATABASE_URL is correct');
    } else if (error.message.includes('does not exist')) {
      console.log('   • Check if database name is correct');
    } else if (error.message.includes('connection')) {
      console.log('   • Check your internet connection');
      console.log('   • Check if Neon database is running');
    } else if (error.message.includes('SSL')) {
      console.log('   • Add ?sslmode=require to connection string');
    }
    
    return false;
    
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Run the test
testConnection().then(success => {
  process.exit(success ? 0 : 1);
});