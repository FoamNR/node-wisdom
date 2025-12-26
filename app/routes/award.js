const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // เรียกใช้ multer

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/award/';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'award-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพหรือ PDF เท่านั้น'), false);
    }
};

const upload = multer({ 
    storage: storage, 
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/add-award/:artisan_id', authenticateToken, upload.single('file_url'), async (req, res) => {
    try {
        const { award_title, received_date } = req.body;
        const artisan_id = req.params.artisan_id;
        const file_url = req.file ? `/uploads/award/${req.file.filename}` : null;
        const result = await pool.query(
            `INSERT INTO artisan_award
             (artisan_id, award_title, file_url, received_date)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [artisan_id, award_title, file_url, received_date]
        );

        res.status(201).json({
            message: 'Award added successfully',
            award: result.rows[0]
        });
    } catch (error) {
        console.error('Error adding award:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.put('/edit-award/:award_id', authenticateToken, upload.single('file_url'), async (req, res) => {
    try {
        const award_id = req.params.award_id;
        const { award_title, received_date } = req.body;
        let file_url;
        if (req.file) {
            file_url = `/uploads/award/${req.file.filename}`;
        } else {
            file_url = req.body.file_url; 
        }
        let query, params;
        if (req.file) {
            query = `UPDATE artisan_award
                     SET award_title = $1, file_url = $2, received_date = $3
                     WHERE award_id = $4
                     RETURNING *`;
            params = [award_title, file_url, received_date, award_id];
        } else {
            // กรณีไม่มีไฟล์ใหม่ (อัปเดตแค่ข้อความ)
            query = `UPDATE artisan_award
                     SET award_title = $1, received_date = $2
                     WHERE award_id = $3
                     RETURNING *`;
            params = [award_title, received_date, award_id];
        }

        const result = await pool.query(query, params);
        
        res.json({
            message: 'Award updated successfully',
            award: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating award:', error);
        res.status(500).json({ message: 'Internal server error' });
    } 
});

router.get('/get-all-award/:artisan_id', authenticateToken, async (req, res) => {
    try {
        const artisan_id = req.params.artisan_id;
        const result = await pool.query(
            'SELECT * FROM artisan_award WHERE artisan_id = $1',
            [artisan_id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching awards:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/get-award/:award_id', authenticateToken, async (req, res) => {
    try {
        const award_id = req.params.award_id;
        const result = await pool.query(
            'SELECT * FROM artisan_award WHERE award_id = $1',
            [award_id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching award:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/delete-award/:award_id', authenticateToken, async (req, res) => {
    try {
        const award_id = req.params.award_id;

        const oldFile = await pool.query('SELECT file_url FROM artisan_award WHERE award_id = $1', [award_id]);

        if (oldFile.rows.length > 0 && oldFile.rows[0].file_url) {
            const filePath = path.join(__dirname, '../../', oldFile.rows[0].file_url);
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await pool.query(
            'DELETE FROM artisan_award WHERE award_id = $1',
            [award_id]
        );
        res.json({ message: 'Award deleted successfully' });
    } catch (error) {
        console.error('Error deleting award:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/get-award-page/:artisan_id', async (req, res) => {
    try {
        const artisan_id = req.params.artisan_id;
        const result = await pool.query(
            'SELECT * FROM artisan_award WHERE artisan_id = $1',
            [artisan_id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching awards for page:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = router;