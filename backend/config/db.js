const { Pool, types } = require('pg');
// Parse numeric (OID 1700) as float to avoid returning decimal as string
types.setTypeParser(1700, val => val === null ? null : parseFloat(val));
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;

let pool;
if (connectionString && !connectionString.includes('[username]')) {
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  console.warn('WARNING: DATABASE_URL is not configured correctly in .env. Database connections will fail.');
  // Mock pool that throws error when used
  pool = {
    connect: () => { throw new Error('Database not configured. Please set a valid DATABASE_URL in backend/.env'); },
    query: () => { throw new Error('Database not configured. Please set a valid DATABASE_URL in backend/.env'); }
  };
}

const poolPromise = Promise.resolve(pool);

// Mock mssql types and interfaces
const sql = {
  NVarChar: 'NVarChar',
  Int: 'Int',
  Decimal: (p, s) => `Decimal(${p},${s})`,
  Date: 'Date',
  Request: class {
    constructor(transactionOrPool) {
      this.client = transactionOrPool;
      this.params = {};
    }
    input(name, type, value) {
      this.params[name] = value;
      return this;
    }
    async query(sqlText) {
      const { queryText, values } = translateQuery(sqlText, this.params);
      
      // If client is Transaction (has a client property), use it, otherwise use pool
      const execClient = (this.client && this.client.client) ? this.client.client : pool;
      
      const res = await execClient.query(queryText, values);
      return {
        recordset: res.rows,
        recordsets: [res.rows],
        rowsAffected: [res.rowCount]
      };
    }
  },
  Transaction: class {
    constructor(dbPool) {
      this.dbPool = dbPool;
      this.client = null;
    }
    async begin() {
      this.client = await pool.connect();
      await this.client.query('BEGIN');
    }
    async commit() {
      await this.client.query('COMMIT');
      this.client.release();
    }
    async rollback() {
      if (this.client) {
        await this.client.query('ROLLBACK');
        this.client.release();
      }
    }
  }
};

pool.request = () => new sql.Request(pool);

// SQL Translation logic (MSSQL to Postgres)
function translateQuery(sqlText, params) {
  let queryText = sqlText;

  // 1. Translate OUTPUT INSERTED.id (MSSQL) to RETURNING id (Postgres)
  // E.g. INSERT INTO Reports (...) OUTPUT INSERTED.id VALUES (...)
  const outputRegex = /OUTPUT\s+INSERTED\.(\w+)/i;
  let returningField = null;
  if (outputRegex.test(queryText)) {
    const match = queryText.match(outputRegex);
    returningField = match[1];
    queryText = queryText.replace(outputRegex, '');
  }

  // 2. Translate OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  // to LIMIT @limit OFFSET @offset
  const paginationRegex = /OFFSET\s+(@\w+)\s+ROWS\s+FETCH\s+NEXT\s+(@\w+)\s+ROWS\s+ONLY/i;
  if (paginationRegex.test(queryText)) {
    queryText = queryText.replace(paginationRegex, 'LIMIT $2 OFFSET $1');
  }

  // 3. Replace other SQL functions
  queryText = queryText.replace(/ISNULL\((.*?),/gi, 'COALESCE($1,');
  queryText = queryText.replace(/YEAR\((.*?)\)/gi, "EXTRACT(YEAR FROM $1)");
  queryText = queryText.replace(/MONTH\((.*?)\)/gi, "EXTRACT(MONTH FROM $1)");

  // 4. Map named parameters @param to PG positional parameters $1, $2...
  const paramNames = Object.keys(params);
  const values = [];

  // Sort parameter names by length descending to prevent substring replace conflicts
  paramNames.sort((a, b) => b.length - a.length);

  paramNames.forEach((name, idx) => {
    const regex = new RegExp(`@${name}\\b`, 'g');
    queryText = queryText.replace(regex, `$${idx + 1}`);
    values.push(params[name]);
  });

  if (returningField) {
    queryText = `${queryText} RETURNING ${returningField}`;
  }

  return { queryText, values };
}

module.exports = {
  sql,
  poolPromise
};
