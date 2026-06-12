const mysql = require('mysql2');

const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chatspace_master',
  port: process.env.DB_PORT || 3307,
  waitForConnections: true,
  connectionLimit: 10,
});

db.getConnection((err, connection) => {
  if (err) { console.error('❌ MySQL connection failed:', err.message); return; }
  console.log('✅ Connected to MySQL!');
  connection.release();
});

module.exports = db;