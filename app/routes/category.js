const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/home', async (req, res, next) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                category.category_id,
                category.category_name,
                COUNT(DISTINCT artisan_gallery.gallery_id) AS image_count,
                MIN(artisan_gallery.image_url) AS image_url
            FROM category
            LEFT JOIN artisan 
                ON artisan.category_id = category.category_id
            LEFT JOIN artisan_gallery
                ON artisan_gallery.artisan_id = artisan.artisan_id
            GROUP BY 
                category.category_id,
                category.category_name
            ORDER BY 
                category.category_id
                LIMIT 4;`);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                category.category_id,
                category.category_name,
                category.description,
                COUNT(artisan.artisan_id) AS artisan_count
            FROM category
            LEFT JOIN artisan 
                ON artisan.category_id = category.category_id
            GROUP BY 
                category.category_id,
                category.category_name,
                category.description
            ORDER BY category.category_id;
        `);

        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.post('/add', authenticateToken, async (req, res) => {
    try {
        const { category_name, description } = req.body;
        const created_by = req.user.user_id; // มาจาก token

        const { rows } = await pool.query(
            `
            INSERT INTO category (
                category_name,
                description,
                created_by,
                created_at
            )
            VALUES ($1, $2, $3, NOW())
            RETURNING *
            `,
            [category_name, description, created_by]
        );

        res.status(201).json({
            message: "Category added successfully",
            category: rows[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error adding category",
            error: error.message
        });
    }
});



router.get('/:category_id', authenticateToken, async (req, res, next) => {
    try {
        const { category_id } = req.params;
        const { rows } = await pool.query(`select * from category where category_id = $1`, [category_id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
});

router.put('/:category_id', authenticateToken, async (req, res) => {
    try {
        const { category_id } = req.params;
        const updated_by = req.user.user_id; // มาจาก token
        const { category_name, description } = req.body;

        await pool.query(
            `UPDATE category 
             SET category_name = $1,
                 description = $2,
                 updated_by = $3,
                 updated_at = NOW()
             WHERE category_id = $4`,
            [category_name, description, updated_by, category_id]
        );

        res.json({
            message: "Category updated successfully"
        });
    } catch (error) {
        res.status(500).json({
            message: "Error updating category",
            error: error.message
        });
    }
});


router.delete('/:category_id', authenticateToken, async (req, res, next) => {
    try {
        const { category_id } = req.params;
        await pool.query(`DELETE FROM category WHERE category_id = $1`, [category_id]);
        res.json({ message: "Category deleted successfully" });
    } catch (error) {
        res.json({
            message: "Error deleting category",
            error: error.message
        });
    }
});


module.exports = router;