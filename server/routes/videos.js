// const express = require('express');
const multer = require('multer');
const path = require('fs');
const { pool } = require('../config/database');
const cloudinary = require('../config/cloudinary');
const router = express.Router();

// Cấu hình multer để lưu tạm
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `temp-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload video to Cloudinary
router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    console.log('📤 Uploading video to Cloudinary...');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    // Upload lên Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: "face-detection-videos",
      quality: "auto",
      fetch_format: "auto"
    });

    console.log('✅ Video uploaded to Cloudinary:', result.secure_url);

    // Update session với Cloudinary URL
    const { sessionId } = req.body;
    if (sessionId) {
      await pool.query(
        'UPDATE sessions SET video_filename = $1 WHERE id = $2',
        [result.secure_url, sessionId]
      );
      console.log('✅ Session updated with Cloudinary URL');
    }

    // Xóa file tạm
    fs.unlinkSync(req.file.path);

    res.json({ 
      message: 'Video uploaded successfully',
      filename: result.secure_url,
      public_id: result.public_id
    });

  } catch (error) {
    console.error('❌ Error uploading video:', error);
    
    // Xóa file tạm nếu có lỗi
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to upload video',
      details: error.message 
    });
  }
});

// Get video URL (redirect to Cloudinary)
router.get('/:public_id', async (req, res) => {
  try {
    const { public_id } = req.params;
    
    // Tạo signed URL cho video (bảo mật hơn)
    const videoUrl = cloudinary.url(public_id, {
      resource_type: "video",
      type: "upload",
      expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
    });
    
    res.redirect(videoUrl);
    
  } catch (error) {
    console.error('Error generating video URL:', error);
    res.status(500).json({ error: 'Failed to get video' });
  }
});

// Get all videos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.* 
      FROM sessions s 
      WHERE s.video_filename IS NOT NULL 
      ORDER BY s.start_time DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

module.exports = router;