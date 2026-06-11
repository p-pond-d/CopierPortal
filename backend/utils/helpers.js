const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const stream = require('stream');
const { sql, poolPromise } = require('../config/db');

const ratesPath = path.join(__dirname, '../config/rates.json');

// Helper to get rates from config file
function getRates() {
  try {
    if (fs.existsSync(ratesPath)) {
      const data = fs.readFileSync(ratesPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading rates.json:', err);
  }
  return {
    print_bw: 0.50,
    print_color: 1.00,
    copy_bw: 0.50,
    copy_color: 1.00,
    scan: 0.00
  };
}

// Helper to save rates to config file
function saveRates(rates) {
  fs.writeFileSync(ratesPath, JSON.stringify(rates, null, 2), 'utf8');
}

// Helper function to clean integer values
function cleanInt(val) {
  if (val === '-' || val === '' || val === null || val === undefined) {
    return 0;
  }
  const s = String(val).replace(/[\[\]"'\s]/g, '');
  const parsed = parseInt(s, 10);
  return isNaN(parsed) ? 0 : parsed;
}

// Helper function to clean string values
function cleanStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/[\[\]"'\s]/g, '');
}

// Parse CSV buffer to JSON array
function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const readable = new stream.Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);

    readable
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

// Parse Excel buffer to JSON array
function parseExcel(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(worksheet);
}

function maskUserId(uid) {
  const s = cleanStr(uid);
  if (s.length <= 2) return '**';
  return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1];
}

function maskName(name) {
  const s = cleanStr(name);
  if (s.length <= 2) return '**';
  return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1];
}

// Obfuscate database IDs for users to prevent leaking raw user IDs in frontend inspect tools
function encodeId(rawId) {
  return Buffer.from(String(rawId)).toString('base64');
}

function decodeId(encodedId) {
  try {
    return Buffer.from(encodedId, 'base64').toString('utf8');
  } catch (err) {
    return encodedId;
  }
}

// Helper to write to SystemLogs
async function logActivity(username, role, actionType, actionDetails) {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('username', sql.NVarChar, username)
      .input('role', sql.NVarChar, role)
      .input('action_type', sql.NVarChar, actionType)
      .input('action_details', sql.NVarChar, actionDetails)
      .query(`
        INSERT INTO SystemLogs (username, role, action_type, action_details)
        VALUES (@username, @role, @action_type, @action_details)
      `);
    console.log(`Log: ${actionType} by ${username}`);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

async function rebuildMonthlySummaries(pool) {
  const conn = typeof pool.connect === 'function' ? await pool.connect() : pool;
  try {
    await conn.query('BEGIN');
    await conn.query('DELETE FROM MonthlySummaries');
    await conn.query(`
      INSERT INTO MonthlySummaries (year, month, total_users, print_bw, print_color, copy_bw, copy_color, scanner, total_pages, total_cost)
      SELECT 
        EXTRACT(YEAR FROM r.report_date)::int as year,
        EXTRACT(MONTH FROM r.report_date)::int as month,
        COUNT(DISTINCT ud.user_id) as total_users,
        SUM(COALESCE(ud.print_bw, 0))::int as print_bw,
        SUM(COALESCE(ud.print_color, 0))::int as print_color,
        SUM(COALESCE(ud.copy_bw, 0))::int as copy_bw,
        SUM(COALESCE(ud.copy_color, 0))::int as copy_color,
        SUM(COALESCE(ud.scanner, 0))::int as scanner,
        SUM(COALESCE(ud.total_pages, 0))::int as total_pages,
        SUM(COALESCE(ud.cost, 0.00)) as total_cost
      FROM Reports r
      LEFT JOIN UsageDetails ud ON r.id = ud.report_id
      GROUP BY EXTRACT(YEAR FROM r.report_date), EXTRACT(MONTH FROM r.report_date)
    `);
    await conn.query('COMMIT');
    console.log('MonthlySummaries database cache rebuilt successfully.');
  } catch (err) {
    if (conn.query) {
      await conn.query('ROLLBACK');
    }
    console.error('Error rebuilding MonthlySummaries:', err);
  } finally {
    if (typeof pool.connect === 'function' && conn.release) {
      conn.release();
    }
  }
}

module.exports = {
  getRates,
  saveRates,
  cleanInt,
  cleanStr,
  parseCSV,
  parseExcel,
  maskUserId,
  maskName,
  encodeId,
  decodeId,
  logActivity,
  rebuildMonthlySummaries
};
