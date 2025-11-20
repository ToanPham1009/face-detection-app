const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Đăng ký
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );

    // Generate token
    const token = jwt.sign({ userId: result.rows[0].id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0],
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Đăng nhập - SỬA LẠI ĐỂ HỖ TRỢ CẢ USERNAME VÀ EMAIL
router.post('/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    console.log('🔐 Login attempt received:', { username, email });

    // Kiểm tra đầu vào - cho phép cả username hoặc email
    if ((!username && !email) || !password) {
      return res.status(400).json({ 
        error: 'Username/Email and password are required' 
      });
    }

    let user;
    
    // Tìm user bằng username hoặc email
    if (username) {
      // Tìm bằng username
      const userResult = await pool.query(
        'SELECT * FROM users WHERE username = $1', 
        [username]
      );
      user = userResult.rows[0];
      console.log('🔍 Searching by username:', username, 'Found:', !!user);
    } else {
      // Tìm bằng email
      const userResult = await pool.query(
        'SELECT * FROM users WHERE email = $1', 
        [email]
      );
      user = userResult.rows[0];
      console.log('🔍 Searching by email:', email, 'Found:', !!user);
    }

    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({ 
        error: 'Invalid username/email or password' 
      });
    }

    // Kiểm tra mật khẩu
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('🔑 Password valid:', isValidPassword);

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid username/email or password' 
      });
    }

    // Tạo token
    const token = jwt.sign({ 
      userId: user.id,
      username: user.username,
      email: user.email
    }, JWT_SECRET, { expiresIn: '24h' });

    console.log('✅ Login successful for user:', user.username);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

module.exports = router;