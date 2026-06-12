// ── MULTI-TENANT DATABASE MANAGER ──
const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

const dbConnections = {}; // Cache connections per company

const baseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 3307,
  multipleStatements: true,
};

// Master DB connection
const masterDb = mysql.createPool({
  ...baseConfig,
  database: 'chatspace_master',
  waitForConnections: true,
  connectionLimit: 10,
});

// Get or create connection for a company DB
const getCompanyDb = (dbName) => {
  if (dbConnections[dbName]) return dbConnections[dbName];
  const pool = mysql.createPool({
    ...baseConfig,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
  });
  dbConnections[dbName] = pool;
  return pool;
};

// Create a new company database with all tables
const createCompanyDatabase = async (dbName) => {
  return new Promise((resolve, reject) => {
    const rootPool = mysql.createPool({ ...baseConfig, multipleStatements: true });
    const templatePath = path.join(__dirname, 'company_template.sql');
    const template = fs.readFileSync(templatePath, 'utf8');
    const sql = `CREATE DATABASE IF NOT EXISTS \`${dbName}\`; USE \`${dbName}\`; ${template}`;
    rootPool.query(sql, (err) => {
      rootPool.end();
      if (err) reject(err);
      else resolve();
    });
  });
};

// Get company info from master DB by code
const getCompanyByCode = (code) => {
  return new Promise((resolve, reject) => {
    masterDb.query('SELECT * FROM companies WHERE code=? AND is_active=1', [code.toUpperCase()], (err, rows) => {
      if (err) reject(err);
      else resolve(rows[0] || null);
    });
  });
};

// Parse User ID → extract company code
// Format: CSP-VITS-000001 → code=VITS, userId=1
const parseUserId = (userId) => {
  const match = userId?.match(/^CSP-([A-Z0-9]+)-(\d+)$/i);
  if (!match) return null;
  return { code: match[1].toUpperCase(), numericId: parseInt(match[2]) };
};

// Generate User ID from company code and numeric id
const generateUserId = (code, numericId) => {
  return `CSP-${code.toUpperCase()}-${String(numericId).padStart(6, '0')}`;
};

module.exports = { masterDb, getCompanyDb, createCompanyDatabase, getCompanyByCode, parseUserId, generateUserId };