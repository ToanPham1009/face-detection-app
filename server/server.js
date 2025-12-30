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
  console.error('❌ Error loading videos routes:', error);
}

// THÊM ROUTE CAPTURES
try {
  console.log('🔄 Loading captures routes...');
  app.use('/api/captures', require('./routes/captures'));
  console.log('✅ Captures routes loaded');
} catch (error) {
  console.error('❌ Error loading captures routes:', error);
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

// Route lưu capture vào database
app.post('/api/captures/save', async (req, res) => {
  try {
    const captureData = req.body;

    console.log('💾 Saving capture to database:', {
      id: captureData.id,
      sessionId: captureData.sessionId,
      source: captureData.source
    });

    // Kiểm tra dữ liệu bắt buộc
    if (!captureData.id || !captureData.url) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // Kiểm tra xem bảng captures có tồn tại không
    const tableExists = await db.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = 'captures'
            ) as table_exists
        `);

    if (!tableExists[0]?.table_exists) {
      console.log('📁 Creating captures table...');

      // Tạo bảng captures nếu chưa tồn tại
      await db.query(`
                CREATE TABLE IF NOT EXISTS captures (
                    id VARCHAR(255) PRIMARY KEY,
                    url TEXT NOT NULL,
                    filename VARCHAR(255),
                    timestamp BIGINT,
                    source VARCHAR(50),
                    session_id VARCHAR(255),
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_local BOOLEAN DEFAULT FALSE,
                    INDEX idx_session_id (session_id),
                    INDEX idx_timestamp (timestamp)
                )
            `);

      console.log('✅ Captures table created');
    }

    // Kiểm tra xem capture đã tồn tại chưa
    const existing = await db.query(
      'SELECT id FROM captures WHERE id = ?',
      [captureData.id]
    );

    let result;
    if (existing.length > 0) {
      // Update nếu đã tồn tại
      result = await db.query(`
                UPDATE captures 
                SET url = ?, filename = ?, metadata = ?, is_local = ?
                WHERE id = ?
            `, [
        captureData.url,
        captureData.filename || `capture_${captureData.timestamp}.jpg`,
        JSON.stringify(captureData.metadata || {}),
        captureData.isLocal || false,
        captureData.id
      ]);
      console.log('🔄 Capture updated');
    } else {
      // Insert mới
      result = await db.query(`
                INSERT INTO captures 
                (id, url, filename, timestamp, source, session_id, metadata, created_at, is_local)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
        captureData.id,
        captureData.url,
        captureData.filename || `capture_${captureData.timestamp}.jpg`,
        captureData.timestamp || Date.now(),
        captureData.source || 'camera',
        captureData.sessionId || 'live',
        JSON.stringify(captureData.metadata || {}),
        captureData.created_at || new Date().toISOString(),
        captureData.isLocal || false
      ]);
      console.log('✅ New capture inserted');
    }

    res.json({
      success: true,
      id: captureData.id,
      message: 'Capture saved successfully',
      action: existing.length > 0 ? 'updated' : 'inserted'
    });

  } catch (error) {
    console.error('❌ Error saving capture:', error);
    res.status(500).json({
      error: 'Failed to save capture',
      details: error.message,
      sqlMessage: error.sqlMessage
    });
  }
});

// Route lấy captures theo session
app.get('/api/captures/session/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;

    console.log(`📷 Loading captures for session: ${sessionId}`);

    // Kiểm tra bảng có tồn tại không
    const tableExists = await db.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = 'captures'
            ) as table_exists
        `);

    if (!tableExists[0]?.table_exists) {
      console.log('📁 Captures table does not exist yet');
      return res.json([]);
    }

    const query = `
            SELECT * FROM captures 
            WHERE session_id = ? 
            ORDER BY timestamp DESC
            LIMIT 50
        `;

    const captures = await db.query(query, [sessionId]);

    console.log(`✅ Found ${captures.length} captures for session ${sessionId}`);

    // Parse metadata từ JSON string
    captures.forEach(capture => {
      if (capture.metadata) {
        try {
          capture.metadata = JSON.parse(capture.metadata);
        } catch (e) {
          console.warn('⚠️ Failed to parse metadata:', e);
          capture.metadata = {};
        }
      }
    });

    res.json(captures);

  } catch (error) {
    console.error('❌ Error loading captures:', error);
    res.status(500).json({
      error: 'Failed to load captures',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Kiểm tra database connection
    await db.query('SELECT 1 as health_check');

    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Kiểm tra bảng captures
app.get('/api/debug/captures-table', async (req, res) => {
  try {
    const tableInfo = await db.query(`
            SELECT 
                TABLE_NAME,
                TABLE_ROWS,
                CREATE_TIME,
                UPDATE_TIME
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'captures'
        `);

    const columns = await db.query(`
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_DEFAULT
            FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'captures'
            ORDER BY ORDINAL_POSITION
        `);

    res.json({
      tableExists: tableInfo.length > 0,
      tableInfo: tableInfo[0] || null,
      columns: columns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trong route /api/captures/upload
app.post('/api/captures/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        error: 'No image file uploaded'
      });
    }

    const imageFile = req.files.image;
    const imageType = req.body.imageType || 'camera';
    const sessionId = req.body.sessionId || 'live';

    console.log('📤 Uploading image:', {
      filename: imageFile.name,
      mimetype: imageFile.mimetype,
      size: imageFile.size,
      source: imageType,
      sessionId: sessionId
    });

    // Kiểm tra định dạng file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(imageFile.mimetype)) {
      console.error('❌ Invalid file type:', imageFile.mimetype);
      return res.status(400).json({
        error: 'Invalid file type',
        details: `Type ${imageFile.mimetype} is not allowed`
      });
    }

    // Tạo public_id duy nhất
    const timestamp = Date.now();
    const publicId = `capture_${timestamp}`;

    console.log('☁️ Uploading to Cloudinary with public_id:', publicId);

    // 🔥 SỬA LỖI Ở ĐÂY: Bỏ transformation có 'auto'
    const uploadOptions = {
      folder: `face_detection/${imageType}`,
      public_id: publicId,
      resource_type: 'image',
      // Chỉ định rõ ràng format và quality
      format: 'jpg',
      quality: 'auto:good' // Hoặc chỉ 'auto' thôi
    };

    // Upload lên Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      imageFile.tempFilePath || imageFile.data,
      uploadOptions
    );

    console.log('✅ Cloudinary upload successful:', {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id
    });

    res.json({
      success: true,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      filename: imageFile.name,
      created_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Upload error:', error);

    // Log chi tiết lỗi Cloudinary
    if (error.message.includes('transformation')) {
      console.error('💡 Transformation error details:', {
        message: error.message,
        http_code: error.http_code,
        name: error.name
      });
    }

    res.status(500).json({
      error: 'Failed to upload image',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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