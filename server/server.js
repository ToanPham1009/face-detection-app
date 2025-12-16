const express = require('express');
const path = require('path');
const cors = require('cors');
const { initializeDatabase, pool } = require('./config/database'); // ĐỔI db thành pool

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Tạo thư mục uploads tạm
const fs = require('fs');
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API xóa session và video liên quan - SỬA LẠI DÙNG POOL
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

// API để lưu ảnh chụp
app.post('/api/captures/upload', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Upload lên Cloudinary (nếu có)
    let result;
    if (cloudinary) {
      result = await cloudinary.uploader.upload(file.path, {
        folder: 'face-detection/captures',
        resource_type: 'image'
      });
    } else {
      // Local storage fallback
      const publicUrl = `/uploads/captures/${file.filename}`;
      result = { url: publicUrl, public_id: file.filename };
    }

    // Lưu vào database
    const db = await getDB();
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

    await db.run(
      `INSERT INTO captures (id, url, filename, session_id, source, video_time, face_count, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [captureData.id, captureData.url, captureData.filename, captureData.session_id,
      captureData.source, captureData.video_time, captureData.face_count, captureData.created_at]
    );

    res.json({
      success: true,
      id: captureData.id,
      url: captureData.url,
      filename: captureData.filename
    });

  } catch (error) {
    console.error('Error uploading capture:', error);
    res.status(500).json({ error: 'Error uploading image' });
  }
});

// API để lấy ảnh theo session
app.get('/api/captures/session/:sessionId', async (req, res) => {
  try {
    const db = await getDB();
    const captures = await db.all(
      `SELECT * FROM captures 
             WHERE session_id = ? 
             ORDER BY created_at DESC`,
      [req.params.sessionId]
    );

    res.json(captures);
  } catch (error) {
    console.error('Error fetching captures:', error);
    res.status(500).json({ error: 'Error fetching captures' });
  }
});

// Initialize and start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

startServer();