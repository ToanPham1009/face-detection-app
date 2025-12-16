const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer'); // THÊM DÒNG NÀY
const fs = require('fs'); // THÊM DÒNG NÀY
const { initializeDatabase, pool } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Tạo thư mục uploads tạm
const uploadsDir = path.join(__dirname, '../uploads');
const capturesDir = path.join(uploadsDir, 'captures');

[uploadsDir, capturesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// CẤU HÌNH MULTER CHO CAPTURE IMAGES - THÊM PHẦN NÀY
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, capturesDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'capture-' + uniqueSuffix + ext);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file hình ảnh (JPEG, PNG, GIF, WebP)'));
    }
  }
});

// CLOUDINARY CONFIG - THÊM DÙNG REQUIRE THAY VÌ IMPORT
let cloudinary;
try {
  cloudinary = require('cloudinary').v2;
  if (process.env.CLOUDINARY_CLOUD_NAME && 
      process.env.CLOUDINARY_API_KEY && 
      process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('✅ Cloudinary configured');
  } else {
    console.log('⚠️ Cloudinary environment variables not set');
  }
} catch (error) {
  console.log('⚠️ Cloudinary not available, using local storage');
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

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
  console.error('❌ Error loading minutes routes:', error);
}

try {
  console.log('🔄 Loading auth routes...');
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Error loading auth routes:', error);
}

console.log('🎯 All routes configured');

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uploadsDir: uploadsDir,
    capturesDir: capturesDir
  });
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
    if (session.video_filename && session.video_filename !== 'null' && cloudinary) {
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

    // 3. Xóa captures liên quan
    const capturesDelete = await pool.query('DELETE FROM captures WHERE session_id = $1', [sessionId]);
    console.log(`✅ Đã xóa ${capturesDelete.rowCount} bản ghi captures`);

    // 4. Xóa dữ liệu minutes liên quan
    const minutesDelete = await pool.query('DELETE FROM minutes WHERE session_id = $1', [sessionId]);
    console.log(`✅ Đã xóa ${minutesDelete.rowCount} bản ghi minutes`);

    // 5. Xóa session
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

// API để lưu ảnh chụp - SỬA LẠI
app.post('/api/captures/upload', imageUpload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('📸 Received capture upload:', {
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      body: req.body
    });

    let result;
    // Upload lên Cloudinary (nếu có)
    if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME !== 'SET') {
      try {
        result = await cloudinary.uploader.upload(file.path, {
          folder: 'face-detection/captures',
          resource_type: 'image'
        });
        console.log('✅ Image uploaded to Cloudinary');
      } catch (cloudinaryError) {
        console.warn('⚠️ Cloudinary upload failed, using local:', cloudinaryError);
        result = { 
          url: `/uploads/captures/${file.filename}`,
          public_id: file.filename 
        };
      }
    } else {
      // Local storage fallback
      result = { 
        url: `/uploads/captures/${file.filename}`,
        public_id: file.filename 
      };
    }

    // Lưu vào database
    const captureData = {
      id: req.body.timestamp || Date.now().toString(),
      url: result.url,
      filename: file.filename,
      session_id: req.body.sessionId || null,
      source: req.body.source || 'camera',
      video_time: req.body.videoTime || null,
      face_count: req.body.faceCount || 0,
      created_at: new Date().toISOString()
    };

    // SỬA LẠI QUERY - DÙNG POOL.query thay vì db.run/db.all
    await pool.query(
      `INSERT INTO captures (id, url, filename, session_id, source, video_time, face_count, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        captureData.id, 
        captureData.url, 
        captureData.filename, 
        captureData.session_id,
        captureData.source, 
        captureData.video_time, 
        captureData.face_count, 
        captureData.created_at
      ]
    );

    console.log('✅ Image saved to database:', captureData.id);

    res.json({
      success: true,
      id: captureData.id,
      url: captureData.url,
      filename: captureData.filename,
      timestamp: captureData.created_at
    });

  } catch (error) {
    console.error('❌ Error uploading capture:', error);
    res.status(500).json({ 
      error: 'Error uploading image',
      details: error.message 
    });
  }
});

// API để lấy ảnh theo session - SỬA LẠI
app.get('/api/captures/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`📷 Fetching captures for session: ${sessionId}`);
    
    const result = await pool.query(
      `SELECT * FROM captures 
       WHERE session_id = $1 
       ORDER BY created_at DESC`,
      [sessionId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching captures:', error);
    res.status(500).json({ 
      error: 'Error fetching captures',
      details: error.message 
    });
  }
});

// API để lấy tất cả ảnh chụp gần đây
app.get('/api/captures/recent', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM captures 
       ORDER BY created_at DESC 
       LIMIT 20`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching recent captures:', error);
    res.status(500).json({ error: 'Error fetching recent captures' });
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
    message: error.message
  });
});

// Initialize and start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log(`📸 Captures directory: ${capturesDir}`);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

startServer();