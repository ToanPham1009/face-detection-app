const express = require('express');
const { pool } = require('../config/database');
const cloudinary = require('../config/cloudinary'); // Thêm Cloudinary
const router = express.Router();

// Get all sessions
router.get('/', async (req, res) => {
    try {
        console.log('Fetching sessions from database...');
        const result = await pool.query(`
            SELECT * FROM sessions 
            ORDER BY start_time DESC
        `);
        console.log(`Found ${result.rows.length} sessions`);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({
            error: 'Failed to fetch sessions',
            details: error.message
        });
    }
});

// Create or update session với video_public_id
router.post('/', async (req, res) => {
    const { id, start_time, end_time, total_faces, duration, video_filename, video_public_id } = req.body;

    console.log('Processing session:', { 
        id, start_time, end_time, total_faces, duration, 
        video_filename, video_public_id 
    });

    try {
        // Kiểm tra session đã tồn tại chưa
        const existingSession = await pool.query(
            'SELECT id FROM sessions WHERE id = $1',
            [id]
        );

        let result;
        if (existingSession.rows.length > 0) {
            console.log('🔄 Session exists, updating...');
            // UPDATE session hiện có
            result = await pool.query(
                `UPDATE sessions 
                 SET end_time = $1, 
                     total_faces = $2,  
                     video_filename = COALESCE($3, video_filename),
                     video_public_id = COALESCE($4, video_public_id)
                 WHERE id = $5 
                 RETURNING *`,
                [end_time, total_faces, video_filename, video_public_id, id]
            );
            console.log('✅ Session updated successfully');
        } else {
            console.log('🆕 Creating new session...');
            // INSERT session mới
            result = await pool.query(
                `INSERT INTO sessions 
                 (id, start_time, end_time, total_faces, duration, video_filename, video_public_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [id, start_time, end_time, total_faces, duration, video_filename || null, video_public_id || null]
            );
            console.log('✅ Session created successfully');
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('❌ Error saving session:', error);
        res.status(500).json({
            error: 'Failed to save session',
            details: error.message
        });
    }
});

// Get session by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'SELECT * FROM sessions WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching session:', error);
        res.status(500).json({
            error: 'Failed to fetch session',
            details: error.message
        });
    }
});

// Get session images
router.get('/:id/images', async (req, res) => {
    const { id } = req.params;

    try {
        console.log(`📸 Fetching images for session: ${id}`);

        const result = await pool.query(`
            SELECT id, url, public_id, filename, session_id, source, 
                   video_time, face_count, created_at, is_local
            FROM captures 
            WHERE session_id = $1 
            ORDER BY created_at DESC
        `, [id]);

        console.log(`✅ Found ${result.rows.length} images for session ${id}`);
        res.json(result.rows);

    } catch (error) {
        console.error('❌ Error fetching session images:', error);

        // Nếu bảng captures không tồn tại, trả về mảng rỗng
        if (error.message.includes('relation "captures" does not exist')) {
            console.log('⚠️ Captures table does not exist, returning empty array');
            res.json([]);
        } else {
            res.status(500).json({
                error: 'Failed to fetch session images',
                details: error.message
            });
        }
    }
});

// Xóa session và tất cả tài nguyên liên quan
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        console.log(`🗑️ Deleting session: ${id}`);

        // 1. Lấy thông tin session trước
        const sessionResult = await pool.query(
            'SELECT video_public_id FROM sessions WHERE id = $1',
            [id]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const videoPublicId = sessionResult.rows[0].video_public_id;

        // 2. Xóa video từ Cloudinary nếu có
        if (videoPublicId) {
            try {
                await cloudinary.uploader.destroy(videoPublicId, {
                    resource_type: 'video'
                });
                console.log(`✅ Deleted video from Cloudinary: ${videoPublicId}`);
            } catch (cloudinaryError) {
                console.warn('⚠️ Could not delete from Cloudinary:', cloudinaryError.message);
                // Vẫn tiếp tục dù Cloudinary lỗi
            }
        }

        // 3. Xóa tất cả captures của session này
        // 3a. Lấy danh sách captures để xóa từ Cloudinary
        const capturesResult = await pool.query(
            'SELECT public_id, is_local, url FROM captures WHERE session_id = $1',
            [id]
        );

        // 3b. Xóa từng capture từ Cloudinary/local
        for (const capture of capturesResult.rows) {
            try {
                if (!capture.is_local && capture.public_id && !capture.public_id.startsWith('local_')) {
                    // Xóa từ Cloudinary
                    await cloudinary.uploader.destroy(capture.public_id, {
                        resource_type: 'image'
                    });
                } else if (capture.is_local && capture.url && capture.url.startsWith('/uploads/')) {
                    // Xóa file local
                    const fs = require('fs');
                    const path = require('path');
                    const filePath = path.join(__dirname, '../../', capture.url);
                    
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
            } catch (deleteError) {
                console.warn(`⚠️ Failed to delete capture ${capture.public_id}:`, deleteError.message);
            }
        }

        // 3c. Xóa captures từ database
        await pool.query('DELETE FROM captures WHERE session_id = $1', [id]);

        // 4. Xóa session từ database
        await pool.query('DELETE FROM sessions WHERE id = $1', [id]);

        console.log(`✅ Session ${id} and all related resources deleted`);

        res.json({
            success: true,
            message: 'Session and all related resources deleted successfully',
            deleted_video: !!videoPublicId,
            deleted_captures: capturesResult.rows.length
        });

    } catch (error) {
        console.error('❌ Error deleting session:', error);
        res.status(500).json({
            error: 'Failed to delete session',
            details: error.message
        });
    }
});

module.exports = router;