const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon'); 

router.get('/', async (req, res) => {
    try {
        const { search } = req.query;

        // 1. เริ่มต้น Query ด้วยการ JOIN ตาราง artisan
        // เพื่อให้เข้าถึง column 'status' ของ artisan ได้
        let queryText = `
            SELECT artisan_gallery.* FROM artisan_gallery
            JOIN artisan ON artisan_gallery.artisan_id = artisan.artisan_id
            WHERE artisan.status = 'เผยแพร่'
        `;

        let queryParams = [];

        // 2. ถ้ามีการค้นหา (Search) ให้เพิ่มเงื่อนไข AND เข้าไป
        if (search) {
            // ใช้ AND (...) เพื่อให้เงื่อนไข status ยังคงเป็นจริงเสมอ
            queryText += ' AND (artisan_gallery.name_gallery ILIKE $1 OR artisan_gallery.caption ILIKE $1)';
            queryParams.push(`%${search}%`);
        }

        // 3. (Optional) อาจจะเรียงลำดับข้อมูล เช่น ใหม่สุดขึ้นก่อน
        queryText += ' ORDER BY artisan_gallery.gallery_id DESC';

        const result = await pool.query(queryText, queryParams);
        res.json(result.rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT 
                artisan_gallery.gallery_id,
                artisan_gallery.name_gallery,
                artisan_gallery.caption,
                artisan_gallery.image_url,
                artisan.artisan_id,
                artisan.fname,
                artisan.lname,
                artisan.profile_img,
                category.category_name
            FROM artisan_gallery
            JOIN artisan ON artisan_gallery.artisan_id = artisan.artisan_id
            JOIN category ON artisan.category_id = category.category_id
            WHERE artisan_gallery.gallery_id = $1;
        `, [id]);       
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Gallery not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;