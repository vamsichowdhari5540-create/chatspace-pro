const mysql = require('mysql2');

const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chatspace_master',
  // 3306 is MySQL/XAMPP's actual default port. The old fallback here was
  // hardcoded to 3307 from an earlier port-conflict workaround — if the
  // .env file ever failed to load for any reason (wrong working directory,
  // missing file, etc), this silently pointed at the wrong port with no
  // clear error. Fixed to match reality, and logs which port is used.
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ MySQL connection failed:', err.message);
    console.error(`   Tried ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306} as user "${process.env.DB_USER || 'root'}" on database "${process.env.DB_NAME || 'chatspace_master'}"`);
    if (!process.env.DB_HOST) {
      console.error('   ⚠️  No DB_* environment variables were loaded at all — check that server/.env exists and is being read (see dotenv path in index.js).');
    }
    return;
  }
  console.log(`✅ Connected to MySQL! (${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306})`);
  connection.release();
});

module.exports = db;