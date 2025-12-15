const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');


router.get('/', async(req, res) => {
    try {
        // รับค่า parameter ทั้งหมด
        const { search, category, province } = req.query;

        // --- จุดที่แก้ไข: เปลี่ยนจาก WHERE 1=1 เป็นระบุเงื่อนไข status ตรงนี้เลย ---
        let queryText = `SELECT artisan_id, fname, lname, profile_img, category_name, province 
                         FROM artisan 
                         JOIN category ON artisan.category_id = category.category_id 
                         WHERE artisan.status = 'เผยแพร่'`;
        
        let queryParams = [];
        let paramCount = 1;

        // 1. เงื่อนไข Search Text (ชื่อ, นามสกุล)
        if (search) {
            // ใช้ AND เชื่อมต่อจากเงื่อนไข status
            queryText += ` AND (fname ILIKE $${paramCount} OR lname ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        // 2. เงื่อนไข Category
        if (category && category !== 'ทั้งหมด') {
            queryText += ` AND category_name = $${paramCount}`;
            queryParams.push(category);
            paramCount++;
        }

        // 3. เงื่อนไข Province
        if (province && province !== 'ทั้งหมด') {
            queryText += ` AND province = $${paramCount}`;
            queryParams.push(province);
            paramCount++;
        }

        const result = await pool.query(queryText, queryParams);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
})


router.get('/artisans-data', async (req, res) => {
    try {
        const { search } = req.query;
        let query = `
            SELECT 
                artisan_skill.*, 
                category.category_name,
                artisan.fname,
                artisan.lname,
                artisan.nickname,
                artisan.address,
                artisan.phone
            FROM artisan_skill
            JOIN category ON artisan_skill.category_id = category.category_id
            JOIN artisan ON artisan_skill.artisan_id = artisan.artisan_id
        `;
        
        let params = [];

        if (search) {
            query += ` WHERE artisan.fname ILIKE $1 
                       OR artisan.lname ILIKE $1 
                       OR category.category_name ILIKE $1 
                       OR artisan_skill.specialty_detail ILIKE $1 
                       OR artisan.address ILIKE $1`;
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

router.post('/add', authenticateToken, async (req, res) => {

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN'); // เริ่ม Transaction

        // รับค่าให้ตรงกับ Schema (ต้องรับข้อมูล skill ด้วยเพราะ schema บังคับ NOT NULL)
        const { 
            fname, lname, nickname, address, phone, // ข้อมูลคน
            category_name, specialty_detail, story, skill_img // ข้อมูลทักษะ
        } = req.body;

        // 1. Insert ลงตาราง artisan ก่อน
        const insertArtisanQuery = `
            INSERT INTO artisan (fname, lname, nickname, address, phone, is_active)
            VALUES ($1, $2, $3, $4, $5, 1)
            RETURNING artisan_id, fname, lname
        `;
        const artisanRes = await client.query(insertArtisanQuery, [
            fname, lname, nickname, address, phone
        ]);
        const newArtisanId = artisanRes.rows[0].artisan_id;

        // 2. หา category_id จากชื่อ
        const catRes = await client.query(
            `SELECT category_id FROM category WHERE category_name = $1`, 
            [category_name]
        );
        
        // ถ้าไม่เจอหมวดหมู่ ให้ default เป็น 1 หรือ handle error (ในที่นี้สมมติว่าเจอแน่ๆ หรือให้เป็น null)
        const categoryId = catRes.rows.length > 0 ? catRes.rows[0].category_id : null;

        // 3. Insert ลงตาราง artisan_skill (เพื่อผูกคนกับหมวดหมู่)
        const insertSkillQuery = `
            INSERT INTO artisan_skill 
            (artisan_id, category_id, specialty_detail, story, skill_img, category_name)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(insertSkillQuery, [
            newArtisanId, 
            categoryId, 
            specialty_detail || '-', // ใส่ค่า Default กัน Error
            story || '-', 
            skill_img || 'default.jpg', 
            category_name
        ]);

        await client.query('COMMIT'); // ยืนยันข้อมูลทั้งหมด

        res.status(201).json({
            message: "เพิ่มข้อมูลปราชญ์และทักษะสำเร็จ",
            artisan: artisanRes.rows[0],
            category: category_name
        });

    } catch (error) {
        await client.query('ROLLBACK'); // ยกเลิกถ้ามี Error
        console.error("Add Artisan Error:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    } finally {
        client.release(); // คืน connection
    }
});

// DELETE: ลบข้อมูล (เปลี่ยน id เป็น artisan_id ให้ตรง schema)
router.delete('/delete/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // ใน Schema คุณตั้ง ON DELETE CASCADE ไว้ที่ artisan_skill 
        // ดังนั้นลบที่ artisan อย่างเดียว มันจะไปลบ skill ให้เองอัตโนมัติครับ
        const result = await pool.query(
            `DELETE FROM artisan WHERE artisan_id = $1`,
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลที่ต้องการลบ" });
        }

        res.json({ message: "ลบข้อมูลสำเร็จ" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

router.get('/count', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) AS total_artisans,
                COUNT(DISTINCT district) AS total_districts,
                COUNT(DISTINCT province) AS distinct_provinces,
                COUNT(DISTINCT category_id) AS total_categories,
                SUM(CASE WHEN status = 'ฉบับร่าง' THEN 1 ELSE 0 END) AS total_drafts
            FROM artisan
        `);

        res.status(200).json({
            total_artisans: parseInt(result.rows[0].total_artisans),
            total_districts: parseInt(result.rows[0].total_districts),
            distinct_provinces: parseInt(result.rows[0].distinct_provinces),
            total_categories: parseInt(result.rows[0].total_categories),
            total_drafts: parseInt(result.rows[0].total_drafts || 0) // ใส่ || 0 กันค่าเป็น null
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

router.get('/artisan/by-province', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT province, COUNT(*) AS count
      FROM artisan
      GROUP BY province
      ORDER BY count DESC
      LIMIT 5
    `)

    res.json(result.rows)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/category/list', async (req, res) => {
    try {
        const result = await pool.query(`select category_id,category_name from category`);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }  
});

router.get('/profile/:id', async (req, res) => {
    try {
        const artisan_id = req.params.id;

        const result = await pool.query(
            `SELECT 
                artisan.artisan_id,
                artisan.fname,
                artisan.lname,
                artisan.profile_img,
                artisan.district,
                artisan.province,
                artisan.biography,
                category.category_name,
                artisan_gallery.image_url
            FROM artisan
            JOIN category
                ON artisan.category_id = category.category_id
            LEFT JOIN artisan_gallery
                ON artisan_gallery.artisan_id = artisan.artisan_id
            WHERE artisan.artisan_id = $1
            ORDER BY artisan_gallery.gallery_id ASC`,
            [artisan_id]
        );

        res.status(200).json(result.rows);  // ส่งหลายแถว
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});


module.exports = router;