const express = require('express');
const { sql, poolPromise } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logActivity } = require('../utils/helpers');

const router = express.Router();

// 1. Get all system activity logs (Admin Only)
router.get('/admin/logs', auth, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const type = req.query.type || '';

    const pool = await poolPromise;
    const countRequest = pool.request();
    const listRequest = pool.request();

    let whereClause = 'WHERE 1=1';
    if (search) {
      countRequest.input('search', sql.NVarChar, `%${search}%`);
      listRequest.input('search', sql.NVarChar, `%${search}%`);
      whereClause += ' AND (username LIKE @search OR action_details LIKE @search)';
    }
    if (type) {
      countRequest.input('type', sql.NVarChar, type);
      listRequest.input('type', sql.NVarChar, type);
      whereClause += ' AND action_type = @type';
    }

    const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM SystemLogs ${whereClause}`);
    const total = countResult.recordset[0].total;

    listRequest.input('offset', sql.Int, offset);
    listRequest.input('limit', sql.Int, limit);
    const listResult = await listRequest.query(`
      SELECT id, username, role, action_type, action_details, created_at
      FROM SystemLogs
      ${whereClause}
      ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      logs: listResult.recordset,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Record custom client logs (such as exports)
router.post('/logs', auth, async (req, res) => {
  try {
    const { action_type, action_details } = req.body;
    if (!action_type || !action_details) {
      return res.status(400).json({ error: 'Missing log parameters.' });
    }
    await logActivity(req.username, req.role, action_type, action_details);
    res.json({ message: 'Log recorded.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
