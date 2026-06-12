const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getCompanyDb } = require('../config/db_manager');

// ── AUTH + ADMIN MIDDLEWARE ──
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.user.dbName) req.db = getCompanyDb(req.user.dbName);
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
};

const adminOnly = (req, res, next) => {
  // Check role from DB to be safe
  req.db.query('SELECT role FROM users WHERE id=?', [req.user.id], (err, rows) => {
    if (err || !rows.length) return res.status(403).json({ message: 'Unauthorized' });
    if (rows[0].role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    req.user.role = 'admin'; // Set role for downstream use
    next();
  });
};

// ── GET ALL USERS (admin) ──
router.get('/users', auth, adminOnly, (req, res) => {
  req.db.query(
    'SELECT id, username, email, role, avatar_color, avatar_url, status, user_code, created_at FROM users ORDER BY created_at ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

// ── SET USER ROLE ──
router.put('/users/:id/role', auth, adminOnly, (req, res) => {
  const { role } = req.body;
  if (!['admin','team_lead','member'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ message: 'Cannot change your own role' });
  req.db.query('UPDATE users SET role=? WHERE id=?', [role, req.params.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: `Role updated to ${role}` });
  });
});

// ── GET CHANNEL PERMISSIONS FOR A USER ──
router.get('/users/:id/permissions', auth, adminOnly, (req, res) => {
  req.db.query(
    'SELECT * FROM channel_permissions WHERE user_id=?',
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

// ── GRANT CHANNEL PERMISSION ──
router.post('/permissions', auth, adminOnly, (req, res) => {
  const { user_id, channel } = req.body;
  if (!user_id || !channel) return res.status(400).json({ message: 'user_id and channel required' });
  req.db.query(
    'INSERT INTO channel_permissions (user_id, channel, can_post, granted_by) VALUES (?,?,1,?) ON DUPLICATE KEY UPDATE can_post=1, granted_by=?',
    [user_id, channel, req.user.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Permission granted' });
    }
  );
});

// ── REVOKE CHANNEL PERMISSION ──
router.delete('/permissions', auth, adminOnly, (req, res) => {
  const { user_id, channel } = req.body;
  req.db.query(
    'DELETE FROM channel_permissions WHERE user_id=? AND channel=?',
    [user_id, channel],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Permission revoked' });
    }
  );
});

// ── CHECK IF USER CAN POST IN CHANNEL ──
router.get('/can-post/:channel', auth, (req, res) => {
  const { channel } = req.params;
  const { id } = req.user;

  // Get role from DB
  req.db.query('SELECT role FROM users WHERE id=?', [id], (err, rows) => {
    if (err || !rows.length) return res.json({ canPost: false });
    const role = rows[0].role;

    // Admin can always post
    if (role === 'admin') return res.json({ canPost: true, reason: 'admin' });

    // Announcements: only admin
    if (channel === 'announcements') return res.json({ canPost: false, reason: 'admin_only' });

    // team_lead can post in tech-updates and job-notifications
    if (role === 'team_lead') return res.json({ canPost: true, reason: 'team_lead' });

    // Check specific permission for members
    req.db.query(
      'SELECT can_post FROM channel_permissions WHERE user_id=? AND channel=? AND can_post=1',
      [id, channel],
      (err2, permRows) => {
        if (err2) return res.status(500).json({ message: 'Database error' });
        res.json({ canPost: permRows.length > 0, reason: permRows.length > 0 ? 'permission_granted' : 'no_permission' });
      }
    );
  });
});

// ── GET ALL PERMISSIONS ──
router.get('/permissions', auth, adminOnly, (req, res) => {
  req.db.query(
    `SELECT cp.*, u.username, u.role, u.avatar_color FROM channel_permissions cp JOIN users u ON cp.user_id=u.id ORDER BY u.username`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

module.exports = router;