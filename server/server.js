const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config(); // THÊM DÒNG NÀY

// Database
const { initializeDatabase, pool, testConnection } = require('./config/database');

// Cloudinary
const cloudinary = require('cloudinary').v2;

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3000;

// Log environment
console.log('🌍 Environment:', process.env.NODE_ENV);
console.log('🔗 Database URL:', process.env.DATABASE_URL ? 'Set (hidden)' : 'Not set');

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Tạo thư mục uploads tạm
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes với try-catch và debug
try {
  console.log('🔄 Loading sessions routes...');
  app.use('/api/sessions', require('./routes/sessions'));
  console.log('✅ Sessions routes loaded');
} catch (error) {
  console.error('❌ Error loading sessions routes:', error);
}

try {
  console.log('🔄 Loading minutes routes...');
  app.use('/api/minutes', require('./routes/minutes'));
  console.log('✅ Minutes routes loaded');
} catch (error) {
  console.error('❌ Error loading minutes routes:', error);
}

try {
  console.log('🔄 Loading videos routes...');
  app.use('/api/videos', require('./routes/videos'));
  console.log('✅ Videos routes loaded');
} catch (error) {
  console.error('❌ Error loading videos routes:', error);
}

try {
  console.log('🔄 Loading auth routes...');
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Error loading auth routes:', error);
}

console.log('🎯 All routes configured');

// Health check endpoint với database status
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const dbResult = await pool.query('SELECT NOW() as db_time');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      db_time: dbResult.rows[0].db_time,
      environment: process.env.NODE_ENV,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API xóa session và video liên quan
app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log(`🗑️ Nhận yêu cầu xóa session: ${sessionId}`);

    // 1. Lấy thông tin session trước khi xóa
    const sessionResult = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    const session = sessionResult.rows[0];

    if (!session) {
      console.log(`❌ Session không tồn tại: ${sessionId}`);
      return res.status(404).json({ error: 'Session không tồn tại' });
    }

    // 2. Xóa video từ Cloudinary nếu có
    if (session.video_filename && session.video_filename !== 'null') {
      try {
        // Extract public_id từ URL Cloudinary
        const videoUrl = session.video_filename;
        const publicId = videoUrl.split('/').pop().split('.')[0];

        console.log(`🎥 Đang xóa video từ Cloudinary: ${publicId}`);

        // Xóa video từ Cloudinary
        const result = await cloudinary.uploader.destroy(publicId, {
          resource_type: 'video'
        });

        if (result.result === 'ok') {
          console.log(`✅ Đã xóa video từ Cloudinary: ${publicId}`);
        } else {
          console.warn(`⚠️ Không thể xóa video từ Cloudinary: ${result.result}`);
        }
      } catch (cloudinaryError) {
        console.warn('⚠️ Lỗi khi xóa video từ Cloudinary:', cloudinaryError);
      }
    }

    // 3. Xóa dữ liệu minutes liên quan
    const minutesDelete = await pool.query('DELETE FROM minutes WHERE session_id = $1', [sessionId]);
    console.log(`✅ Đã xóa ${minutesDelete.rowCount} bản ghi minutes`);

    // 4. Xóa session
    const sessionDelete = await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);

    if (sessionDelete.rowCount > 0) {
      console.log(`✅ Đã xóa session: ${sessionId}`);
      res.json({
        success: true,
        message: 'Session đã được xóa thành công',
        deletedSession: sessionId,
        deletedVideo: !!(session.video_filename && session.video_filename !== 'null')
      });
    } else {
      throw new Error('Không thể xóa session từ database');
    }

  } catch (error) {
    console.error('❌ Lỗi khi xóa session:', error);
    res.status(500).json({
      error: 'Lỗi server khi xóa session',
      details: error.message
    });
  }
});

// Database info endpoint
app.get('/api/database-info', async (req, res) => {
  try {
    const [sessionsCount, minutesCount, usersCount] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM sessions'),
      pool.query('SELECT COUNT(*) FROM minutes'),
      pool.query('SELECT COUNT(*) FROM users')
    ]);

    res.json({
      database: 'Neon PostgreSQL',
      stats: {
        sessions: parseInt(sessionsCount.rows[0].count),
        minutes: parseInt(minutesCount.rows[0].count),
        users: parseInt(usersCount.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Server Error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

// Initialize and start server
async function startServer() {
  try {
    console.log('🔧 Initializing database...');
    await initializeDatabase();
    
    // Test database connection
    console.log('🔌 Testing database connection...');
    const isConnected = await testConnection();
    
    if (!isConnected) {
      console.error('❌ Database connection failed. Exiting...');
      process.exit(1);
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: Neon PostgreSQL`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💀 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💀 Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();