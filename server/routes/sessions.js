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
        // KIỂM TRA session đã tồn tại chưa
        const existingSession = await pool.query(
            'SELECT id FROM sessions WHERE id = $1',
            [id]
        );

        let result;
        if (existingSession.rows.length > 0) {
            console.log('🔄 Session exists, updating...');

            // 🆕 CHỈ UPDATE các field thực sự thay đổi
            // Giữ nguyên start_time, chỉ update end_time nếu mới hơn
            // Giữ nguyên duration lớn nhất
            const updateFields = [];
            const updateValues = [];
            let paramCount = 1;

            // Luôn update end_time và total_faces
            updateFields.push(`end_time = $${paramCount++}`);
            updateValues.push(end_time);

            updateFields.push(`total_faces = $${paramCount++}`);
            updateValues.push(total_faces);

            // Chỉ update duration nếu lớn hơn
            updateFields.push(`duration = GREATEST(duration, $${paramCount++})`);
            updateValues.push(duration);

            // Chỉ update video_filename nếu có giá trị mới
            if (video_filename) {
                updateFields.push(`video_filename = $${paramCount++}`);
                updateValues.push(video_filename);
            }

            updateValues.push(id); // WHERE condition

            result = await pool.query(
                `UPDATE sessions 
                 SET ${updateFields.join(', ')}
                 WHERE id = $${paramCount}
                 RETURNING *`,
                [...updateValues, id]
            );
            console.log('✅ Session updated successfully');
        } else {
            console.log('🆕 Creating new session...');
            // INSERT session mới
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

module.exports = router;