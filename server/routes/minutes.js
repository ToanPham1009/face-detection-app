const express = require('express');
const { pool } = require('../config/database');
const router = express.Router();

// Create minute data
router.post('/', async (req, res) => {
    const { session_id, start_time, end_time, face_count, minute_number } = req.body;

    console.log('Creating minute data:', { 
        session_id, 
        start_time, 
        end_time, 
        face_count, 
        minute_number 
    });

    // Validate required fields
    if (!session_id || !start_time || !end_time) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            required: ['session_id', 'start_time', 'end_time']
        });
    }

    try {
        // First check if session exists
        const sessionCheck = await pool.query(
            'SELECT id FROM sessions WHERE id = $1',
            [session_id]
        );

        if (sessionCheck.rows.length === 0) {
            console.log('Session not found, creating session first...');
            
            // Create a basic session record
            const sessionDuration = Math.floor((new Date(end_time) - new Date(start_time)) / 1000);
            await pool.query(
                `INSERT INTO sessions (id, start_time, end_time, total_faces, duration) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [session_id, start_time, end_time, face_count || 0, sessionDuration || 60]
            );
            console.log('Session created successfully for minute data');
        }

        // Thêm minute_number vào query nếu có
        const query = minute_number ? 
            `INSERT INTO minutes (session_id, start_time, end_time, face_count, minute_number) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *` :
            `INSERT INTO minutes (session_id, start_time, end_time, face_count) 
             VALUES ($1, $2, $3, $4) RETURNING *`;
             
        const values = minute_number ? 
            [session_id, start_time, end_time, face_count || 0, minute_number] :
            [session_id, start_time, end_time, face_count || 0];

        const result = await pool.query(query, values);

        console.log('Minute data created successfully:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error saving minute data:', error);
        
        if (error.code === '23503') { // Foreign key violation
            res.status(400).json({ 
                error: 'Session not found',
                details: 'The specified session does not exist'
            });
        } else if (error.code === '23505') { // Unique violation
            res.status(400).json({ 
                error: 'Duplicate minute data',
                details: 'Minute data for this time period already exists'
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to save minute data',
                details: error.message 
            });
        }
    }
});

// Get minutes by session ID
router.get('/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await pool.query(
            'SELECT * FROM minutes WHERE session_id = $1 ORDER BY start_time',
            [sessionId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching minute data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch minute data',
            details: error.message 
        });
    }
});

module.exports = router;