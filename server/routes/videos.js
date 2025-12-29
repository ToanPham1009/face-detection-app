const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { pool } = require('../config/database');
const cloudinary = require('../config/cloudinary');
const router = express.Router();

console.log('Cloudinary config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'MISSING',
  api_key: process.env.CLOUDINARY_API_KEY ? 'SET' : 'MISSING', 
  api_secret: process.env.CLOUDINARY_API_SECRET ? 'SET' : 'MISSING'
});

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

// THAY THẾ diskStorage bằng memoryStorage
const upload = multer({
  storage: multer.memoryStorage(),  // Dùng memory thay vì disk
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// Upload video to Cloudinary
router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    console.log('📤 Uploading video to Cloudinary...');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    // Upload trực tiếp từ buffer, không cần file tạm
    const result = await cloudinary.uploader.upload(
      `data:video/mp4;base64,${req.file.buffer.toString('base64')}`, 
      {
        resource_type: "video",
        folder: "face-detection-videos",
        format: "mp4"
      }
    );

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


    res.json({ 
      message: 'Video uploaded successfully',
      filename: result.secure_url,
      public_id: result.public_id
    });

  } catch (error) {
    console.error('❌ Error uploading video:', error);
    
    
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