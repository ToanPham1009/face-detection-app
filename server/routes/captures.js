const express = require('express');
const multer = require('multer');
const { pool } = require('../config/database');
const cloudinary = require('../config/cloudinary');
const router = express.Router();

console.log('☁️ Cloudinary version:', require('cloudinary/package.json').version);

// Sử dụng memory storage giống video
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

// Upload capture image to Cloudinary VỚI FALLBACK
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 Uploading capture image to Cloudinary...');

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const { source, timestamp, sessionId, videoTime, faceCount } = req.body;

    let uploadResult;
    let useLocalFallback = false;

    try {
      // THỬ CÁCH 1: Upload với options đơn giản
      const uploadOptions1 = {
        resource_type: "image",
        folder: "face-detection/captures"
        // Không dùng format hoặc transformation
      };

      const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

      uploadResult = await cloudinary.uploader.upload(base64Data, uploadOptions1);
      console.log('✅ Image uploaded with simple options');

    } catch (error1) {
      console.warn('⚠️ Method 1 failed, trying method 2:', error1.message);

      try {
        // THỬ CÁCH 2: Upload với fetch_format
        const uploadOptions2 = {
          resource_type: "image",
          folder: "face-detection/captures",
          transformation: [
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        };

        uploadResult = await cloudinary.uploader.upload(
          `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
          uploadOptions2
        );
        console.log('✅ Image uploaded with fetch_format');

      } catch (error2) {
        console.warn('⚠️ Method 2 failed, using local fallback:', error2.message);

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
    }

    // Tạo dữ liệu capture
    const captureData = {
      id: timestamp || Date.now().toString(),
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      filename: req.file.originalname || `capture_${Date.now()}.jpg`,
      session_id: sessionId || null,
      source: source || 'camera',
      video_time: videoTime ? parseFloat(videoTime) : null,
      face_count: faceCount ? parseInt(faceCount) : 0,
      created_at: new Date().toISOString(),
      is_local: useLocalFallback
    };

    // Insert vào database
    await pool.query(
      `INSERT INTO captures (id, url, public_id, filename, session_id, source, video_time, face_count, created_at, is_local) 
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

    console.log('✅ Image saved to database:', captureData.id);

    res.json({
      success: true,
      id: captureData.id,
      url: captureData.url,
      public_id: captureData.public_id,
      filename: captureData.filename,
      created_at: captureData.created_at,
      is_local: captureData.is_local
    });

  } catch (error) {
    console.error('❌ Error uploading capture image:', error);
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
      `SELECT * FROM captures 
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

// Delete capture from Cloudinary
router.delete('/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    console.log(`🗑️ Deleting capture: ${publicId}`);

    // Xóa từ Cloudinary
    const cloudinaryResult = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image'
    });

    // Xóa từ database
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

module.exports = router;