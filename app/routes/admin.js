const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadDir = path.join(__dirname, '../../uploads'); // Default

        // เช็คเงื่อนไขเพื่อแยกโฟลเดอร์
        const isGallery = (req.body && (req.body.isGallery === true || req.body.isGallery === 'true')) || req.originalUrl.includes('gallery');
        const isProfile = req.originalUrl.includes('register') || req.originalUrl.includes('users') || req.originalUrl.includes('artisan');

        if (isGallery) {
            uploadDir = path.join(__dirname, '../../uploads/gallery');
        } else if (isProfile) {
            uploadDir = path.join(__dirname, '../../uploads/profile');
        }

        // สร้างโฟลเดอร์ถ้ายังไม่มี
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();

        const name = req.body.fname ? req.body.fname.replace(/\s+/g, '_') : 'artisan';

        const now = new Date();
        const timestamp = now.toISOString().split('T')[0] + '-' + now.getTime();

        const finalFilename = `${name}-${timestamp}${ext}`;

        cb(null, finalFilename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง (เฉพาะ jpeg, jpg, png, gif)'));
        }
    }
});

// --- 2. ปรับปรุงฟังก์ชันลบไฟล์ ---
const deleteFile = (filePath) => {
    if (!filePath) return;

    try {
        let filename = null;
        try {
            // กรณี filePath มาเป็น URL เต็ม
            const url = new URL(filePath);
            filename = path.basename(url.pathname);
        } catch (e) {
            // กรณี filePath มาเป็น relative path หรือแค่ชื่อไฟล์
            filename = path.basename(filePath);
        }

        // เพิ่ม path ของ profile เข้าไปในการค้นหาด้วย
        const locations = [
            path.join(__dirname, '../../uploads', filename),
            path.join(__dirname, '../../uploads/gallery', filename),
            path.join(__dirname, '../../uploads/profile', filename) // เพิ่มบรรทัดนี้
        ];

        let deleted = false;
        for (const fullPath of locations) {
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                console.log('Deleted file:', fullPath);
                deleted = true;
                break; // ลบเจอแล้วให้ออกเลย
            }
        }

        if (!deleted) {
            console.log('File to delete not found:', filename);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
    }
};

router.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'ไม่มีไฟล์ที่เลือก' });
        }

        const isGallery = req.body && (req.body.isGallery === 'true' || req.body.isGallery === true);
        const relativePath = isGallery
            ? `/uploads/gallery/${req.file.filename}`
            : `/uploads/${req.file.filename}`;
        const fullUrl = `${req.protocol}://${req.get('host')}${relativePath}`;

        res.status(200).json({
            message: 'อัปโหลดไฟล์สำเร็จ',
            path: fullUrl,
            filename: req.file.filename,
            relativePath
        });

    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปโหลด', error: error.message });
    }
});

