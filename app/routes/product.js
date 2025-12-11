const express = require('express');
const router = express.Router();
const pool = require('../config/dbcon');
const authenticateToken = require('../middleware/authMiddleware');

// --- 1. GET: ดึงสินค้าทั้งหมด (ของเดิม) ---
router.get('/products', async (req, res) => {
    try {
        const { search } = req.query; // รับค่า search จาก URL (เช่น ?search=ตะกร้า)

        let query = `
            SELECT 
                product.*, 
                artisan.fname, 
                artisan.lname 
            FROM product
            JOIN artisan ON product.artisan_id = artisan.artisan_id
        `;
        
        let params = [];

        if (search) {
            query += ` 
                WHERE product.product_name ILIKE $1 
                OR product.description ILIKE $1
                OR artisan.fname ILIKE $1
                OR artisan.lname ILIKE $1
            `;
            params.push(`%${search}%`); 
        }

        query += ` ORDER BY product.product_id DESC`;

        const { rows } = await pool.query(query, params);
        res.status(200).json(rows);

    } catch (error) {
        console.error("Search Product Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// --- 2. GET: ดึงหมวดหมู่ (ของเดิม) ---
router.get('/category', async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM category ORDER BY category_id ASC");
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// --- 3. POST: เพิ่มสินค้าใหม่ (ADD) ---
router.post('/product/add', authenticateToken, async (req, res) => {
    try {
        const { artisan_id, product_name, price_range, description, product_img } = req.body;

        // ตรวจสอบว่ามีข้อมูลครบไหม
        if (!artisan_id || !product_name || !price_range) {
            return res.status(400).json({ message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
        }

        const query = `
            INSERT INTO product (artisan_id, product_name, price_range, description, product_img)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const { rows } = await pool.query(query, [
            artisan_id, 
            product_name, 
            price_range, 
            description || '',  
            product_img || 'default_product.jpg' // ถ้าไม่มีรูปให้ใส่รูป default
        ]);

        res.status(201).json({
            message: "เพิ่มสินค้าสำเร็จ",
            product: rows[0]
        });

    } catch (error) {
        console.error("Add Product Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// --- 4. DELETE: ลบสินค้า (DELETE) ---
router.delete('/product/delete/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM product WHERE product_id = $1",
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบสินค้าที่ต้องการลบ" });
        }

        res.json({ message: "ลบสินค้าสำเร็จ" });

    } catch (error) {
        console.error("Delete Product Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

router.get('/category' , async (req, res) => {
    try {
        const result =  await pool.query("SELECT category_id, category_name FROM category");
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});
module.exports = router;