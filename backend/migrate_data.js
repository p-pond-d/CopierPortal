const sql = require('mssql');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });

const mssqlConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  }
};

if (process.env.DB_SERVER && !process.env.DB_SERVER.includes('\\')) {
  mssqlConfig.port = parseInt(process.env.DB_PORT || '1433');
}

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Import table creator
const { initDatabase } = require('./utils/dbInit');

async function runMigration() {
  console.log('=== STARTING DATABASE MIGRATION FROM MSSQL TO NEON POSTGRES ===\n');

  // 1. Initialize tables on Neon Postgres
  console.log('Step 1: Ensuring PostgreSQL tables exist...');
  await initDatabase();
  console.log('PostgreSQL tables initialized.\n');

  // 2. Connect to MSSQL
  console.log('Step 2: Connecting to local MSSQL database...');
  const msPool = await sql.connect(mssqlConfig);
  console.log('Connected to MSSQL.\n');

  const pgClient = await pgPool.connect();

  try {
    // Disable triggers or handle dependencies by ordering inserts properly
    // We will clear existing data in PostgreSQL first to allow clean import
    console.log('Step 3: Cleaning existing data in PostgreSQL...');
    await pgClient.query('TRUNCATE TABLE UsageDetails CASCADE');
    await pgClient.query('TRUNCATE TABLE Reports CASCADE');
    await pgClient.query('TRUNCATE TABLE Users CASCADE');
    await pgClient.query('TRUNCATE TABLE Printers CASCADE');
    await pgClient.query('TRUNCATE TABLE SystemLogs CASCADE');
    await pgClient.query('TRUNCATE TABLE MonthlySummaries CASCADE');
    console.log('Target tables cleared.\n');

    // Helper function to migrate a table
    const migrateTable = async (tableName, columns, pgTableName = tableName) => {
      console.log(`Migrating table: ${tableName}...`);
      
      // Fetch from MSSQL
      const selectQuery = `SELECT ${columns.join(', ')} FROM ${tableName}`;
      const result = await msPool.request().query(selectQuery);
      const rows = result.recordset;
      
      console.log(`Found ${rows.length} rows in MSSQL.`);
      if (rows.length === 0) return;

      // Insert into PostgreSQL
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
      const insertQuery = `INSERT INTO ${pgTableName} (${columns.join(', ')}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = columns.map(col => row[col]);
        await pgClient.query(insertQuery, values);
      }
      console.log(`Successfully migrated ${rows.length} rows to ${pgTableName}.\n`);
    };

    // 4. Migrate tables in dependency order
    
    // Printers
    await migrateTable('Printers', ['id', 'printer_name', 'serial_number', 'location', 'created_at']);

    // Users
    await migrateTable('Users', ['id', 'username', 'password', 'role', 'created_at']);

    // Reports
    await migrateTable('Reports', ['id', 'filename', 'report_date', 'total_cost', 'printer_name', 'uploaded_at']);

    // UsageDetails
    await migrateTable('UsageDetails', [
      'id', 'report_id', 'user_id', 'name', 'print_bw', 'print_color', 'copy_bw', 'copy_color', 'scanner', 'total_pages', 'cost'
    ]);

    // SystemLogs
    await migrateTable('SystemLogs', ['id', 'username', 'role', 'action_type', 'action_details', 'created_at']);

    // MonthlySummaries
    await migrateTable('MonthlySummaries', [
      'id', 'year', 'month', 'total_users', 'print_bw', 'print_color', 'copy_bw', 'copy_color', 'scanner', 'total_pages', 'total_cost', 'updated_at'
    ]);

    // 5. Reset primary key sequence generators in PostgreSQL
    console.log('Step 5: Resetting ID sequences in PostgreSQL...');
    const tablesToReset = ['Users', 'Reports', 'UsageDetails', 'MonthlySummaries', 'SystemLogs', 'Printers'];
    for (const table of tablesToReset) {
      const seqName = `${table.toLowerCase()}_id_seq`;
      await pgClient.query(`SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`);
    }
    console.log('ID sequences reset.\n');

    console.log('=== MIGRATION COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Migration failed with error:', err);
  } finally {
    // Release connections
    pgClient.release();
    await pgPool.end();
    await sql.close();
  }
}

runMigration();
