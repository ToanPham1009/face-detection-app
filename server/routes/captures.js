const express = require('express');
const multer = require('multer');
const { pool } = require('../config/database');
const cloudinary = require('../config/cloudinary');
const router = express.Router();

console.log('☁️ Cloudinary version:', require('cloudinary/package.json').version);

// Sử dụng memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file hình ảnh (JPEG, PNG, GIF, WebP)'));
    }
  }
});

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 Uploading capture image to Cloudinary...');

    // 1. LẤY TẤT CẢ DỮ LIỆU TỪ REQ.BODY TRƯỚC
    const { source, timestamp, videoTime, faceCount } = req.body;

    // 2. LẤY sessionId RIÊNG (vì nó có thể là undefined)
    const sessionId = req.body.sessionId;

    console.log('📦 Request data received:', {
      sessionId: sessionId,
      source: source,
      timestamp: timestamp,
      videoTime: videoTime,
      faceCount: faceCount
    });

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    // 3. KIỂM TRA VÀ TẠO SESSION NẾU CHƯA CÓ (SAU KHI ĐÃ KHAI BÁO sessionId)
    if (sessionId && sessionId !== 'null' && sessionId !== 'live' && sessionId !== 'undefined') {
      try {
        const sessionCheck = await pool.query(
          'SELECT id FROM sessions WHERE id = $1',
          [sessionId]
        );

        if (sessionCheck.rows.length === 0) {
          console.log(`🆕 Session ${sessionId} not found, creating...`);

          // Tạo session mới
          await pool.query(
            `INSERT INTO sessions (id, start_time, end_time, total_faces, duration) 
             VALUES ($1, $2, $3, $4, $5)`,
            [sessionId, new Date().toISOString(), new Date().toISOString(), 0, 0]
          );

          console.log(`✅ Created missing session: ${sessionId}`);
        } else {
          console.log(`✅ Session ${sessionId} already exists`);
        }
      } catch (sessionError) {
        console.warn('⚠️ Could not check/create session:', sessionError.message);
        // Vẫn tiếp tục upload ảnh
      }
    } else {
      console.log('ℹ️ No valid sessionId provided:', sessionId);
    }

    let uploadResult;
    let useLocalFallback = false;

    try {
      // Upload ảnh với public_id có ý nghĩa
      const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const publicId = `capture_${sessionId || 'live'}_${Date.now()}`;

      uploadResult = await cloudinary.uploader.upload(base64Data, {
        resource_type: "image",
        folder: "face-detection/captures",
        public_id: publicId,
        overwrite: false
      });

      console.log('✅ Image uploaded with custom public_id:', publicId);

    } catch (uploadError) {
      console.warn('⚠️ Cloudinary upload failed, using local fallback:', uploadError.message);

      // FALLBACK: Lưu cục bộ
      useLocalFallback = true;
      const fs = require('fs');
      const path = require('path');

      const uploadsDir = path.join(__dirname, '../../uploads/captures');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filename = `capture_${Date.now()}.jpg`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);

      uploadResult = {
        secure_url: `/uploads/captures/${filename}`,
        public_id: `local_${Date.now()}`
      };

      console.log('✅ Image saved locally:', uploadResult.secure_url);
    }

    // 4. Tạo dữ liệu capture với public_id
    const captureId = timestamp || Date.now().toString();
    const captureData = {
      id: captureId,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      filename: req.file.originalname || `capture_${captureId}.jpg`,
      session_id: sessionId || null, // Có thể là null
      source: source || 'camera',
      video_time: videoTime ? parseFloat(videoTime) : null,
      face_count: faceCount ? parseInt(faceCount) : 0,
      created_at: new Date().toISOString(),
      is_local: useLocalFallback
    };

    console.log('💾 Capture data to save:', {
      id: captureData.id,
      session_id: captureData.session_id,
      filename: captureData.filename
    });

    // 5. Insert vào database với public_id
    await pool.query(
      `INSERT INTO captures 
       (id, url, public_id, filename, session_id, source, video_time, face_count, created_at, is_local) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        captureData.id,
        captureData.url,
        captureData.public_id,
        captureData.filename,
        captureData.session_id,
        captureData.source,
        captureData.video_time,
        captureData.face_count,
        captureData.created_at,
        captureData.is_local
      ]
    );

    console.log('✅ Image saved to database with session_id:', captureData.session_id);

    res.json({
      success: true,
      id: captureData.id,
      url: captureData.url,
      public_id: captureData.public_id,
      filename: captureData.filename,
      session_id: captureData.session_id, // Trả về session_id cho client
      created_at: captureData.created_at,
      is_local: captureData.is_local
    });

  } catch (error) {
    console.error('❌ Error uploading capture image:', error);

    // Log chi tiết lỗi
    console.error('🔍 Error stack:', error.stack);

    res.status(500).json({
      error: 'Failed to upload image',
      details: error.message
    });
  }
});

// Get captures by session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`📷 Fetching captures for session: ${sessionId}`);

    const result = await pool.query(
      `SELECT id, url, public_id, filename, session_id, source, 
              video_time, face_count, created_at, is_local
       FROM captures 
       WHERE session_id = $1 
       ORDER BY created_at DESC`,
      [sessionId]
    );

    console.log(`✅ Found ${result.rows.length} captures for session ${sessionId}`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching captures:', error);
    res.status(500).json({
      error: 'Error fetching captures',
      details: error.message
    });
  }
});

// Delete capture với kiểm tra loại file
router.delete('/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    console.log(`🗑️ Deleting capture: ${publicId}`);

    // 1. Lấy thông tin capture trước
    const captureInfo = await pool.query(
      'SELECT is_local, url FROM captures WHERE public_id = $1',
      [publicId]
    );

    if (captureInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Capture not found' });
    }

    const isLocal = captureInfo.rows[0].is_local;
    const captureUrl = captureInfo.rows[0].url;

    // 2. Xóa từ Cloudinary nếu không phải local
    let cloudinaryResult = null;
    if (!isLocal && publicId && !publicId.startsWith('local_')) {
      cloudinaryResult = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image'
      });
      console.log('✅ Deleted from Cloudinary:', cloudinaryResult);
    } else if (isLocal && captureUrl && captureUrl.startsWith('/uploads/')) {
      // Xóa file local nếu có
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '../../', captureUrl);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ Deleted local file:', filePath);
      }
    }

    // 3. Xóa từ database
    await pool.query('DELETE FROM captures WHERE public_id = $1', [publicId]);

    res.json({
      success: true,
      message: 'Capture deleted successfully',
      cloudinary_result: cloudinaryResult
    });

  } catch (error) {
    console.error('❌ Error deleting capture:', error);
    res.status(500).json({
      error: 'Failed to delete capture',
      details: error.message
    });
  }
});

// Get recent captures
router.get('/recent', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, url, public_id, filename, session_id, source, 
              video_time, face_count, created_at, is_local
       FROM captures 
       ORDER BY created_at DESC 
       LIMIT 20`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching recent captures:', error);
    res.status(500).json({ error: 'Error fetching recent captures' });
  }
});

module.exports = router;