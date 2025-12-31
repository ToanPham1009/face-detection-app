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

// Dùng memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// Upload video to Cloudinary
router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    console.log('📤 Uploading video to Cloudinary...');
    console.log('🎯 SessionId from request:', req.body.sessionId);

    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    // Upload trực tiếp từ buffer
    const result = await cloudinary.uploader.upload(
      `data:video/mp4;base64,${req.file.buffer.toString('base64')}`,
      {
        resource_type: "video",
        folder: "face-detection-videos",
        format: "mp4",
        timeout: 120000 // 2 phút timeout
      }
    );

    console.log('✅ Video uploaded to Cloudinary:', {
      url: result.secure_url,
      public_id: result.public_id,
      duration: result.duration
    });

    // Update session với CẢ URL và public_id
    const { sessionId } = req.body;
    if (sessionId) {
      await pool.query(
        'UPDATE sessions SET video_filename = $1, video_public_id = $2 WHERE id = $3',
        [result.secure_url, result.public_id, sessionId]
      );
      console.log('✅ Session updated with Cloudinary URL and public_id');
    } else {
      console.warn('⚠️ No sessionId provided for video upload');
    }

    res.json({
      message: 'Video uploaded successfully',
      filename: result.secure_url,
      public_id: result.public_id,
      duration: result.duration
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

    // Tạo signed URL cho video
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

// Xóa video từ Cloudinary (chỉ xóa file, không xóa session)
router.delete('/:public_id', async (req, res) => {
  try {
    const { public_id } = req.params;

    console.log(`🗑️ Deleting video from Cloudinary: ${public_id}`);

    // 1. Xóa từ Cloudinary
    const cloudinaryResult = await cloudinary.uploader.destroy(public_id, {
      resource_type: 'video'
    });

    console.log('✅ Cloudinary deletion result:', cloudinaryResult);

    // 2. Cập nhật database: xóa video_filename và video_public_id
    await pool.query(
      'UPDATE sessions SET video_filename = NULL, video_public_id = NULL WHERE video_public_id = $1',
      [public_id]
    );

    res.json({
      success: true,
      message: 'Video deleted successfully',
      cloudinary_result: cloudinaryResult
    });

  } catch (error) {
    console.error('❌ Error deleting video:', error);
    res.status(500).json({
      error: 'Failed to delete video',
      details: error.message
    });
  }
});

module.exports = router;