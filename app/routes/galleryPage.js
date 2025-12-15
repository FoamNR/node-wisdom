const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon'); 

router.get('/', async (req, res) => {
    try {
        // 1. รับค่า search จาก URL parameter (เช่น /galleryPage?search=abc)
        const { search } = req.query;

        let queryText = 'SELECT * FROM artisan_gallery';
        let queryParams = [];
        if (search) {
            queryText += ' WHERE name_gallery ILIKE $1 OR caption ILIKE $1';
            queryParams.push(`%${search}%`);
        }
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