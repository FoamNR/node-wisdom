const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// --- Multer Configuration (เหมือนเดิม) ---
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

// --- Helper: Delete File (เหมือนเดิม) ---
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

// --- Helper: Save Log (แก้ไขใหม่ตามโครงสร้างที่ต้องการ) ---
const saveLog = async (req, action_type, message) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // ใช้ req.originalUrl เพื่อให้ได้ Path เต็ม (เช่น /api/gallery/add)
    const currentPath = req.originalUrl || req.url; 
    const referrer = req.headers.referer || req.headers.origin || 'Direct Access';
    const userAgent = req.headers['user-agent'];

    // สร้าง Object ตามโครงสร้าง JSON เป้าหมาย
    const logData = {
      ip: ip,
      path: currentPath,
      message: message,
      referrer: referrer,
      created_at: new Date().toISOString(), // รูปแบบเวลา ISO 8601
      user_agent: userAgent,
      action_type: action_type,
      http_method: req.method,
      // เพิ่ม user_id เข้าไปใน log_data ด้วยเพื่อให้รู้ว่าใครทำ (ถ้ามี)
      user_id: req.user ? req.user.user_id : null 
    };

    // บันทึกลงฐานข้อมูล
    await pool.query(`INSERT INTO audit_log (log_data) VALUES ($1)`, [logData]);
  } catch (error) {
    console.error('Logging Error:', error);
  }
};

// --- Routes ---

// GET: ดึงแกลเลอรีทั้งหมด (เหมือนเดิม ไม่ได้ Log View เพื่อลดภาระ)
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
  const { artisan_id } = req.params;
  try {
    const { user_id } = req.user;
    const { name_gallery, caption } = req.body;

    if (!req.file) {
      // Log Failed
      await saveLog(req, 'GALLERY_ADD_FAIL', `พยายามเพิ่มรูปภาพแต่ไม่พบไฟล์ (Artisan ID: ${artisan_id})`);
      return res.status(400).json({ message: 'กรุณาอัพโหลดรูปภาพ' });
    }

    if (!name_gallery) {
      deleteFile(req.file.filename);
      // Log Failed
      await saveLog(req, 'GALLERY_ADD_FAIL', `พยายามเพิ่มรูปภาพแต่ไม่ใส่ชื่อ (Artisan ID: ${artisan_id})`);
      return res.status(400).json({ message: 'กรุณากรอกชื่อรูปภาพ' });
    }

    const image_url = `${req.protocol}://${req.get('host')}/uploads/gallery/${req.file.filename}`;

    const { rows } = await pool.query(
      'INSERT INTO artisan_gallery (artisan_id, image_url, name_gallery, caption, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [artisan_id, image_url, name_gallery, caption || null, user_id]
    );

    // Log Success
    await saveLog(req, 'GALLERY_ADD', `เพิ่มรูปภาพแกลเลอรีใหม่: ${name_gallery} (Artisan ID: ${artisan_id})`);

    res.status(201).json({ message: 'เพิ่มรูปภาพสำเร็จ', data: rows[0] });
  } catch (error) {
    if (req.file) deleteFile(req.file.filename);
    console.error('Add Gallery Error:', error);
    
    // Log Error
    await saveLog(req, 'GALLERY_ADD_ERROR', `เกิดข้อผิดพลาด: ${error.message}`);
    
    res.status(500).json({ message: 'Server Error' });
  }
});

// PUT: แก้ไขรูปภาพ
router.put('/:gallery_id', authenticateToken, upload.single('image'), async (req, res) => {
  const { gallery_id } = req.params;
  try {
    const { name_gallery, caption } = req.body;

    const { rows: oldData } = await pool.query(
      'SELECT * FROM artisan_gallery WHERE gallery_id = $1',
      [gallery_id]
    );

    if (oldData.length === 0) {
      if (req.file) deleteFile(req.file.filename);
      await saveLog(req, 'GALLERY_UPDATE_FAIL', `พยายามแก้ไขรูปภาพที่ไม่พบ (ID: ${gallery_id})`);
      return res.status(404).json({ message: 'ไม่พบรูปภาพ' });
    }

    let image_url = oldData[0].image_url;
    let fileChangedText = 'ไม่มีการเปลี่ยนไฟล์';

    if (req.file) {
      image_url = `${req.protocol}://${req.get('host')}/uploads/gallery/${req.file.filename}`;
      deleteFile(oldData[0].image_url);
      fileChangedText = 'มีการอัปโหลดไฟล์ใหม่';
    }

    const { rows } = await pool.query(
      'UPDATE artisan_gallery SET image_url = $1, name_gallery = $2, caption = $3 WHERE gallery_id = $4 RETURNING *',
      [image_url, name_gallery || oldData[0].name_gallery, caption ?? oldData[0].caption, gallery_id]
    );

    // Log Success
    await saveLog(req, 'GALLERY_UPDATE', `แก้ไขข้อมูลรูปภาพ ID: ${gallery_id} (${fileChangedText})`);

    res.json({ message: 'แก้ไขสำเร็จ', data: rows[0] });
  } catch (error) {
    if (req.file) deleteFile(req.file.filename);
    console.error('Update Gallery Error:', error);
    await saveLog(req, 'GALLERY_UPDATE_ERROR', `เกิดข้อผิดพลาดขณะแก้ไข ID: ${gallery_id} - ${error.message}`);
    res.status(500).json({ message: 'Server Error' });
  }
});

// DELETE: ลบรูปภาพ
router.delete('/:gallery_id', authenticateToken, async (req, res) => {
  const { gallery_id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT image_url, name_gallery FROM artisan_gallery WHERE gallery_id = $1',
      [gallery_id]
    );

    if (rows.length === 0) {
      await saveLog(req, 'GALLERY_DELETE_FAIL', `พยายามลบรูปภาพที่ไม่พบ (ID: ${gallery_id})`);
      return res.status(404).json({ message: 'ไม่พบรูปภาพ' });
    }

    deleteFile(rows[0].image_url);

    await pool.query('DELETE FROM artisan_gallery WHERE gallery_id = $1', [gallery_id]);

    // Log Success
    await saveLog(req, 'GALLERY_DELETE', `ลบรูปภาพชื่อ "${rows[0].name_gallery}" (ID: ${gallery_id}) สำเร็จ`);

    res.json({ message: 'ลบรูปภาพสำเร็จ', deleted_id: gallery_id });
  } catch (error) {
    console.error('Delete Gallery Error:', error);
    await saveLog(req, 'GALLERY_DELETE_ERROR', `เกิดข้อผิดพลาดขณะลบ ID: ${gallery_id} - ${error.message}`);
    res.status(500).json({ message: 'Server Error' });
  }
});

// GET Single Gallery (เหมือนเดิม)
router.get('/:gallery_id', async (req, res) => {
  try {
    const { gallery_id } = req.params;

    const { rows } = await pool.query(
      'SELECT * FROM artisan_gallery WHERE gallery_id = $1',
      [gallery_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลรูปภาพ' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Get Single Gallery Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;