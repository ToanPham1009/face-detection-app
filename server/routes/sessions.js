const express = require('express');
const { pool } = require('../config/database');
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

// Create or update session
router.post('/', async (req, res) => {
    const { id, start_time, end_time, total_faces, duration, video_filename } = req.body;

    console.log('Processing session:', { id, start_time, end_time, total_faces, duration, video_filename });

    try {
        // 🆕 KIỂM TRA session đã tồn tại chưa
        const existingSession = await pool.query(
            'SELECT id FROM sessions WHERE id = $1',
            [id]
        );

        let result;
        if (existingSession.rows.length > 0) {
            console.log('🔄 Session exists, updating...');
            // UPDATE session hiện có - CHỈ update end_time, total_faces, video_filename
            result = await pool.query(
                `UPDATE sessions 
                 SET end_time = $1, 
                     total_faces = $2,  
                     video_filename = COALESCE($3, video_filename)
                 WHERE id = $4 
                 RETURNING *`,
                [end_time, total_faces, video_filename, id]  // 🆕 Sửa index: $1, $2, $3, $4
            );
            console.log('✅ Session updated successfully');
        } else {
            console.log('🆕 Creating new session...');
            // INSERT session mới - CÓ duration
            result = await pool.query(
                `INSERT INTO sessions (id, start_time, end_time, total_faces, duration, video_filename) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [id, start_time, end_time, total_faces, duration, video_filename || null]
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

        // Kiểm tra nếu có bảng captures
        const result = await pool.query(`
            SELECT * FROM captures 
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

module.exports = router;