const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- Multer Configuration ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // ตรวจสอบว่าเป็นการอัปโหลดแกลเลอรี่หรือเปล่า
    const isGallery = (req.body && (req.body.isGallery === true || req.body.isGallery === 'true')) || req.path.includes('gallery');
    const uploadDir = isGallery 
      ? path.join(__dirname, '../../uploads/gallery')
      : path.join(__dirname, '../../uploads');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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

// --- Helper Function: Delete File ---
const deleteFile = (filePath) => {
  if (!filePath) return;
  
  try {
    // รองรับทั้งรูปแบบ full URL (http://...) และ relative path (/uploads/...)
    let filename = null;

    try {
      // ถ้าเป็น URL เต็ม จะ parse ได้
      const url = new URL(filePath);
      filename = path.basename(url.pathname);
    } catch (e) {
      // ไม่ใช่ URL -> ใช้ basename ตรง ๆ
      filename = path.basename(filePath);
    }

    // ตรวจสอบทั้ง uploads และ uploads/gallery
    const locations = [
      path.join(__dirname, '../../uploads', filename),
      path.join(__dirname, '../../uploads/gallery', filename)
    ];

    for (const fullPath of locations) {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log('Deleted file:', fullPath);
        return;
      }
    }

    console.log('File to delete not found in expected locations:', filename);
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

// --- Upload Route ---
router.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'ไม่มีไฟล์ที่เลือก' });
    }

    // ตรวจสอบว่าเป็นแกลเลอรี่หรือเปล่า (เช็ค string 'true')
    const isGallery = req.body && (req.body.isGallery === 'true' || req.body.isGallery === true);
    const relativePath = isGallery 
      ? `/uploads/gallery/${req.file.filename}`
      : `/uploads/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get('host')}${relativePath}`;
    
    res.status(200).json({
      message: 'อัปโหลดไฟล์สำเร็จ',
      path: fullUrl,      // ส่งเป็น URL เต็ม
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
        // 1. รับค่า search จาก query parameters (เช่น /users?search=ผ้าไหม)
        const { search } = req.query; 

        let query = "SELECT user_id, username, fname, lname, profile_img, phone_number, role  FROM users";
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

router.delete('/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        // คำสั่ง SQL ลบข้อมูล (Database จะทำหน้าที่ไล่ set null ในตารางอื่นให้เองตามที่ตั้งค่าไว้)
        const query = "DELETE FROM users WHERE user_id = $1";
        const result = await pool.query(query, [id]);

        // ตรวจสอบว่าลบได้จริงไหม
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้งานที่ต้องการลบ" });
        }

        // ส่งค่ากลับเมื่อลบสำเร็จ
        res.status(200).json({ message: "ลบผู้ใช้งานเรียบร้อยแล้ว (ข้อมูลที่เกี่ยวข้องถูกตั้งเป็น NULL)", deleted_id: id });

    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});


router.get('/artisans-data',authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;

        // ปรับ join ให้ถูกต้อง: category_id join กับ category_id
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
        
        // ถ้ามีการลบรูปภาพด้วย ให้ใส่ Logic ลบไฟล์ตรงนี้ (ใช้ fs.unlink)

        res.status(200).json({ message: "ลบข้อมูลเรียบร้อยแล้ว", deleted_id: id });

    } catch (error) {
        console.error("Delete Error:", error);

        // ดักจับ Error กรณีติด Foreign Key (PostgreSQL code 23503)
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
        await client.query('BEGIN'); // เริ่ม Transaction

        // 1. รับค่าเฉพาะที่ต้องลงตาราง artisan
        const { 
            fname, 
            lname, 
            profile_img,     // Nullable
            birth_date,      // Required (Date: YYYY-MM-DD)
            address,         // Required
            province,        // Required
            district,        // Required
            category_name,   // เพื่อเอาไปหา ID
            category_id,     // หรือส่ง ID มาโดยตรง
            biography,       // Required
            status           // Optional (Default: 'ฉบับร่าง')
        } = req.body;

        // ---------------------------------------------------------
        // 2. เตรียม Category ID (เพราะเป็น FK ในตาราง artisan)
        // ---------------------------------------------------------
        let finalCategoryId = null;

        if (category_id) {
            finalCategoryId = category_id;
        } else if (category_name) {
            const catRes = await client.query(
                `SELECT category_id FROM category WHERE category_name = $1`, 
                [category_name]
            );
            if (catRes.rows.length > 0) {
                finalCategoryId = catRes.rows[0].category_id;
            } else {
                 throw new Error(`ไม่พบหมวดหมู่: ${category_name}`);
            }
        } else {
            throw new Error("กรุณาระบุหมวดหมู่ (category_name หรือ category_id)");
        }

        // ---------------------------------------------------------
        // 3. Insert ลงตาราง artisan
        // ---------------------------------------------------------
        const insertArtisanQuery = `
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
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING artisan_id, fname, lname, status
        `;
        
        // กำหนดค่า status ถ้าไม่ส่งมาให้ใช้ default เป็น 'ฉบับร่าง'
        const artisanStatus = status || 'ฉบับร่าง'; 

        const artisanRes = await client.query(insertArtisanQuery, [
            fname, 
            lname, 
            profile_img || null, 
            birth_date, 
            address, 
            province, 
            district, 
            finalCategoryId, 
            biography,
            artisanStatus
        ]);

        await client.query('COMMIT'); // ยืนยันข้อมูล

        res.status(201).json({
            message: "เพิ่มข้อมูลปราชญ์เรียบร้อยแล้ว",
            data: artisanRes.rows[0]
        });
        

    } catch (error) {
        await client.query('ROLLBACK'); // ยกเลิกถ้ามี Error
        console.error("Add Artisan Error:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    } finally {
        client.release(); // คืน connection
    }
});
router.get('/artisan/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // ดึงข้อมูล Artisan พร้อมชื่อหมวดหมู่
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

// --- 2. UPDATE Artisan (บันทึกการแก้ไข) ---
router.put('/artisan/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
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

    if (!fname || !lname || !category_id) {
         return res.status(400).json({ message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    try {
        // ดึงข้อมูล Artisan เก่า เพื่อหาตำแหน่งรูปเก่า
        const oldArtisanQuery = `SELECT profile_img FROM artisan WHERE artisan_id = $1`;
        const oldArtisanRes = await pool.query(oldArtisanQuery, [id]);
        
        if (oldArtisanRes.rows.length === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลปราชญ์ที่ต้องการแก้ไข" });
        }

        const oldProfileImg = oldArtisanRes.rows[0].profile_img;

        // ถ้ารูปเปลี่ยนหรือลบ ให้ลบรูปเก่า
        if (oldProfileImg && oldProfileImg !== profile_img) {
            deleteFile(oldProfileImg);
        }
        // ถ้าส่ง profile_img เป็น null (ลบรูป)
        // จะลบรูปเก่าและตั้งค่า profile_img ใน DB เป็น null
        let finalProfileImg = profile_img;
        if (profile_img === null && oldProfileImg) {
            deleteFile(oldProfileImg);
            finalProfileImg = null;
        }

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
                updated_at = NOW() 
            WHERE artisan_id = $11
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
            id 
        ];

        const result = await pool.query(query, values);

        res.status(200).json({ 
            message: "แก้ไขข้อมูลเรียบร้อยแล้ว", 
            data: result.rows[0] 
        });

    } catch (error) {
        console.error("Update Artisan Error:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});



module.exports = router;