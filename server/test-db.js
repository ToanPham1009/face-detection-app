// server/test-db.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { testConnection, initializeDatabase } = require('./config/database');

async function runTests() {
  console.log('🧪 Testing Neon Database Connection...');
  console.log('=========================================');
  
  try {
    // 1. Test connection
    console.log('\n1️⃣ Testing database connection...');
    const isConnected = await testConnection();
    
    if (!isConnected) {
      console.error('❌ Connection test FAILED');
      process.exit(1);
    }
    
    console.log('✅ Connection test PASSED');
    
    // 2. Initialize database
    console.log('\n2️⃣ Initializing database tables...');
    await initializeDatabase();
    console.log('✅ Database initialization COMPLETE');
    
    // 3. Test basic queries
    console.log('\n3️⃣ Testing basic queries...');
    
    // Test sessions table
    const db = require('./config/database');
    const result = await db.query('SELECT COUNT(*) as count FROM sessions');
    console.log(`   Sessions table: ${result.rows[0].count} records`);
    
    // Test minutes table
    const minutesResult = await db.query('SELECT COUNT(*) as count FROM minutes');
    console.log(`   Minutes table: ${minutesResult.rows[0].count} records`);
    
    // Test users table
    const usersResult = await db.query('SELECT COUNT(*) as count FROM users');
    console.log(`   Users table: ${usersResult.rows[0].count} records`);
    
    console.log('\n🎉 All tests PASSED!');
    console.log('✨ Database is ready to use.');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 Test FAILED with error:');
    console.error(error);
    process.exit(1);
  }
}

runTests();