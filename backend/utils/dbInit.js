const bcrypt = require('bcryptjs');
const { sql, poolPromise } = require('../config/db');
const { rebuildMonthlySummaries } = require('./helpers');

async function initDatabase() {
  try {
    const pool = await poolPromise;
    
    // Create Users table
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS Users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Users table checked/created.');

    // Create Reports table
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS Reports (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL,
          report_date DATE NOT NULL,
          total_cost DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
          printer_name VARCHAR(100) NOT NULL,
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Reports table checked/created.');

    // Create UsageDetails table
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS UsageDetails (
          id SERIAL PRIMARY KEY,
          report_id INT REFERENCES Reports(id) ON DELETE CASCADE,
          user_id VARCHAR(100) NOT NULL,
          name VARCHAR(100) NOT NULL,
          print_bw INT NOT NULL DEFAULT 0,
          print_color INT NOT NULL DEFAULT 0,
          copy_bw INT NOT NULL DEFAULT 0,
          copy_color INT NOT NULL DEFAULT 0,
          scanner INT NOT NULL DEFAULT 0,
          total_pages INT NOT NULL DEFAULT 0,
          cost DECIMAL(18, 2) NOT NULL DEFAULT 0.00
      );
    `);
    console.log('UsageDetails table checked/created.');

    // Create MonthlySummaries table
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS MonthlySummaries (
          id SERIAL PRIMARY KEY,
          year INT NOT NULL,
          month INT NOT NULL,
          total_users INT NOT NULL DEFAULT 0,
          print_bw INT NOT NULL DEFAULT 0,
          print_color INT NOT NULL DEFAULT 0,
          copy_bw INT NOT NULL DEFAULT 0,
          copy_color INT NOT NULL DEFAULT 0,
          scanner INT NOT NULL DEFAULT 0,
          total_pages INT NOT NULL DEFAULT 0,
          total_cost DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT UC_Year_Month UNIQUE (year, month)
      );
    `);
    console.log('MonthlySummaries table checked/created.');

    // Create SystemLogs table
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS SystemLogs (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          role VARCHAR(50) NOT NULL,
          action_type VARCHAR(50) NOT NULL,
          action_details TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('SystemLogs table checked/created.');

    // Create Printers table
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS Printers (
          id SERIAL PRIMARY KEY,
          printer_name VARCHAR(100) UNIQUE NOT NULL,
          serial_number VARCHAR(100) NOT NULL,
          location VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Printers table checked/created.');

    // Seed initial users if they do not exist
    const hashedPassword = await bcrypt.hash('123456', 10);
    const adminCheck = await pool.request()
      .input('username', sql.NVarChar, 'admin')
      .query("SELECT id, password FROM Users WHERE username = @username");
      
    if (adminCheck.recordset.length === 0) {
      await pool.request()
        .input('username', sql.NVarChar, 'admin')
        .input('password', sql.NVarChar, hashedPassword)
        .input('role', sql.NVarChar, 'admin')
        .query("INSERT INTO Users (username, password, role) VALUES ('admin', @password, 'admin')");
      console.log('Admin user seeded in database.');
    }

    const userCheck = await pool.request()
      .input('username', sql.NVarChar, 'user')
      .query("SELECT id, password FROM Users WHERE username = @username");

    if (userCheck.recordset.length === 0) {
      await pool.request()
        .input('username', sql.NVarChar, 'user')
        .input('password', sql.NVarChar, hashedPassword)
        .input('role', sql.NVarChar, 'user')
        .query("INSERT INTO Users (username, password, role) VALUES ('user', @password, 'user')");
      console.log('Standard user seeded in database.');
    }

    // Seed default printers from existing Reports data
    await pool.request().query(`
      INSERT INTO Printers (printer_name, serial_number, location)
      SELECT DISTINCT printer_name, 'S/N-TEMP-' || floor(random() * 10000)::text, 'สำนักงานใหญ่'
      FROM Reports
      WHERE printer_name IS NOT NULL AND printer_name <> ''
        AND printer_name NOT IN (SELECT printer_name FROM Printers)
      ON CONFLICT (printer_name) DO NOTHING;
    `);
    console.log('Seeded default printers from Reports.');

    // Create indexes if not exists
    await pool.request().query(`
      CREATE INDEX IF NOT EXISTS "IX_Reports_PrinterName" ON Reports(printer_name);
      CREATE INDEX IF NOT EXISTS "IX_UsageDetails_Cost" ON UsageDetails(cost);
    `);
    console.log('Indexes checked/created.');
    
    await rebuildMonthlySummaries(pool);
    console.log('Database initialization completed.');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
}

module.exports = {
  initDatabase
};
