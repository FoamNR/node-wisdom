const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/artisan', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                artisan.fname AS artisan_fname,
                artisan.lname AS artisan_lname,
                users.fname AS user_fname,
                users.lname AS user_lname,
                CASE
                    WHEN NOW() - artisan.created_at < INTERVAL '1 minute'
                        THEN 'เมื่อสักครู่'
                    WHEN NOW() - artisan.created_at < INTERVAL '1 hour'
                        THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - artisan.created_at)) / 60) || ' นาทีที่แล้ว'
                    WHEN NOW() - artisan.created_at < INTERVAL '1 day'
                        THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - artisan.created_at)) / 3600) || ' ชั่วโมงที่แล้ว'
                    ELSE
                        FLOOR(EXTRACT(EPOCH FROM (NOW() - artisan.created_at)) / 86400) || ' วันที่แล้ว'
                END AS created_at
            FROM artisan
            JOIN users ON artisan.created_by = users.user_id
            ORDER BY artisan.created_at DESC
            LIMIT 1
        `);

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});


router.get('/category', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                category.category_name,
                users.fname AS user_fname,
                users.lname AS user_lname,
                CASE
                    WHEN NOW() - category.updated_at < INTERVAL '1 minute'
                        THEN 'เมื่อสักครู่'
                    WHEN NOW() - category.updated_at < INTERVAL '1 hour'
                        THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - category.updated_at)) / 60) || ' นาทีที่แล้ว'
                    WHEN NOW() - category.updated_at < INTERVAL '1 day'
                        THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - category.updated_at)) / 3600) || ' ชั่วโมงที่แล้ว'
                    ELSE
                        FLOOR(EXTRACT(EPOCH FROM (NOW() - category.updated_at)) / 86400) || ' วันที่แล้ว'
                END AS updated_at
            FROM category
            JOIN users ON category.updated_by = users.user_id
            ORDER BY category.updated_at DESC
            LIMIT 1
        `);

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});


module.exports = router;