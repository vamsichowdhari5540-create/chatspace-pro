const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getCompanyDb } = require('../config/db_manager');

// ── AUTH ──
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.user.dbName) req.db = getCompanyDb(req.user.dbName);
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
};

// ── AVATAR UPLOAD ──
const avatarsDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg','image/jpg','image/png','image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// ── GET ALL USERS sorted by last message time ──
router.get('/', auth, (req, res) => {
  // Try with unread_counts join first, fallback to simple query if table doesn't exist
  req.db.query(
    `SELECT u.id, u.username, u.email, u.avatar_color, u.avatar_url, u.bio, u.status, u.last_seen, u.role, u.user_code,
     COALESCE(uc.last_message_time, 0) as last_message_time,
     COALESCE(uc.count, 0) as unread_count
     FROM users u
     LEFT JOIN unread_counts uc ON uc.user_id=? AND uc.ref_type='dm' AND uc.ref_id=CAST(u.id AS CHAR)
     WHERE u.id != ?
     AND u.id NOT IN (SELECT blocked_user_id FROM blocked_users WHERE user_id = ?)
     ORDER BY last_message_time DESC, u.username ASC`,
    [req.user.id, req.user.id, req.user.id],
    (err, rows) => {
      if (err) {
        // Fallback - simple query without unread_counts
        req.db.query(
          `SELECT u.id, u.username, u.email, u.avatar_color, u.avatar_url, u.bio, u.status, u.last_seen, u.role, u.user_code,
           0 as last_message_time, 0 as unread_count
           FROM users u
           WHERE u.id != ?
           AND u.id NOT IN (SELECT blocked_user_id FROM blocked_users WHERE user_id = ?)
           ORDER BY u.username ASC`,
          [req.user.id, req.user.id],
          (err2, rows2) => {
            if (err2) return res.status(500).json({ message: 'Database error' });
            res.json(rows2);
          }
        );
        return;
      }
      res.json(rows);
    }
  );
});

// ── GET MY PROFILE ──
router.get('/me', auth, (req, res) => {
  req.db.query('SELECT id, username, email, avatar_color, avatar_url, bio, status, role, user_code FROM users WHERE id=?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  });
});

// ── UPDATE MY PROFILE ──
router.put('/me', auth, (req, res) => {
  const { username, bio, status } = req.body;
  if (!username?.trim()) return res.status(400).json({ message: 'Username required' });

  // Check username not taken by another user
  req.db.query('SELECT id FROM users WHERE username=? AND id!=?', [username.trim(), req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (rows.length) return res.status(400).json({ message: 'Username already taken' });

    req.db.query(
      'UPDATE users SET username=?, bio=?, status=? WHERE id=?',
      [username.trim(), bio || '', status || 'online', req.user.id],
      (err) => {
        if (err) return res.status(500).json({ message: 'Database error: ' + err.message });
        res.json({ message: 'Profile updated', username: username.trim(), bio, status });
      }
    );
  });
});

// ── UPDATE STATUS ──
router.put('/status', auth, (req, res) => {
  const { status } = req.body;
  if (!['online','away','busy','dnd'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  req.db.query('UPDATE users SET status=? WHERE id=?', [status, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Status updated', status });
  });
});

// ── UPDATE PROFILE (username, bio, avatar_color, avatar_url) ──
router.put('/profile', auth, (req, res) => {
  const { username, bio, avatar_color, avatar_url } = req.body;
  const fields = [];
  const values = [];
  if (username !== undefined) { fields.push('username=?'); values.push(username); }
  if (bio !== undefined) { fields.push('bio=?'); values.push(bio); }
  if (avatar_color !== undefined) { fields.push('avatar_color=?'); values.push(avatar_color); }
  if (avatar_url !== undefined) { fields.push('avatar_url=?'); values.push(avatar_url === '' || avatar_url === null || avatar_url === 'REMOVE' ? null : avatar_url); }
  if (!fields.length) return res.status(400).json({ message: 'Nothing to update' });
  values.push(req.user.id);
  req.db.query(`UPDATE users SET ${fields.join(',')} WHERE id=?`, values, (err) => {
    if (err) return res.status(500).json({ message: 'Database error: ' + err.message });
    res.json({ message: 'Profile updated' });
  });
});

// ── UPLOAD AVATAR ──
router.post('/avatar', auth, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(500).json({ message: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    req.db.query('UPDATE users SET avatar_url=? WHERE id=?', [avatarUrl, req.user.id], (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ avatar_url: avatarUrl });
    });
  });
});

// ── UPDATE LAST SEEN ──
router.put('/last-seen', auth, (req, res) => {
  req.db.query('UPDATE users SET last_seen=NOW(), status="offline" WHERE id=?', [req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Last seen updated' });
  });
});

// ── GET BLOCKED USERS ──
router.get('/blocked', auth, (req, res) => {
  req.db.query(
    `SELECT u.id, u.username, u.avatar_color, u.avatar_url FROM users u
     JOIN blocked_users b ON u.id = b.blocked_user_id WHERE b.user_id=?`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

// ── BLOCK USER ──
router.post('/block/:id', auth, (req, res) => {
  req.db.query('INSERT IGNORE INTO blocked_users (user_id, blocked_user_id) VALUES (?,?)', [req.user.id, req.params.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'User blocked' });
  });
});

// ── UNBLOCK USER ──
router.delete('/block/:id', auth, (req, res) => {
  req.db.query('DELETE FROM blocked_users WHERE user_id=? AND blocked_user_id=?', [req.user.id, req.params.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'User unblocked' });
  });
});

module.exports = router;