const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');

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

router.post('/add', authenticateToken, async (req, res, next) => {
    try {
        const { category_name, description } = req.body;
        const { rows } = await pool.query(`insert into category (category_name, description) values ($1, $2) returning *`, [category_name, description]);
        res.json({
            message: "Category added successfully",
            category: rows[0]
        });
    } catch (error) {
        res.json({
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

router.put('/:category_id', authenticateToken, async (req, res, next) => {
    try {
        const { category_id } = req.params;
        const { category_name, description } = req.body;
        await pool.query(`update category set category_name = $1, description = $2 where category_id = $3`, [category_name, description, category_id]);
        res.json({
            message: "Category updated successfully"
        });
    } catch (error) {
        res.json({
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