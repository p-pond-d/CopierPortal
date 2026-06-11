const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, poolPromise } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { 
  encodeId, 
  decodeId, 
  maskName, 
  logActivity 
} = require('../utils/helpers');

const router = express.Router();

// 1. Get user-specific details (Masked for general users, with optional printer filter)
router.get('/users', auth, async (req, res) => {
  try {
    const printer = req.query.printer || '';
    const pool = await poolPromise;
    const request = pool.request();
    let query = '';

    if (printer) {
      request.input('printer', sql.NVarChar, printer);
      query = `
        SELECT DISTINCT ud.user_id, ud.name 
        FROM UsageDetails ud
        JOIN Reports r ON ud.report_id = r.id
        WHERE r.printer_name = @printer
        ORDER BY ud.name ASC
      `;
    } else {
      query = `
        SELECT DISTINCT user_id, name 
        FROM UsageDetails 
        ORDER BY name ASC
      `;
    }

    const result = await request.query(query);
    
    let records = result.recordset;
    if (req.role === 'user') {
      records = records.map(r => ({
        user_id: encodeId(r.user_id),
        name: maskName(r.name)
      }));
    }
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Get summary for a specific user across time
router.get('/users/:user_id/summary', auth, async (req, res) => {
  try {
    let userId = req.params.user_id;
    if (req.role === 'user') {
      userId = decodeId(userId);
    }
    const printer = req.query.printer || '';

    const pool = await poolPromise;
    const request = pool.request();
    request.input('user_id', sql.NVarChar, userId);

    let query = `
      SELECT 
        r.report_date,
        r.filename,
        r.printer_name,
        ud.print_bw,
        ud.print_color,
        ud.copy_bw,
        ud.copy_color,
        ud.scanner,
        ud.total_pages,
        ud.cost
      FROM UsageDetails ud
      JOIN Reports r ON ud.report_id = r.id
      WHERE ud.user_id = @user_id
    `;

    if (printer) {
      request.input('printer', sql.NVarChar, printer);
      query += ` AND r.printer_name = @printer`;
    }

    query += ` ORDER BY r.report_date DESC`;

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    try {
      const fs = require('fs');
      const path = require('path');
      fs.writeFileSync(path.join(__dirname, '../users_query_error.txt'), err.message + '\n' + err.stack);
    } catch (fsErr) {
      console.error('Failed to write query error log:', fsErr);
    }
    res.status(500).json({ error: err.message });
  }
});

// 3. Get all users (Admin Only)
router.get('/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT id, username, password, role, created_at FROM Users ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Create a new user (Admin Only)
router.post('/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    
    const pool = await poolPromise;
    
    const checkUser = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT id FROM Users WHERE username = @username');
      
    if (checkUser.recordset.length > 0) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.request()
      .input('username', sql.NVarChar, username)
      .input('password', sql.NVarChar, hashedPassword)
      .input('role', sql.NVarChar, role)
      .query('INSERT INTO Users (username, password, role) VALUES (@username, @password, @role)');

    await logActivity(req.username, req.role, 'CREATE_USER', `สร้างบัญชีผู้ใช้งานใหม่: '${username}' บทบาท: '${role}'`);
    res.status(201).json({ message: 'สร้างบัญชีผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Update a user (Admin Only)
router.put('/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const pool = await poolPromise;

    const checkUser = await pool.request()
      .input('id', sql.Int, userId)
      .input('username', sql.NVarChar, username)
      .query('SELECT id FROM Users WHERE username = @username AND id <> @id');

    if (checkUser.recordset.length > 0) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้มีผู้อื่นใช้งานแล้ว' });
    }

    const getCurrentUser = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT username FROM Users WHERE id = @id');

    if (getCurrentUser.recordset.length > 0 && getCurrentUser.recordset[0].username === 'admin' && username !== 'admin') {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนชื่อบัญชีผู้ใช้งานระบบเริ่มต้น (admin) ได้' });
    }

    let hashedPassword = password;
    const isBcryptHash = password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$');
    if (!isBcryptHash) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    await pool.request()
      .input('id', sql.Int, userId)
      .input('username', sql.NVarChar, username)
      .input('password', sql.NVarChar, hashedPassword)
      .input('role', sql.NVarChar, role)
      .query('UPDATE Users SET username = @username, password = @password, role = @role WHERE id = @id');

    await logActivity(req.username, req.role, 'UPDATE_USER', `แก้ไขข้อมูลบัญชีผู้ใช้งาน: '${username}' บทบาท: '${role}' (ID: ${userId})`);
    res.json({ message: 'แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Delete a user (Admin Only)
router.delete('/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const pool = await poolPromise;

    const getUsername = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT username FROM Users WHERE id = @id');

    let targetUsername = 'Unknown';
    if (getUsername.recordset.length > 0) {
      targetUsername = getUsername.recordset[0].username;
      if (targetUsername === 'admin') {
        return res.status(400).json({ error: 'ไม่สามารถลบบัญชีผู้ใช้งานระบบเริ่มต้น (admin) ได้' });
      }
    }

    await pool.request()
      .input('id', sql.Int, userId)
      .query('DELETE FROM Users WHERE id = @id');

    await logActivity(req.username, req.role, 'DELETE_USER', `ลบบัญชีผู้ใช้งาน: '${targetUsername}' (ID: ${userId})`);
    res.json({ message: 'ลบบัญชีผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
