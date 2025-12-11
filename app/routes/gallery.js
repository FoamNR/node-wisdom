const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/gallery');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `gallery-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const valid = allowed.test(path.extname(file.originalname).toLowerCase()) && 
                  allowed.test(file.mimetype);
    valid ? cb(null, true) : cb(new Error('รองรับเฉพาะไฟล์รูปภาพ'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Helper: Delete File
const deleteFile = (filePath) => {
  if (!filePath) return;
  
  try {
    const filename = filePath.includes('://') 
      ? path.basename(new URL(filePath).pathname)
      : path.basename(filePath);

    const locations = [
      path.join(__dirname, '../../uploads', filename),
      path.join(__dirname, '../../uploads/gallery', filename)
    ];

    for (const fullPath of locations) {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return;
      }
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

// GET: ดึงแกลเลอรีทั้งหมด
router.get('/artisan/:artisan_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM artisan_gallery WHERE artisan_id = $1 ORDER BY gallery_id',
      [req.params.artisan_id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Get Gallery Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// POST: เพิ่มรูปภาพ
router.post('/:artisan_id/add', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { artisan_id } = req.params;
    const { name_gallery, caption } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาอัพโหลดรูปภาพ' });
    }

    if (!name_gallery) {
      deleteFile(req.file.filename);
      return res.status(400).json({ message: 'กรุณากรอกชื่อรูปภาพ' });
    }

    const image_url = `${req.protocol}://${req.get('host')}/uploads/gallery/${req.file.filename}`;

    const { rows } = await pool.query(
      'INSERT INTO artisan_gallery (artisan_id, image_url, name_gallery, caption) VALUES ($1, $2, $3, $4) RETURNING *',
      [artisan_id, image_url, name_gallery, caption || null]
    );

    res.status(201).json({ message: 'เพิ่มรูปภาพสำเร็จ', data: rows[0] });
  } catch (error) {
    if (req.file) deleteFile(req.file.filename);
    console.error('Add Gallery Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// PUT: แก้ไขรูปภาพ
router.put('/:gallery_id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { gallery_id } = req.params;
    const { name_gallery, caption } = req.body;

    const { rows: oldData } = await pool.query(
      'SELECT * FROM artisan_gallery WHERE gallery_id = $1',
      [gallery_id]
    );

    if (oldData.length === 0) {
      if (req.file) deleteFile(req.file.filename);
      return res.status(404).json({ message: 'ไม่พบรูปภาพ' });
    }

    let image_url = oldData[0].image_url;

    if (req.file) {
      image_url = `${req.protocol}://${req.get('host')}/uploads/gallery/${req.file.filename}`;
      deleteFile(oldData[0].image_url);
    }

    const { rows } = await pool.query(
      'UPDATE artisan_gallery SET image_url = $1, name_gallery = $2, caption = $3 WHERE gallery_id = $4 RETURNING *',
      [image_url, name_gallery || oldData[0].name_gallery, caption ?? oldData[0].caption, gallery_id]
    );

    res.json({ message: 'แก้ไขสำเร็จ', data: rows[0] });
  } catch (error) {
    if (req.file) deleteFile(req.file.filename);
    console.error('Update Gallery Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// DELETE: ลบรูปภาพ
router.delete('/:gallery_id', authenticateToken, async (req, res) => {
  try {
    const { gallery_id } = req.params;

    const { rows } = await pool.query(
      'SELECT image_url FROM artisan_gallery WHERE gallery_id = $1',
      [gallery_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรูปภาพ' });
    }

    deleteFile(rows[0].image_url);

    await pool.query('DELETE FROM artisan_gallery WHERE gallery_id = $1', [gallery_id]);

    res.json({ message: 'ลบรูปภาพสำเร็จ', deleted_id: gallery_id });
  } catch (error) {
    console.error('Delete Gallery Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;