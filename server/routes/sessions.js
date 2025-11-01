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

// Create new session
router.post('/', async (req, res) => {
    const { id, start_time, end_time, total_faces, duration, video_filename } = req.body;

    console.log('Creating new session:', { id, start_time, end_time, total_faces, duration, video_filename });

    try {
        const result = await pool.query(
            `INSERT INTO sessions (id, start_time, end_time, total_faces, duration, video_filename) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [id, start_time, end_time, total_faces, duration, video_filename || null]
        );

        console.log('Session created successfully:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error saving session:', error);
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