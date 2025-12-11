const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon'); // เรียกใช้ connection pool
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authenticateToken = require('../middleware/authMiddleware');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;


router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id; // ได้จาก token

    const result = await pool.query(
      'SELECT user_id, fname, lname, profile_img, role FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    const roleMap = {
      super_admin: "แอดมิน",
      editor: "ผู้แก้ไข",
    };

    user.role_name = roleMap[user.role] || user.role; 

    res.json(user);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



router.post('/register', authenticateToken, async (req, res) => {
    try {
        const { username, password, fname, lname, role, phone_number } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password, fname, lname, role, phone_number) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [username, hashedPassword, fname, lname, role, phone_number]
        );
        res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: "กรุณากรอกข้อมูล" });

        const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
        const user = rows[0];

        if (!user) return res.status(400).json({ message: "ไม่พบผู้ใช้" });
        if (user.is_active === 0) return res.status(403).json({ message: "บัญชีถูกระงับ" });

        if (!await bcrypt.compare(password, user.password)) {
            return res.status(400).json({ message: "รหัสผ่านผิด" });
        }

        // สร้าง Token
        const token = jwt.sign(
            { user_id: user.user_id, username: user.username, name: user.fname + " " + user.lname, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            path: "/",
        });

        res.status(200).json({
            message: "Login สำเร็จ",
            token: token,   // ➜ เพิ่มบรรทัดนี้
            user: {
                user_id: user.user_id,
                username: user.username,
                fname: user.fname,
                lname: user.lname,
                role: user.role
            }
        });


    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});
router.post('/logout', (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path: "/"
    });
    res.status(200).json({ message: "Logout สำเร็จ" });
});

module.exports = router;