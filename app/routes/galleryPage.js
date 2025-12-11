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

module.exports = router;