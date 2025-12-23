const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                ag.gallery_id,
                ag.image_url,
                ag.name_gallery,
                ag.caption,
                a.fname AS artisan_fname,
                a.lname AS artisan_lname,
                u.fname AS user_fname,
                u.lname AS user_lname
            FROM artisan_gallery ag
            JOIN artisan a 
                ON a.artisan_id = ag.artisan_id
            LEFT JOIN users u 
                ON u.user_id = ag.user_id
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching artisan gallery:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name_gallery, caption, image_url } = req.body;
        await pool.query('UPDATE artisan_gallery SET name_gallery = $1, caption = $2, image_url = $3 WHERE gallery_id = $4', [name_gallery, caption, image_url, id]);
        res.sendStatus(204);
    } catch (error) {
        console.error('Error updating gallery admin data:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM artisan_gallery WHERE gallery_id = $1', [id]);
        res.sendStatus(204);
    } catch (error) {
        console.error('Error deleting gallery admin data:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;