const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
    // 1. ลองอ่านจาก Cookie ก่อน (ชื่อ 'token')
    // 2. ถ้าไม่มีใน Cookie ให้ลองไปดูใน Header (เผื่อใช้กับ Postman หรือ Mobile App)
    const token = req.cookies.token || 
                  (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) {
        return res.status(401).json({ message: "ไม่มีสิทธิ์เข้าถึง (Token required)" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // ถ้า Token ผิดหรือหมดอายุ ให้แจ้งกลับและอาจจะสั่งลบ Cookie ทิ้งด้วยก็ได้
            res.clearCookie('token'); 
            return res.status(403).json({ message: "Token ไม่ถูกต้อง หรือ หมดอายุ" });
        }
        req.user = user;
        next();
    });
};

module.exports = authenticateToken;