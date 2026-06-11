const express = require('express');
const multer = require('multer');
const { sql, poolPromise } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { 
  cleanInt, 
  cleanStr, 
  parseCSV, 
  parseExcel, 
  getRates, 
  logActivity, 
  rebuildMonthlySummaries 
} = require('../utils/helpers');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// 1. Upload CSV or Excel file and import data (Admin Only)
router.post('/upload', auth, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { buffer, originalname } = req.file;
    const reportDateStr = req.body.report_date; // Expected format: 'YYYY-MM-DD'
    if (!reportDateStr) {
      return res.status(400).json({ error: 'Please specify the report period date.' });
    }

    const reportDate = new Date(reportDateStr);
    if (isNaN(reportDate.getTime())) {
      return res.status(400).json({ error: 'Invalid report date format.' });
    }

    let rawRows = [];
    const ext = originalname.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      rawRows = await parseCSV(buffer);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rawRows = parseExcel(buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Please upload CSV or Excel.' });
    }

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file is empty.' });
    }

    // Validate required headers and match them using flexible fuzzy matching
    const userKey = Object.keys(rawRows[0]).find(h => {
      const hl = h.trim().toLowerCase();
      return hl === 'user' || hl === 'userid' || hl === 'user id' || hl === 'id' || hl.includes('user');
    });

    const nameKey = Object.keys(rawRows[0]).find(h => {
      const hl = h.trim().toLowerCase();
      return hl === 'name' || hl === 'fullname' || hl === 'full name' || hl.includes('name');
    });

    if (!userKey || !nameKey) {
      const missing = [];
      if (!userKey) missing.push('User (รหัสผู้ใช้)');
      if (!nameKey) missing.push('Name (ชื่อ)');
      return res.status(400).json({
        error: `ไฟล์รายงานไม่ถูกต้อง ขาดคอลัมน์สำคัญ: ${missing.join(', ')}`
      });
    }

    // Match Printer page count columns (with generic print fallbacks, ignoring copier)
    const pbKey = Object.keys(rawRows[0]).find(h => {
      const hl = h.trim().toLowerCase();
      return hl.includes('printer') && (hl.includes('black') || hl.includes('b&w') || hl.includes('b/w') || hl.includes('bw') || hl.includes('w/b'));
    });

    let pbKeyFinal = pbKey;
    if (!pbKeyFinal) {
      pbKeyFinal = Object.keys(rawRows[0]).find(h => {
        const hl = h.trim().toLowerCase();
        if (hl.includes('copier') || hl.includes('document')) return false;
        return (hl.includes('black') || hl.includes('b&w') || hl.includes('b/w') || hl.includes('bw') || hl.includes('w/b')) && hl.includes('print');
      }) || Object.keys(rawRows[0]).find(h => {
        const hl = h.trim().toLowerCase();
        if (hl.includes('copier') || hl.includes('document')) return false;
        return (hl.includes('black') || hl.includes('b&w') || hl.includes('b/w') || hl.includes('bw') || hl.includes('w/b'));
      });
    }

    const pcKey = Object.keys(rawRows[0]).find(h => {
      const hl = h.trim().toLowerCase();
      return hl.includes('printer') && hl.includes('color');
    });

    let pcKeyFinal = pcKey;
    if (!pcKeyFinal) {
      pcKeyFinal = Object.keys(rawRows[0]).find(h => {
        const hl = h.trim().toLowerCase();
        if (hl.includes('copier') || hl.includes('document')) return false;
        return hl.includes('color') && hl.includes('print');
      }) || Object.keys(rawRows[0]).find(h => {
        const hl = h.trim().toLowerCase();
        if (hl.includes('copier') || hl.includes('document')) return false;
        return hl.includes('color');
      });
    }

    // Match Copier page count columns
    const cbKey = Object.keys(rawRows[0]).find(h => {
      const hl = h.trim().toLowerCase();
      return (hl.includes('copier') || hl.includes('document')) && (hl.includes('black') || hl.includes('b&w') || hl.includes('b/w') || hl.includes('bw') || hl.includes('w/b'));
    });

    const ccKey = Object.keys(rawRows[0]).find(h => {
      const hl = h.trim().toLowerCase();
      return (hl.includes('copier') || hl.includes('document')) && (hl.includes('color') || hl.includes('full'));
    });

    // Match Scanner page count column
    const scKey = Object.keys(rawRows[0]).find(h => {
      const hl = h.trim().toLowerCase();
      return hl.includes('scanner') || hl.includes('scan');
    });

    // Load current rates from configuration
    const currentRates = getRates();

    // Process and extract relevant columns
    const processedRows = [];
    let totalCost = 0;

    for (const r of rawRows) {
      const rawUser = r[userKey];
      const rawName = r[nameKey];

      if (!rawUser || cleanStr(rawUser).toLowerCase() === 'otherusers' || cleanStr(rawUser) === '---') {
        continue;
      }

      const userId = cleanStr(rawUser);
      const name = rawName ? cleanStr(rawName) : '';

      const pb = pbKeyFinal ? cleanInt(r[pbKeyFinal]) : 0;
      const pc = pcKeyFinal ? cleanInt(r[pcKeyFinal]) : 0;
      const cb = cbKey ? cleanInt(r[cbKey]) : 0;
      const cc = ccKey ? cleanInt(r[ccKey]) : 0;
      const sc = scKey ? cleanInt(r[scKey]) : 0;

      const totalPages = pb + pc + cb + cc + sc;

      if (totalPages === 0 && userId === '') {
        continue;
      }

      const cost = (pb * currentRates.print_bw)
                 + (pc * currentRates.print_color)
                 + (cb * currentRates.copy_bw)
                 + (cc * currentRates.copy_color)
                 + (sc * currentRates.scan);

      totalCost += cost;

      processedRows.push({
        userId,
        name,
        printBw: pb,
        printColor: pc,
        copyBw: cb,
        copyColor: cc,
        scanner: sc,
        totalPages,
        cost: Math.round(cost * 100) / 100
      });
    }

    if (processedRows.length === 0) {
      return res.status(400).json({ error: 'No valid user usage records found in the report.' });
    }

    let printerName = req.body.printer_name || '';
    if (!printerName) {
      printerName = originalname.replace(/\.[^/.]+$/, "");
      const pMatch = printerName.match(/^(.*?)_usercounter/i);
      if (pMatch && pMatch[1]) {
        printerName = pMatch[1].trim();
      } else {
        printerName = printerName.trim();
      }
    }

    const pool = await poolPromise;

    // Automatically rename the filename by appending the selected month/period if the filename already exists in the Reports table
    let finalFilename = originalname;
    const checkFile = await pool.request()
      .input('filename', sql.NVarChar, originalname)
      .query('SELECT id FROM Reports WHERE filename = @filename');
      
    if (checkFile.recordset.length > 0) {
      const ext = originalname.split('.').pop().toLowerCase();
      const baseName = originalname.substring(0, originalname.lastIndexOf('.'));
      finalFilename = `${baseName}_${reportDateStr.slice(0, 7)}.${ext}`;
    }

    // Check if the renamed filename also exists
    const checkRenamedFile = await pool.request()
      .input('filename', sql.NVarChar, finalFilename)
      .query('SELECT id FROM Reports WHERE filename = @filename');
      
    const isFilenameDuplicate = checkRenamedFile.recordset.length > 0;
    const forceImport = req.query.force_import === 'true';

    if (!forceImport) {
      // Check duplicate month/printer
      const checkPeriod = await pool.request()
        .input('report_date', sql.Date, reportDateStr)
        .input('printer_name', sql.NVarChar, printerName)
        .query('SELECT id, filename FROM Reports WHERE report_date = @report_date AND printer_name = @printer_name');

      if (isFilenameDuplicate || checkPeriod.recordset.length > 0) {
        let conflictType = '';
        let conflictDetails = '';
        let existingRows = [];

        if (isFilenameDuplicate && checkPeriod.recordset.length > 0) {
          conflictType = 'BOTH';
          conflictDetails = `พบไฟล์ชื่อเดียวกัน '${finalFilename}' และมีรายงานของเครื่องพิมพ์ '${printerName}' ในงวดเวลานี้แล้วในระบบ`;
        } else if (isFilenameDuplicate) {
          conflictType = 'FILENAME';
          conflictDetails = `พบไฟล์ชื่อเดียวกัน '${finalFilename}' เคยนำเข้าแล้วในระบบ`;
        } else {
          const confFile = checkPeriod.recordset[0].filename;
          conflictType = 'PERIOD_PRINTER';
          conflictDetails = `พบเครื่องพิมพ์ '${printerName}' มีรายงานประจำงวด '${reportDateStr.slice(0, 7)}' อยู่แล้วในไฟล์ '${confFile}'`;
        }

        // Fetch existing records for comparison
        let conflictReportId = null;
        if (checkPeriod.recordset.length > 0) {
          conflictReportId = checkPeriod.recordset[0].id;
        } else if (isFilenameDuplicate) {
          conflictReportId = checkRenamedFile.recordset[0].id;
        }

        if (conflictReportId) {
          const existingDetails = await pool.request()
            .input('report_id', sql.Int, conflictReportId)
            .query(`
              SELECT user_id as userId, name, print_bw as printBw, print_color as printColor, 
                     copy_bw as copyBw, copy_color as copyColor, scanner, total_pages as totalPages, cost 
              FROM UsageDetails 
              WHERE report_id = @report_id
            `);
          existingRows = existingDetails.recordset;
        }

        return res.status(409).json({
          error: 'DUPLICATE_DETECTED',
          conflictType,
          conflictDetails,
          uploadedRows: processedRows,
          existingRows,
          renamedFilename: finalFilename
        });
      }
    }

    // If forceImport is true, delete existing conflicting reports
    if (forceImport) {
      const conflictReports = await pool.request()
        .input('filename', sql.NVarChar, finalFilename)
        .input('report_date', sql.Date, reportDateStr)
        .input('printer_name', sql.NVarChar, printerName)
        .query(`
          SELECT id FROM Reports 
          WHERE filename = @filename OR (report_date = @report_date AND printer_name = @printer_name)
        `);

      for (const r of conflictReports.recordset) {
        await pool.request()
          .input('id', sql.Int, r.id)
          .query('DELETE FROM Reports WHERE id = @id');
      }
    }

    // Support partial rows selection if sent
    let selectedUserIds = null;
    if (req.body.selected_user_ids) {
      try {
        selectedUserIds = JSON.parse(req.body.selected_user_ids);
      } catch (e) {
        console.error('Failed to parse selected_user_ids:', e);
      }
    }

    let finalRowsToInsert = processedRows;
    if (selectedUserIds && Array.isArray(selectedUserIds)) {
      finalRowsToInsert = processedRows.filter(item => selectedUserIds.includes(item.userId));
    }

    // Recalculate totalCost for the report
    totalCost = finalRowsToInsert.reduce((sum, item) => sum + item.cost, 0);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const reportRequest = new sql.Request(transaction);
      reportRequest.input('filename', sql.NVarChar, finalFilename);
      reportRequest.input('report_date', sql.Date, reportDateStr);
      reportRequest.input('total_cost', sql.Decimal(18, 2), totalCost);
      reportRequest.input('printer_name', sql.NVarChar, printerName);

      const reportResult = await reportRequest.query(`
        INSERT INTO Reports (filename, report_date, total_cost, printer_name)
        OUTPUT INSERTED.id
        VALUES (@filename, @report_date, @total_cost, @printer_name)
      `);

      const reportId = reportResult.recordset[0].id;

      for (const item of finalRowsToInsert) {
        const detailRequest = new sql.Request(transaction);
        detailRequest.input('report_id', sql.Int, reportId);
        detailRequest.input('user_id', sql.NVarChar, item.userId);
        detailRequest.input('name', sql.NVarChar, item.name);
        detailRequest.input('print_bw', sql.Int, item.printBw);
        detailRequest.input('print_color', sql.Int, item.printColor);
        detailRequest.input('copy_bw', sql.Int, item.copyBw);
        detailRequest.input('copy_color', sql.Int, item.copyColor);
        detailRequest.input('scanner', sql.Int, item.scanner);
        detailRequest.input('total_pages', sql.Int, item.totalPages);
        detailRequest.input('cost', sql.Decimal(18, 2), item.cost);

        await detailRequest.query(`
          INSERT INTO UsageDetails 
          (report_id, user_id, name, print_bw, print_color, copy_bw, copy_color, scanner, total_pages, cost)
          VALUES 
          (@report_id, @user_id, @name, @print_bw, @print_color, @copy_bw, @copy_color, @scanner, @total_pages, @cost)
        `);
      }

      await transaction.commit();
      await rebuildMonthlySummaries(pool);
      await logActivity(req.username, req.role, 'UPLOAD', `นำเข้าไฟล์รายงาน '${finalFilename}' ประจำงวด ${reportDateStr} (จำนวน ${finalRowsToInsert.length} รายการ, ยอดเงินรวม ${totalCost.toFixed(2)} บาท)`);
      
      res.status(201).json({
        message: 'Report uploaded and imported successfully.',
        reportId,
        recordsCount: finalRowsToInsert.length,
        totalCost
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error processing file: ' + err.message });
  }
});

