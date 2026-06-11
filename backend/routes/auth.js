const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
const { logActivity } = require('../utils/helpers');

const router = express.Router();

// Login Route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน' });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT username, password, role FROM Users WHERE username = @username');

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        await logActivity(user.username, user.role, 'LOGIN', 'เข้าสู่ระบบสำเร็จ');
        return res.json({
          token: token,
          role: user.role,
          username: user.username
        });
      }
    }
    
    await logActivity(username, 'unknown', 'LOGIN_FAILED', `พยายามเข้าสู่ระบบด้วยชื่อผู้ใช้งาน '${username}' แต่รหัสผ่านไม่ถูกต้อง`);
    return res.status(401).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
  } catch (err) {
    console.error('Login database error:', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล' });
  }
});

module.exports = router;
