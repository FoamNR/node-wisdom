const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.cookies.access_token || 
                  (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) {
        return res.status(401).json({ message: "ไม่มีสิทธิ์เข้าถึง (Token required)" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            res.clearCookie('token'); 
            return res.status(403).json({ message: "Token ไม่ถูกต้อง หรือ หมดอายุ" });
        }
        req.user = user;
        next();
    });
};

module.exports = authenticateToken;