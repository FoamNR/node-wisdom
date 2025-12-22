const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');

// Helper function สำหรับดึง IP
const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
};

// 1. Log สำหรับการเข้าชมทั่วไป (web_page_visit)
router.post('/log-visit', async (req, res) => {
    try {
        const { path, method } = req.body;
        const logData = {
            ip: getClientIp(req),
            user_agent: req.headers['user-agent'],
            path: path,
            method: method || 'GET',
            referrer: req.headers.referer || null,
            lang: req.headers['accept-language']
        };

        await pool.query(
            'INSERT INTO web_page_visit (log_data, visit_time) VALUES ($1, NOW())',
            [logData]
        );

        res.status(204).send(); 
    } catch (error) {
        console.error('Visit Log error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/log-admin-action', async (req, res) => {
  try {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.socket.remoteAddress;

    const { path, action, errorMessage } = req.body;

    const logData = {
      ip,
      user_agent: req.headers['user-agent'],
      path,
      action_type: action ? action.toUpperCase() : 'UNKNOWN',
      http_method: req.method, // ✅ HTTP Method จริง
      message: errorMessage,
      referrer: req.headers.referer || null,
      created_at: new Date()
    };

    await pool.query(
      `INSERT INTO audit_log (log_data) VALUES ($1)`,
      [logData]
    );

    res.sendStatus(204);
  } catch (error) {
    console.error('Log error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.get('/logs', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100');
        res.json(result.rows);
    } catch (error) {
        console.error('Fetch logs error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });   
    }
});

router.get('/visit-logs', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM web_page_visit ORDER BY visit_time DESC LIMIT 100');
        res.json(result.rows);
    } catch (error) {
        console.error('Fetch visit logs error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
        
    }
});

const convertToCSV = (objArray) => {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    if (array.length === 0) return '';

    // ดึง Header จาก Key ของ Object ตัวแรก
    let str = Object.keys(array[0]).join(',') + '\r\n';

    for (let i = 0; i < array.length; i++) {
        let line = '';
        for (let index in array[i]) {
            if (line !== '') line += ',';

            // จัดการกรณีข้อมูลมีเครื่องหมาย , หรือ " ให้ครอบด้วย ""
            let item = array[i][index];
            if (typeof item === 'string') {
                item = item.replace(/"/g, '""'); // Escape double quotes
                if (item.search(/("|,|\n)/g) >= 0) item = '"' + item + '"';
            }
            line += item;
        }
        str += line + '\r\n';
    }
    return str;
};

// ... routes เดิมของคุณ (log-visit, log-admin-action) ...

// 3. Export Web Visit Logs เป็นไฟล์ CSV
router.get('/export-visit-logs', authenticateToken, async (req, res) => {
    try {
        // ดึงข้อมูลทั้งหมด (หรือจะใส่ Limit ก็ได้ตามต้องการ)
        const result = await pool.query('SELECT * FROM web_page_visit ORDER BY visit_time DESC');
        
        // จัดรูปแบบข้อมูลใหม่ ให้แบนราบ (Flatten) เพื่อลงตารางง่ายๆ
        const data = result.rows.map(row => {
            // สมมติว่า row.log_data เป็น JSON Object ที่ db return มาให้แล้ว
            const log = row.log_data || {}; 
            return {
                visit_time: row.visit_time ? new Date(row.visit_time).toLocaleString('th-TH') : '',
                ip: log.ip || '',
                path: log.path || '',
                method: log.method || '',
                user_agent: log.user_agent || '',
                referrer: log.referrer || '',
                lang: log.lang || ''
            };
        });

        const csvString = convertToCSV(data);

        // Set Headers เพื่อบอก Browser ว่านี่คือไฟล์ดาวน์โหลด
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        // เพิ่ม BOM (\uFEFF) เพื่อให้ Excel อ่านภาษาไทยออก
        res.setHeader('Content-Disposition', 'attachment; filename="visit_logs.csv"');
        
        res.status(200).send('\uFEFF' + csvString);

    } catch (error) {
        console.error('Export Visit Logs error:', error.message);
        res.status(500).send('Error exporting logs');
    }
});

router.get('/export-audit-logs', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM audit_log ORDER BY created_at DESC'
    );

    const data = result.rows.map(row => {
      const log = row.log_data || {};

      const timeStr = log.created_at || row.created_at;

      return {
        timestamp: timeStr
          ? new Date(timeStr).toLocaleString('th-TH')
          : '',
        action_type: log.action_type || '',
        path: log.path || '',
        http_method: log.http_method || '',
        ip: log.ip || '',
        user_agent: log.user_agent || '',
        message: log.message || '' 
      };
    });

    const csvString = convertToCSV(data);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="admin_audit_logs.csv"'
    );
    res.status(200).send('\uFEFF' + csvString);
  } catch (error) {
    console.error('Export Audit Logs error:', error.message);
    res.status(500).send('Error exporting logs');
  }
});


module.exports = router;