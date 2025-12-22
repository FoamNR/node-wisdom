const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config(); // โหลดค่าจาก .env

const authRoutes = require("./app/routes/auth");
const productRoutes = require("./app/routes/product");
const artisanRoutes = require("./app/routes/artisan");
const adminRoutes = require("./app/routes/admin");
const galleryRoutes = require("./app/routes/gallery");
const categoryRoutes = require("./app/routes/category");
const galleryPageRoutes = require("./app/routes/galleryPage")
const activityRoutes = require("./app/routes/activity");
const searchRoutes = require("./app/routes/search");
const logRoutes = require("./app/routes/log");

const app = express();

// --- Middleware ---
app.use(cors({
  origin: function (origin, callback) {
    // อนุญาตให้ผ่านหมด ถ้าไม่มี origin (เช่น server-to-server) หรือเป็นช่วง Dev
    // คำเตือน: ใน Production ควรระบุ domain จริงๆ แทน
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json()); // จำเป็นมาก เพื่อให้อ่าน body json ได้
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Serve Static Files (Uploads) ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/gallery', express.static(path.join(__dirname, 'uploads/gallery')));
app.use('/uploads/profile', express.static(path.join(__dirname, 'uploads/profile')));

// --- Mount Routes ---
app.use('/auth', authRoutes);
app.use('/product', productRoutes);
app.use('/artisan', artisanRoutes);
app.use('/admin', adminRoutes);
app.use('/gallery', galleryRoutes);
app.use('/category', categoryRoutes);
app.use('/galleryPage', galleryPageRoutes);
app.use('/activity', activityRoutes);
app.use('/search', searchRoutes);
app.use('/log', logRoutes);

// --- Error Handling ---
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Server Error'
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;