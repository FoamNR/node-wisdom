const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');

router.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.q || ''; 
        
        const sql = `
            SELECT 
                artisan.artisan_id, 
                artisan.fname, 
                artisan.lname, 
                category.category_name,
                artisan_gallery.gallery_id,
                artisan_gallery.name_gallery,
                artisan_gallery.image_url
            FROM artisan
            JOIN category ON artisan.category_id = category.category_id
            LEFT JOIN artisan_gallery ON artisan.artisan_id = artisan_gallery.artisan_id
            WHERE 
                artisan.fname ILIKE $1 OR 
                artisan.lname ILIKE $1 OR 
                category.category_name ILIKE $1 OR
                artisan_gallery.name_gallery ILIKE $1
        `;

        const values = [`%${searchQuery}%`];

        const result = await pool.query(sql, values);
        
        res.status(200).json(result.rows);
        
    } catch (error) {
        console.error("Search Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
})

module.exports = router;