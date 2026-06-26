/**
 * ============================================================
 * ChatSpace Pro
 * ============================================================
 * Copyright (c) 2026 Venkata Vamsi. All Rights Reserved.
 *
 * This file is part of ChatSpace Pro — a proprietary software.
 * Unauthorized copying, modification, or distribution of this
 * file, via any medium, is strictly prohibited.
 *
 * Developer : Venkata Vamsi
 * Email     : vamsichowdhari5540@gmail.com
 * GitHub    : https://github.com/vamsichowdhari5540-create
 * ============================================================
 *
 * ENCRYPTION FULLY REMOVED: end-to-end encryption (channels, groups,
 * and DMs) has been completely reverted. Every message is now sent and
 * stored as plain `text`. The channel-key routes are removed entirely.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.user.dbName) {
      const { getCompanyDb } = require('../config/db_manager');
      req.db = getCompanyDb(req.user.dbName);
    } else {
      req.db = require('../config/db');
    }
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
};

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true }); };
const imagesDir = path.join(__dirname, '../uploads/images');
ensureDir(imagesDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => { ensureDir(imagesDir); cb(null, imagesDir); },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `img_${Date.now()}_${Math.random().toString(36).substr(2,6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10*1024*1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg','image/jpg','image/png','image/gif','image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

router.post('/upload-image', auth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) { console.error('Upload error:', err.message); return res.status(500).json({ message: err.message || 'Upload failed' }); }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const imageUrl = `/uploads/images/${req.file.filename}`;
    console.log('✅ Image uploaded:', imageUrl);
    res.json({ image_url: imageUrl });
  });
});

const filesDir = path.join(__dirname, '../uploads/files');
ensureDir(filesDir);

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => { ensureDir(filesDir); cb(null, filesDir); },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${name}_${Date.now()}${ext}`);
  }
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.msi'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) cb(new Error('Executable files not allowed'));
    else cb(null, true);
  }
});

router.post('/upload-file', auth, (req, res) => {
  fileUpload.single('file')(req, res, (err) => {
    if (err) { console.error('File upload error:', err.message); return res.status(500).json({ message: err.message || 'Upload failed' }); }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const fileUrl = `/uploads/files/${req.file.filename}`;
    console.log('✅ File uploaded:', fileUrl, 'Size:', req.file.size);
    res.json({
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_size: req.file.size,
      file_type: path.extname(req.file.originalname).toLowerCase().replace('.', '')
    });
  });
});

router.get('/unread-counts', auth, (req, res) => {
  req.db.query(
    'SELECT ref_type, ref_id, count, last_message_time FROM unread_counts WHERE user_id=?',
    [req.user.id],
    (err, rows) => {
      if (err) { console.error('unread-counts error:', err.message); return res.json([]); }
      res.json(rows);
    }
  );
});

router.get('/:room', auth, (req, res) => {
  if (req.params.room === 'private') return res.status(400).json({ message: 'Use /private/:userId' });
  req.db.query(
    `SELECT m.*, u.username, u.avatar_color, u.avatar_url FROM messages m JOIN users u ON m.user_id=u.id WHERE m.room=? AND m.deleted=0 ORDER BY m.created_at ASC LIMIT 100`,
    [req.params.room],
    (err, rows) => {
      if (err) { console.error('DB error:', err.message); return res.status(500).json({ message: 'Database error: ' + err.message }); }
      res.json(rows);
    }
  );
});

router.post('/', auth, (req, res) => {
  const { room, text, reply_to_id, reply_to_text, reply_to_username } = req.body;
  if (!room || !text) return res.status(400).json({ message: 'Room and text required' });
  const ts = Date.now();
  req.db.query(
    'INSERT INTO messages (user_id,room,text,reply_to_id,reply_to_text,reply_to_username) VALUES (?,?,?,?,?,?)',
    [req.user.id, room, text, reply_to_id||null, reply_to_text||null, reply_to_username||null],
    (err, result) => {
    if (err) { console.error('DB error:', err.message); return res.status(500).json({ message: 'Database error: ' + err.message }); }
    req.db.query('SELECT id FROM users WHERE id!=?', [req.user.id], (e, users) => {
      if (e) { console.error('Channel unread users error:', e.message); return; }
      if (users.length) {
        const vals = users.map(u => [u.id, 'channel', room, 1, ts]);
        req.db.query(
          `INSERT INTO unread_counts (user_id,ref_type,ref_id,count,last_message_time) VALUES ? ON DUPLICATE KEY UPDATE count=count+1,last_message_time=?`,
          [vals, ts], () => {}
        );
      }
    });
    res.status(201).json({
      id:result.insertId, user_id:req.user.id, room, text,
      username:req.user.username, created_at:new Date(), edited:0, deleted:0,
      reply_to_id:reply_to_id||null, reply_to_text:reply_to_text||null, reply_to_username:reply_to_username||null
    });
  });
});

router.put('/:id', auth, (req, res) => {
  const { text } = req.body;
  req.db.query(
    'UPDATE messages SET text=?, edited=1 WHERE id=? AND user_id=?',
    [text, req.params.id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!result.affectedRows) return res.status(403).json({ message: 'Not authorized' });
      res.json({ message:'Edited', id:req.params.id, text, edited:1 });
    }
  );
});

router.delete('/:id', auth, (req, res) => {
  req.db.query('UPDATE messages SET deleted=1, text="This message was deleted" WHERE id=? AND user_id=?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message:'Deleted', id:req.params.id });
  });
});

router.get('/private/:userId', auth, (req, res) => {
  req.db.query(
    `SELECT pm.*, u.username, u.avatar_color, u.avatar_url FROM private_messages pm JOIN users u ON pm.from_user_id=u.id WHERE ((pm.from_user_id=? AND pm.to_user_id=?) OR (pm.from_user_id=? AND pm.to_user_id=?)) AND pm.deleted=0 ORDER BY pm.created_at ASC LIMIT 100`,
    [req.user.id, req.params.userId, req.params.userId, req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

router.post('/private', auth, (req, res) => {
  const { to_user_id, text, reply_to_id, reply_to_text, reply_to_username } = req.body;
  if (!to_user_id || !text) return res.status(400).json({ message: 'Required fields missing' });
  const ts = Date.now();
  const toId = parseInt(to_user_id);
  const fromId = parseInt(req.user.id);
  req.db.query(
    'INSERT INTO private_messages (from_user_id,to_user_id,text,reply_to_id,reply_to_text,reply_to_username) VALUES (?,?,?,?,?,?)',
    [fromId, toId, text, reply_to_id||null, reply_to_text||null, reply_to_username||null],
    (err, result) => {
    if (err) { console.error('DB error:', err.message); return res.status(500).json({ message: 'Database error: ' + err.message }); }
    req.db.query(
      `INSERT INTO unread_counts (user_id,ref_type,ref_id,count,last_message_time) VALUES (?,?,?,1,?) ON DUPLICATE KEY UPDATE count=count+1,last_message_time=?`,
      [toId, 'dm', String(fromId), ts, ts], () => {}
    );
    req.db.query(
      `INSERT INTO unread_counts (user_id,ref_type,ref_id,count,last_message_time) VALUES (?,?,?,0,?) ON DUPLICATE KEY UPDATE last_message_time=?`,
      [fromId, 'dm', String(toId), ts, ts], () => {}
    );
    res.status(201).json({
      id:result.insertId, from_user_id:fromId, to_user_id:toId, text,
      username:req.user.username, created_at:new Date(), edited:0, deleted:0,
      reply_to_id:reply_to_id||null, reply_to_text:reply_to_text||null, reply_to_username:reply_to_username||null
    });
  });
});

router.put('/private/:id', auth, (req, res) => {
  const { text } = req.body;
  req.db.query(
    'UPDATE private_messages SET text=?, edited=1 WHERE id=? AND from_user_id=?',
    [text, req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message:'Edited', id:req.params.id, text });
    }
  );
});

router.delete('/private/:id', auth, (req, res) => {
  req.db.query('UPDATE private_messages SET deleted=1, text="This message was deleted" WHERE id=? AND from_user_id=?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message:'Deleted', id:req.params.id });
  });
});

router.put('/private/:id/seen', auth, (req, res) => {
  req.db.query('UPDATE private_messages SET seen_at=NOW() WHERE id=? AND to_user_id=?', [req.params.id, req.user.id], err => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message:'Marked as seen' });
  });
});

router.post('/unread-increment', auth, (req, res) => {
  const { ref_type, ref_id, last_message_time, sender_id } = req.body;
  if (sender_id && Number(sender_id) === Number(req.user.id)) {
    return res.json({ message: 'Skipped - sender' });
  }
  req.db.query(
    `INSERT INTO unread_counts (user_id, ref_type, ref_id, count, last_message_time)
     VALUES (?,?,?,1,?)
     ON DUPLICATE KEY UPDATE count=count+1, last_message_time=?`,
    [req.user.id, ref_type, ref_id, last_message_time, last_message_time],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Updated' });
    }
  );
});

router.post('/unread-update-time', auth, (req, res) => {
  const { ref_type, ref_id, last_message_time } = req.body;
  req.db.query(
    `INSERT INTO unread_counts (user_id, ref_type, ref_id, count, last_message_time)
     VALUES (?,?,?,0,?)
     ON DUPLICATE KEY UPDATE last_message_time=?`,
    [req.user.id, ref_type, ref_id, last_message_time, last_message_time],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Updated' });
    }
  );
});

router.post('/unread-clear', auth, (req, res) => {
  const { ref_type, ref_id } = req.body;
  req.db.query(
    'UPDATE unread_counts SET count=0 WHERE user_id=? AND ref_type=? AND ref_id=?',
    [req.user.id, ref_type, ref_id],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Cleared' });
    }
  );
});

module.exports = router;