// 2. Get list of uploaded reports
router.get('/reports', auth, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT id, filename, printer_name, report_date, total_cost, uploaded_at 
      FROM Reports 
      ORDER BY report_date DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Get list of distinct printer names in the system
router.get('/printers', auth, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT DISTINCT printer_name 
      FROM Reports 
      WHERE printer_name IS NOT NULL AND printer_name <> ''
      ORDER BY printer_name ASC
    `);
    res.json(result.recordset.map(row => row.printer_name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete a report (cascades to usage details) (Admin Only)
router.delete('/reports/:id', auth, adminOnly, async (req, res) => {
  try {
    const reportId = req.params.id;
    const pool = await poolPromise;

    const getReport = await pool.request()
      .input('id', sql.Int, reportId)
      .query('SELECT filename, report_date FROM Reports WHERE id = @id');
    const repInfo = getReport.recordset[0];

    await pool.request()
      .input('id', sql.Int, reportId)
      .query('DELETE FROM Reports WHERE id = @id');
    
    await rebuildMonthlySummaries(pool);

    if (repInfo) {
      const repDateStr = repInfo.report_date ? new Date(repInfo.report_date).toISOString().slice(0, 10) : '-';
      await logActivity(req.username, req.role, 'DELETE_REPORT', `ลบไฟล์รายงาน '${repInfo.filename}' ประจำงวด ${repDateStr}`);
    }

    res.json({ message: 'Report deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Get monthly/yearly summary data (with optional printer filter)
router.get('/reports/summary', auth, async (req, res) => {
  try {
    const printer = req.query.printer || '';
    const pool = await poolPromise;
    const request = pool.request();
    let query = '';

    if (printer) {
      request.input('printer', sql.NVarChar, printer);
      query = `
        SELECT 
          YEAR(r.report_date) as year,
          MONTH(r.report_date) as month,
          COUNT(DISTINCT ud.user_id) as total_users,
          SUM(ISNULL(ud.print_bw, 0)) as print_bw,
          SUM(ISNULL(ud.print_color, 0)) as print_color,
          SUM(ISNULL(ud.copy_bw, 0)) as copy_bw,
          SUM(ISNULL(ud.copy_color, 0)) as copy_color,
          SUM(ISNULL(ud.scanner, 0)) as scanner,
          SUM(ISNULL(ud.total_pages, 0)) as total_pages,
          SUM(ISNULL(ud.cost, 0.00)) as total_cost
        FROM Reports r
        JOIN UsageDetails ud ON r.id = ud.report_id
        WHERE r.printer_name = @printer
        GROUP BY YEAR(r.report_date), MONTH(r.report_date)
        ORDER BY year DESC, month DESC
      `;
    } else {
      query = `
        SELECT 
          year,
          month,
          total_users,
          print_bw,
          print_color,
          copy_bw,
          copy_color,
          scanner,
          total_pages,
          total_cost
        FROM MonthlySummaries
        ORDER BY year DESC, month DESC
      `;
    }
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Get category details (optional filter by year, month, and printer)
router.get('/reports/categories', auth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;
    const month = req.query.month ? parseInt(req.query.month) : null;
    const printer = req.query.printer || '';

    const pool = await poolPromise;
    const request = pool.request();
    
    let query = `
      SELECT 
        SUM(ud.print_bw) as print_bw,
        SUM(ud.print_color) as print_color,
        SUM(ud.copy_bw) as copy_bw,
        SUM(ud.copy_color) as copy_color,
        SUM(ud.scanner) as scanner,
        SUM(ud.total_pages) as total_pages,
        SUM(ud.cost) as total_cost
      FROM UsageDetails ud
      JOIN Reports r ON ud.report_id = r.id
      WHERE 1=1
    `;

    if (year) {
      request.input('year', sql.Int, year);
      query += ` AND YEAR(r.report_date) = @year`;
    }
    if (month) {
      request.input('month', sql.Int, month);
      query += ` AND MONTH(r.report_date) = @month`;
    }
    if (printer) {
      request.input('printer', sql.NVarChar, printer);
      query += ` AND r.printer_name = @printer`;
    }

    const result = await request.query(query);
    const row = result.recordset[0];
    if (row && row.total_pages === null) {
      res.json(null);
    } else {
      res.json(row || {
        print_bw: 0, print_color: 0, copy_bw: 0, copy_color: 0, scanner: 0, total_pages: 0, total_cost: 0
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Get detailed usage table of a specific report
router.get('/reports/:id/details', auth, async (req, res) => {
  try {
    const reportId = req.params.id;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('report_id', sql.Int, reportId)
      .query(`
        SELECT 
          id, report_id, user_id, name,
          print_bw, print_color, copy_bw, copy_color, scanner, total_pages, cost
        FROM UsageDetails
        WHERE report_id = @report_id
        ORDER BY cost DESC
      `);
    
    let records = result.recordset;
    if (req.role === 'user') {
      const { encodeId, maskName } = require('../utils/helpers');
      records = records.map(r => ({
        ...r,
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

// =========================================================================
// PRINTER INVENTORY ROUTES (Admin Only for Modifying)
// =========================================================================

// 1. Get list of all printers in inventory
router.get('/inventory/printers', auth, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT id, printer_name, serial_number, location, created_at 
      FROM Printers 
      ORDER BY printer_name ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Add new printer to inventory (Admin Only)
router.post('/inventory/printers', auth, adminOnly, async (req, res) => {
  const { printer_name, serial_number, location } = req.body;
  if (!printer_name || !serial_number || !location) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อเครื่องพิมพ์, S/N, ตำแหน่งที่ตั้ง)' });
  }

  try {
    const pool = await poolPromise;
    
    // Check if printer_name already exists
    const checkDup = await pool.request()
      .input('printer_name', sql.NVarChar, printer_name)
      .query('SELECT id FROM Printers WHERE printer_name = @printer_name');
    
    if (checkDup.recordset.length > 0) {
      return res.status(400).json({ error: 'มีชื่อเครื่องพิมพ์นี้ในระบบคลังอยู่แล้ว' });
    }

    await pool.request()
      .input('printer_name', sql.NVarChar, printer_name)
      .input('serial_number', sql.NVarChar, serial_number)
      .input('location', sql.NVarChar, location)
      .query(`
        INSERT INTO Printers (printer_name, serial_number, location)
        VALUES (@printer_name, @serial_number, @location)
      `);

    await logActivity(req.username, req.role, 'CREATE_PRINTER', `เพิ่มเครื่องพิมพ์ใหม่เข้าคลัง: '${printer_name}' (S/N: ${serial_number})`);
    res.status(201).json({ message: 'เพิ่มเครื่องพิมพ์เข้าคลังสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Edit printer details (Admin Only)
router.put('/inventory/printers/:id', auth, adminOnly, async (req, res) => {
  const printerId = req.params.id;
  const { printer_name, serial_number, location } = req.body;
  
  if (!printer_name || !serial_number || !location) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    const pool = await poolPromise;
    
    // Check uniqueness excluding current ID
    const checkDup = await pool.request()
      .input('id', sql.Int, printerId)
      .input('printer_name', sql.NVarChar, printer_name)
      .query('SELECT id FROM Printers WHERE printer_name = @printer_name AND id <> @id');

    if (checkDup.recordset.length > 0) {
      return res.status(400).json({ error: 'มีชื่อเครื่องพิมพ์นี้ในระบบคลังอยู่แล้ว' });
    }

    await pool.request()
      .input('id', sql.Int, printerId)
      .input('printer_name', sql.NVarChar, printer_name)
      .input('serial_number', sql.NVarChar, serial_number)
      .input('location', sql.NVarChar, location)
      .query(`
        UPDATE Printers 
        SET printer_name = @printer_name, serial_number = @serial_number, location = @location 
        WHERE id = @id
      `);

    await logActivity(req.username, req.role, 'UPDATE_PRINTER', `แก้ไขเครื่องพิมพ์ในคลัง ID: ${printerId} เป็น '${printer_name}' (S/N: ${serial_number})`);
    res.json({ message: 'แก้ไขข้อมูลเครื่องพิมพ์สำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete printer from inventory (Admin Only)
router.delete('/inventory/printers/:id', auth, adminOnly, async (req, res) => {
  const printerId = req.params.id;

  try {
    const pool = await poolPromise;

    const getPrinter = await pool.request()
      .input('id', sql.Int, printerId)
      .query('SELECT printer_name FROM Printers WHERE id = @id');
    const pInfo = getPrinter.recordset[0];

    if (!pInfo) {
      return res.status(404).json({ error: 'ไม่พบเครื่องพิมพ์ที่ต้องการลบในคลัง' });
    }

    await pool.request()
      .input('id', sql.Int, printerId)
      .query('DELETE FROM Printers WHERE id = @id');

    await logActivity(req.username, req.role, 'DELETE_PRINTER', `ลบเครื่องพิมพ์ออกจากคลัง: '${pInfo.printer_name}'`);
    res.json({ message: 'ลบเครื่องพิมพ์ออกจากคลังสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Get detailed usage (CSV export helper) supporting yearly or monthly
router.get('/reports/export/details', auth, async (req, res) => {
  try {
    const { year, month, printer } = req.query;
    const pool = await poolPromise;
    const request = pool.request();

    let query = `
      SELECT 
        ud.user_id, ud.name, r.report_date, r.filename, r.printer_name,
        ud.print_bw, ud.print_color, ud.copy_bw, ud.copy_color, ud.scanner, ud.total_pages, ud.cost
      FROM UsageDetails ud
      JOIN Reports r ON ud.report_id = r.id
      WHERE 1=1
    `;

    if (year) {
      request.input('year', sql.Int, year);
      query += ` AND YEAR(r.report_date) = @year`;
    }
    if (month) {
      request.input('month', sql.Int, month);
      query += ` AND MONTH(r.report_date) = @month`;
    }
    if (printer) {
      request.input('printer', sql.NVarChar, printer);
      query += ` AND r.printer_name = @printer`;
    }

    query += ` ORDER BY r.report_date DESC, ud.cost DESC`;

    const result = await request.query(query);
    let records = result.recordset;

    if (req.role === 'user') {
      const { encodeId, maskName } = require('../utils/helpers');
      records = records.map(r => ({
        ...r,
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

// 6. Get category trend data grouped by month
router.get('/reports/categories/trend', auth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;
    const printer = req.query.printer || '';

    const pool = await poolPromise;
    const request = pool.request();

    let query = `
      SELECT 
        YEAR(r.report_date) as year,
        MONTH(r.report_date) as month,
        SUM(ud.print_bw) as print_bw,
        SUM(ud.print_color) as print_color,
        SUM(ud.copy_bw) as copy_bw,
        SUM(ud.copy_color) as copy_color,
        SUM(ud.scanner) as scanner,
        SUM(ud.total_pages) as total_pages,
        SUM(ud.cost) as total_cost
      FROM UsageDetails ud
      JOIN Reports r ON ud.report_id = r.id
      WHERE 1=1
    `;

    if (year) {
      request.input('year', sql.Int, year);
      query += ` AND YEAR(r.report_date) = @year`;
    }
    if (printer) {
      request.input('printer', sql.NVarChar, printer);
      query += ` AND r.printer_name = @printer`;
    }

    query += `
      GROUP BY YEAR(r.report_date), MONTH(r.report_date)
      ORDER BY year ASC, month ASC
    `;

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
