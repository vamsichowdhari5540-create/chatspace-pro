const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.user.dbName) {
      const { getCompanyDb } = require('../config/db_manager');
      req.db = getCompanyDb(req.user.dbName);
    } else {
      req.db = db;
    }
    next();
  }
  catch { res.status(401).json({ message: 'Invalid token' }); }
};

router.get('/', auth, (req, res) => {
  req.db.query(
    `SELECT g.*,u.username as admin_username FROM groups_table g
     JOIN group_members gm ON g.id=gm.group_id
     JOIN users u ON g.admin_id=u.id
     WHERE gm.user_id=? ORDER BY g.created_at DESC`,
    [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

router.post('/', auth, (req, res) => {
  const { name, memberUsernames } = req.body;
  if (!name || !memberUsernames?.length) return res.status(400).json({ message: 'Name and members required' });
  const placeholders = memberUsernames.map(() => '?').join(',');
  req.db.query(`SELECT id,username FROM users WHERE username IN (${placeholders})`, memberUsernames, (err, found) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    const notFound = memberUsernames.filter(u => !found.find(f => f.username.toLowerCase() === u.toLowerCase()));
    if (notFound.length) return res.status(400).json({ message: `Users not found: ${notFound.join(', ')}` });
    req.db.query('INSERT INTO groups_table (name,admin_id) VALUES (?,?)', [name, req.user.id], (err, result) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      const groupId = result.insertId;
      const allIds = [...new Set([req.user.id, ...found.map(u => u.id)])];
      req.db.query('INSERT INTO group_members (group_id,user_id) VALUES ?', [allIds.map(id => [groupId, id])], err => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.status(201).json({ id: groupId, name, admin_id: req.user.id });
      });
    });
  });
});

router.get('/:groupId/messages', auth, (req, res) => {
  req.db.query(
    `SELECT gm.*,u.username,u.avatar_color,u.avatar_url FROM group_messages gm
     JOIN users u ON gm.user_id=u.id
     WHERE gm.group_id=? AND gm.deleted=0
     ORDER BY gm.created_at ASC LIMIT 100`,
    [req.params.groupId], (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

router.post('/:groupId/messages', auth, (req, res) => {
  const { text } = req.body; const { groupId } = req.params;
  if (!text) return res.status(400).json({ message: 'Text required' });
  req.db.query('INSERT INTO group_messages (group_id,user_id,text) VALUES (?,?,?)', [groupId, req.user.id, text], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.status(201).json({ id: result.insertId, group_id: parseInt(groupId), user_id: req.user.id, text, username: req.user.username, created_at: new Date(), edited: 0, deleted: 0 });
  });
});

// EDIT group message
router.put('/:groupId/messages/:msgId', auth, (req, res) => {
  const { text } = req.body;
  req.db.query('UPDATE group_messages SET text=?, edited=1 WHERE id=? AND user_id=?', [text, req.params.msgId, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!result.affectedRows) return res.status(403).json({ message: 'Not authorized' });
    res.json({ message: 'Edited', id: req.params.msgId, text, edited: 1 });
  });
});

// DELETE group message
router.delete('/:groupId/messages/:msgId', auth, (req, res) => {
  req.db.query('UPDATE group_messages SET deleted=1, text="This message was deleted" WHERE id=? AND user_id=?', [req.params.msgId, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!result.affectedRows) return res.status(403).json({ message: 'Not authorized' });
    res.json({ message: 'Deleted', id: req.params.msgId });
  });
});

router.get('/:groupId/members', auth, (req, res) => {
  req.db.query(`SELECT u.id,u.username,u.avatar_color,u.avatar_url FROM group_members gm JOIN users u ON gm.user_id=u.id WHERE gm.group_id=?`, [req.params.groupId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(rows);
  });
});

router.post('/:groupId/members', auth, (req, res) => {
  const { username } = req.body;
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.groupId], (err, rows) => {
    if (err || rows[0]?.admin_id !== req.user.id) return res.status(403).json({ message: 'Admin only' });
    req.db.query('SELECT id FROM users WHERE username=?', [username], (err, users) => {
      if (err || !users.length) return res.status(404).json({ message: `User "${username}" not found` });
      req.db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [req.params.groupId, users[0].id], err => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({ message: 'Member added!' });
      });
    });
  });
});

router.delete('/:groupId/members/:userId', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.groupId], (err, rows) => {
    if (err || rows[0]?.admin_id !== req.user.id) return res.status(403).json({ message: 'Admin only' });
    req.db.query('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.groupId, req.params.userId], err => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Member removed!' });
    });
  });
});

router.delete('/:groupId/leave', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.groupId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (rows[0]?.admin_id === req.user.id) return res.status(400).json({ message: 'Admin cannot leave. Transfer admin role first.' });
    req.db.query('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.groupId, req.user.id], err => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Left group successfully' });
    });
  });
});

router.put('/:groupId/make-admin/:userId', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.groupId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (rows[0]?.admin_id !== req.user.id) return res.status(403).json({ message: 'Only admin can transfer admin role' });
    req.db.query('UPDATE groups_table SET admin_id=? WHERE id=?', [req.params.userId, req.params.groupId], err => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Admin transferred!' });
    });
  });
});

// PIN message (admin only)
router.post('/:groupId/pin/:msgId', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.groupId], (err, rows) => {
    if (err || rows[0]?.admin_id !== req.user.id) return res.status(403).json({ message: 'Admin only' });
    req.db.query('INSERT IGNORE INTO pinned_messages (group_id,message_id,pinned_by) VALUES (?,?,?)',
      [req.params.groupId, req.params.msgId, req.user.id], err => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({ message: 'Message pinned!' });
      }
    );
  });
});

// UNPIN message (admin only)
router.delete('/:groupId/pin/:msgId', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.groupId], (err, rows) => {
    if (err || rows[0]?.admin_id !== req.user.id) return res.status(403).json({ message: 'Admin only' });
    req.db.query('DELETE FROM pinned_messages WHERE group_id=? AND message_id=?', [req.params.groupId, req.params.msgId], err => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Message unpinned!' });
    });
  });
});

// GET pinned messages
router.get('/:groupId/pinned', auth, (req, res) => {
  req.db.query(
    `SELECT gm.*, u.username, u.avatar_color FROM pinned_messages pm
     JOIN group_messages gm ON pm.message_id = gm.id
     JOIN users u ON gm.user_id = u.id
     WHERE pm.group_id = ?`,
    [req.params.groupId], (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

module.exports = router;