router.get('/users', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;

        let query = "SELECT user_id, profile_img, username, fname, lname, profile_img, phone_number, role  FROM users";
        let params = [];


        if (search) {

            query += ` WHERE fname ILIKE $1 OR lname ILIKE $1 OR username ILIKE $1`;
            params.push(`%${search}%`);
        }

        query += " ORDER BY user_id DESC";
        const { rows } = await pool.query(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

router.post('/register', authenticateToken, upload.single('profile_img'), async (req, res) => {
    try {
        const { username, password, fname, lname, role, phone_number } = req.body;

        let profile_img_path = null;
        if (req.file) {
            profile_img_path = `uploads/profile/${req.file.filename}`;
        } else {
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
router.put('/users/:user_id', authenticateToken, upload.single('profile_img'), async (req, res) => {
    try {
        const { user_id } = req.params;
        const { username, password, fname, lname, role, phone_number } = req.body;

        // 1. ดึงข้อมูล User เก่าออกมาก่อน เพื่อเช็คว่ามีตัวตนจริง และเพื่อเอาข้อมูลเก่ามาใช้กรณีที่ไม่ได้ส่งค่าใหม่มา
        const userCheck = await pool.query('SELECT * FROM users WHERE user_id = $1', [user_id]);

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const oldUser = userCheck.rows[0];

        // 2. จัดการเรื่องรูปภาพ (Profile Image)
        let profile_img_path = oldUser.profile_img; // เริ่มต้นด้วยค่าเดิมก่อน
        if (req.file) {
            // ถ้ามีการอัปโหลดไฟล์ใหม่ ให้ใช้ path ใหม่
            profile_img_path = `uploads/profile/${req.file.filename}`;

            // (Optional) ตรงนี้คุณอาจจะเพิ่มโค้ดลบไฟล์รูปเก่าออกจาก Server ด้วย fs.unlink ก็ได้
        } else if (req.body.profile_img) {
            // กรณีส่งมาเป็น Text path (เช่นกรณีไม่ได้เลือกไฟล์ใหม่ แต่ส่งค่าเดิมกลับมา)
            profile_img_path = req.body.profile_img;
        }

        // 3. จัดการเรื่องรหัสผ่าน (Password)
        let hashedPassword = oldUser.password; // เริ่มต้นด้วยรหัสผ่านเดิม
        if (password && password.trim() !== "") {
            // ถ้ามีการส่ง password มาใหม่ และไม่ใช่ค่าว่าง -> ให้ทำการ Hash ใหม่
            hashedPassword = await bcrypt.hash(password, 10);
        }

        // 4. ทำการ Update ลงฐานข้อมูล
        const result = await pool.query(
            `UPDATE users 
             SET username = $1, password = $2, profile_img = $3, fname = $4, lname = $5, role = $6, phone_number = $7 
             WHERE user_id = $8 
             RETURNING *`,
            [username, hashedPassword, profile_img_path, fname, lname, role, phone_number, user_id]
        );

        res.status(200).json({ message: 'User updated successfully', user: result.rows[0] });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        // 1. ดึงข้อมูล path รูปภาพปัจจุบัน
        const userResult = await pool.query(
            "SELECT profile_img FROM users WHERE user_id = $1",
            [id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้งานที่ต้องการลบ" });
        }

        const profileImgPath = userResult.rows[0].profile_img;

        // 2. ลบไฟล์รูปภาพ (ถ้ามี)
        if (profileImgPath) {
            try {
                // ดึงเฉพาะชื่อไฟล์ออกมา (เพื่อป้องกันกรณี path ใน DB เป็น URL หรือมี Folder ติดมา)
                // ตัวอย่าง: "uploads/profile/image-123.jpg" -> "image-123.jpg"
                const filename = path.basename(profileImgPath);

                // ระบุ Path โฟลเดอร์รูปโปรไฟล์ให้ชัดเจน (อิงจาก Multer config ที่ใช้ ../../uploads)
                const fullPath = path.join(__dirname, '../../uploads/profile', filename);

                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    console.log(`Successfully deleted file: ${fullPath}`);
                } else {
                    console.log(`File not found at: ${fullPath}`);
                }
            } catch (err) {
                console.error("Error deleting file:", err);
                // ไม่ return error เพื่อให้โปรแกรมทำงานต่อจนจบการลบ User ใน DB
            }
        }

        // 3. ลบข้อมูลใน Database
        const query = "DELETE FROM users WHERE user_id = $1";
        const result = await pool.query(query, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้งานที่ต้องการลบ" });
        }

        res.status(200).json({ message: "ลบผู้ใช้งานเรียบร้อยแล้ว", deleted_id: id });

    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});


router.get('/artisans-data', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;

        let query = `
            SELECT 
            artisan.artisan_id,
                artisan.fname,
                artisan.lname,
                artisan.province,
                category.category_name,
                artisan.profile_img,
                artisan.status,
                artisan.updated_at
            FROM artisan
            JOIN category ON artisan.category_id = category.category_id
        `;

        const params = [];

        if (search) {
            query += ` WHERE artisan.fname ILIKE $1 
                        OR artisan.lname ILIKE $1 
                        OR category.category_name ILIKE $1 `;
            params.push(`%${search}%`);
        }

        query += " ORDER BY artisan.artisan_id DESC";

        const { rows } = await pool.query(query, params);
        res.status(200).json(rows);

    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

router.delete('/artisans-data/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const query = "DELETE FROM artisan WHERE artisan_id = $1";
        const result = await pool.query(query, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลช่างฝีมือที่ต้องการลบ" });
        }

        const logData = {
            ip: req.ip,
            user_agent: req.headers['user-agent'],
            path: req.originalUrl,
            action_type: 'DELETE_ARTISAN',
            http_method: req.method, // DELETE
            created_at: new Date()
        }

        await pool.query(
            `INSERT INTO audit_log (log_data) VALUES ($1)`,
            [logData]
        )

        res.status(200).json({ message: "ลบข้อมูลเรียบร้อยแล้ว", deleted_id: id });

    } catch (error) {
        console.error("Delete Error:", error);

        if (error.code === '23503') {
            return res.status(400).json({
                message: "ไม่สามารถลบได้ เนื่องจากมีข้อมูลที่เกี่ยวข้อง (เช่น สินค้า หรือ ประวัติ) อยู่ในระบบ"
            });
        }

        res.status(500).json({ message: "Server Error" });
    }
});

router.post('/artisan/add', authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // ผู้ที่เพิ่มข้อมูล (มาจาก token)
        const created_by = req.user.user_id;

        const {
            fname,
            lname,
            profile_img,
            birth_date,
            address,
            province,
            district,
            category_id,
            category_name,
            biography,
            status
        } = req.body;

        // ตรวจข้อมูลจำเป็น
        if (!fname || !lname) {
            throw new Error("กรุณาระบุชื่อและนามสกุล");
        }

        // หา category_id
        let finalCategoryId;

        if (category_id) {
            finalCategoryId = category_id;
        } else if (category_name) {
            const catRes = await client.query(
                `SELECT category_id FROM category WHERE category_name = $1`,
                [category_name]
            );

            if (catRes.rowCount === 0) {
                throw new Error(`ไม่พบหมวดหมู่: ${category_name}`);
            }

            finalCategoryId = catRes.rows[0].category_id;
        } else {
            throw new Error("กรุณาระบุ category_id หรือ category_name");
        }

        const artisanStatus = status || 'ฉบับร่าง';

        // เพิ่ม artisan
        const artisanRes = await client.query(
            `
            INSERT INTO artisan (
                fname,
                lname,
                profile_img,
                birth_date,
                address,
                province,
                district,
                category_id,
                biography,
                status,
                created_by,
                created_at
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()
            )
            RETURNING
                artisan_id,
                fname,
                lname,
                status,
                created_at
            `,
            [
                fname,
                lname,
                profile_img || null,
                birth_date || null,
                address,
                province,
                district,
                finalCategoryId,
                biography,
                artisanStatus,
                created_by
            ]
        );

        await client.query('COMMIT');

        res.status(201).json({
            message: "เพิ่มข้อมูลปราชญ์เรียบร้อยแล้ว",
            data: artisanRes.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Add Artisan Error:", error);
        res.status(500).json({
            message: error.message
        });
    } finally {
        client.release();
    }
});

router.get('/artisan/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                artisan.*,
                category.category_name
            FROM artisan
            LEFT JOIN category ON artisan.category_id = category.category_id
            WHERE artisan.artisan_id = $1
        `;

        const { rows } = await pool.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลปราชญ์" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error("Get Single Artisan Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});


router.put('/artisan/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const createByUserId = req.user.user_id;

    const {
        fname,
        lname,
        profile_img,
        birth_date,
        address,
        province,
        district,
        category_id,
        biography,
        status
    } = req.body;

    // validate required fields
    if (!fname || !lname || !category_id) {
        return res.status(400).json({
            message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน"
        });
    }

    try {
        // ดึงข้อมูลรูปเดิม
        const oldArtisanQuery = `
            SELECT profile_img 
            FROM artisan 
            WHERE artisan_id = $1
        `;
        const oldArtisanRes = await pool.query(oldArtisanQuery, [id]);

        if (oldArtisanRes.rows.length === 0) {
            return res.status(404).json({
                message: "ไม่พบข้อมูลปราชญ์ที่ต้องการแก้ไข"
            });
        }

        const oldProfileImg = oldArtisanRes.rows[0].profile_img;

        // จัดการรูปโปรไฟล์
        let finalProfileImg = profile_img;

        // เปลี่ยนรูปใหม่ → ลบรูปเก่า
        if (oldProfileImg && profile_img && oldProfileImg !== profile_img) {
            deleteFile(oldProfileImg);
        }

        // ลบรูป (ส่ง null มา)
        if (profile_img === null && oldProfileImg) {
            deleteFile(oldProfileImg);
            finalProfileImg = null;
        }

        // UPDATE artisan (แก้ created_by)
        const query = `
            UPDATE artisan 
            SET 
                fname = $1,
                lname = $2,
                profile_img = $3,
                birth_date = $4,
                address = $5,
                province = $6,
                district = $7,
                category_id = $8,
                biography = $9,
                status = $10,
                created_by = $11,
                updated_at = NOW()
            WHERE artisan_id = $12
            RETURNING *
        `;

        const values = [
            fname,
            lname,
            finalProfileImg,
            birth_date,
            address,
            province,
            district,
            category_id,
            biography,
            status,
            createByUserId, // created_by จาก token
            id
        ];

        const result = await pool.query(query, values);

                const logData = {
            ip: req.ip,
            user_agent: req.headers['user-agent'],
            path: req.originalUrl,
            action_type: 'PUT_ARTISAN',
            http_method: req.method, // PUT
            created_at: new Date()
        }

        await pool.query(
            `INSERT INTO audit_log (log_data) VALUES ($1)`,
            [logData]
        )

        res.status(200).json({
            message: "แก้ไขข้อมูลเรียบร้อยแล้ว",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Update Artisan Error:", error);
        res.status(500).json({
            message: "Server Error",
            error: error.message
        });
    }
});


module.exports = router;