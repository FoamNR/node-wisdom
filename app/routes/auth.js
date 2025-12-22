const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authenticateToken = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path'); // เพิ่ม path
const fs = require('fs');     // เพิ่ม fs

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// --- ตั้งค่า Multer สำหรับอัปโหลดรูปภาพ ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/profile/';
        // ตรวจสอบว่ามี folder หรือไม่ ถ้าไม่มีให้สร้าง
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // ตั้งชื่อไฟล์ใหม่เพื่อป้องกันชื่อซ้ำ: timestamp-random.นามสกุลไฟล์
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });
// ----------------------------------------

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.user_id;

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


// แก้ไข Route Register ให้รองรับ upload.single('profile_img')
router.post('/register', authenticateToken, upload.single('profile_img'), async (req, res) => {
    try {
        // ข้อมูล text จะอยู่ใน req.body
        const { username, password, fname, lname, role, phone_number } = req.body;

        // จัดการเรื่องรูปภาพ (ถ้ามีการอัปโหลดมา จะอยู่ใน req.file)
        let profile_img_path = null;
        if (req.file) {
            // เก็บ path ที่จะบันทึกลง Database (เช่น uploads/profile/filename.jpg)
            profile_img_path = `uploads/profile/${req.file.filename}`;
        } else {
            // กรณีไม่ได้อัปโหลดรูปมา อาจจะใช้ค่าจาก req.body (ถ้าส่งเป็น link) หรือ null
            profile_img_path = req.body.profile_img || null;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (username, password, profile_img, fname, lname, role, phone_number) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [username, hashedPassword, profile_img_path, fname, lname, role, phone_number]
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
        // ใน router.post('/login')
        if (!user) {
            // บันทึก Log เมื่อไม่พบผู้ใช้
            const logErr = `พยายามเข้าสู่ระบบแต่ไม่พบ Username: ${username}`;
            await pool.query(`INSERT INTO audit_log (log_data) VALUES ($1)`, [{
                ip: req.socket.remoteAddress,
                errorMessage: logErr,
                method: 'AUTH_FAILED',
                created_at: new Date()
            }]);
            return res.status(400).json({ message: "ไม่พบผู้ใช้" });
        }
        if (user.is_active === 0) return res.status(403).json({ message: "บัญชีถูกระงับ" });

        // ใน router.post('/login')
        if (!await bcrypt.compare(password, user.password)) {
            // 1. เตรียมข้อมูล Log
            const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

            const logData = {
                ip: ip,
                user_agent: req.headers['user-agent'],
                path: req.originalUrl,
                method: 'LOGIN_FAILED',
                errorMessage: `ผู้ใช้ ${username} กรอกรหัสผ่านไม่ถูกต้อง`, // เก็บข้อความที่นี่
                referrer: req.headers.referer || null,
                created_at: new Date()
            };

            // 2. บันทึกลงตาราง audit_log
            await pool.query(
                `INSERT INTO audit_log (log_data) VALUES ($1)`,
                [logData]
            );

            // 3. ตอบกลับ Client
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
            token: token,
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
    })
    res.clearCookie("access_token", {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path: "/"
    });
    res.status(200).json({ message: "Logout สำเร็จ" });
});

module.exports = router;