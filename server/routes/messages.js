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
 * E2E ENCRYPTION NOTE:
 * Routes now accept ciphertext + iv instead of plaintext `text`.
 * The server NEVER sees plaintext message content for encrypted
 * rooms/DMs/groups. `text` column is kept for backward compatibility
 * but is left NULL for encrypted messages — only ciphertext+iv exist.
 * Encryption/decryption happens entirely in the browser (see crypto.js).
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── AUTH MIDDLEWARE ──
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

// ── ENSURE DIRS EXIST ──
const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true }); };
const imagesDir = path.join(__dirname, '../uploads/images');
ensureDir(imagesDir);

// ── MULTER ──
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

// ── IMAGE UPLOAD ──
// NOTE: Image files themselves are NOT end-to-end encrypted in this version
// (encrypting binary files adds significant complexity — chunked encryption,
// streaming decryption for display, etc). Only text messages are E2E encrypted.
// This is called out explicitly so it's not a hidden security gap.
router.post('/upload-image', auth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) { console.error('Upload error:', err.message); return res.status(500).json({ message: err.message || 'Upload failed' }); }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const imageUrl = `/uploads/images/${req.file.filename}`;
    console.log('✅ Image uploaded:', imageUrl);
    res.json({ image_url: imageUrl });
  });
});

// ── FILE UPLOAD ──
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

// ── GET UNREAD COUNTS (must be before /:room) ──
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

// ── E2E ENCRYPTION: GET CHANNEL ENCRYPTION KEY (my copy, encrypted with my public key) ──
router.get('/channel-key/:channelName', auth, (req, res) => {
  req.db.query(
    'SELECT encrypted_key, key_version FROM channel_keys WHERE channel_name=? AND user_id=? ORDER BY key_version DESC LIMIT 1',
    [req.params.channelName, req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!rows.length) return res.status(404).json({ message: 'No key found — ask admin to set up encryption for this channel' });
      res.json({ encryptedKey: rows[0].encrypted_key, keyVersion: rows[0].key_version });
    }
  );
});

// ── E2E ENCRYPTION: ADMIN SETS UP / ROTATES A CHANNEL'S SHARED KEY ──
// Body: { channelName, memberKeys: [{ userId, encryptedKey }, ...] }
// The browser does the actual encryption (one AES key, encrypted per member's public RSA key);
// this route just stores the results.
router.post('/channel-key/setup', auth, (req, res) => {
  const { channelName, memberKeys } = req.body;
  if (!channelName || !Array.isArray(memberKeys) || !memberKeys.length) {
    return res.status(400).json({ message: 'channelName and memberKeys required' });
  }
  req.db.query(
    'SELECT MAX(key_version) as v FROM channel_keys WHERE channel_name=?',
    [channelName],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      const nextVersion = (rows[0]?.v || 0) + 1;
      const vals = memberKeys.map(m => [channelName, m.userId, m.encryptedKey, nextVersion]);
      req.db.query(
        'INSERT INTO channel_keys (channel_name, user_id, encrypted_key, key_version) VALUES ?',
        [vals],
        (err2) => {
          if (err2) return res.status(500).json({ message: 'Database error: ' + err2.message });
          res.json({ message: 'Channel key set up', keyVersion: nextVersion, memberCount: memberKeys.length });
        }
      );
    }
  );
});

// ── GET CHANNEL MESSAGES ──
router.get('/:room', auth, (req, res) => {
  if (req.params.room === 'private') return res.status(400).json({ message: 'Use /private/:userId' });
  req.db.query(
    `SELECT m.*, u.username, u.avatar_color, u.avatar_url FROM messages m JOIN users u ON m.user_id=u.id WHERE m.room=? AND m.deleted=0 ORDER BY m.created_at ASC LIMIT 100`,
    [req.params.room],
    (err, rows) => {
      if (err) { console.error('DB error:', err.message); return res.status(500).json({ message: 'Database error: ' + err.message }); }
      res.json(rows);
      // rows now include: text (legacy/plaintext, null if encrypted), ciphertext, iv, is_encrypted
      // Frontend decrypts ciphertext+iv using the channel's shared AES key when is_encrypted=1
    }
  );
});

// ── SEND CHANNEL MESSAGE ──
// E2E CHANGE: accepts either plaintext `text` (legacy/non-encrypted rooms) OR
// `ciphertext` + `iv` (encrypted). Never both — `is_encrypted` flag tells the
// frontend which one to expect when rendering.
router.post('/', auth, (req, res) => {
  const { room, text, ciphertext, iv, reply_to_id, reply_to_text, reply_to_username } = req.body;
  const isEncrypted = !!(ciphertext && iv);
  if (!room || (!text && !isEncrypted)) return res.status(400).json({ message: 'Room and text (or ciphertext+iv) required' });
  const ts = Date.now();
  req.db.query(
    'INSERT INTO messages (user_id,room,text,ciphertext,iv,is_encrypted,reply_to_id,reply_to_text,reply_to_username) VALUES (?,?,?,?,?,?,?,?,?)',
    [req.user.id, room, isEncrypted ? null : text, ciphertext || null, iv || null, isEncrypted ? 1 : 0, reply_to_id||null, reply_to_text||null, reply_to_username||null],
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
      id:result.insertId, user_id:req.user.id, room,
      text: isEncrypted ? null : text, ciphertext: ciphertext||null, iv: iv||null, is_encrypted: isEncrypted ? 1 : 0,
      username:req.user.username, created_at:new Date(), edited:0, deleted:0,
      reply_to_id:reply_to_id||null, reply_to_text:reply_to_text||null, reply_to_username:reply_to_username||null
    });
  });
});

// ── EDIT CHANNEL MESSAGE ──
// E2E CHANGE: edited content is re-encrypted client-side, so this accepts ciphertext+iv too.
router.put('/:id', auth, (req, res) => {
  const { text, ciphertext, iv } = req.body;
  const isEncrypted = !!(ciphertext && iv);
  req.db.query(
    'UPDATE messages SET text=?, ciphertext=?, iv=?, is_encrypted=?, edited=1 WHERE id=? AND user_id=?',
    [isEncrypted ? null : text, ciphertext||null, iv||null, isEncrypted?1:0, req.params.id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!result.affectedRows) return res.status(403).json({ message: 'Not authorized' });
      res.json({ message:'Edited', id:req.params.id, text, ciphertext, iv, is_encrypted: isEncrypted?1:0, edited:1 });
    }
  );
});

// ── DELETE CHANNEL MESSAGE ──
router.delete('/:id', auth, (req, res) => {
  req.db.query('UPDATE messages SET deleted=1, text="This message was deleted", ciphertext=NULL, iv=NULL WHERE id=? AND user_id=?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message:'Deleted', id:req.params.id });
  });
});

// ── GET PRIVATE MESSAGES ──
router.get('/private/:userId', auth, (req, res) => {
  req.db.query(
    `SELECT pm.*, u.username, u.avatar_color, u.avatar_url FROM private_messages pm JOIN users u ON pm.from_user_id=u.id WHERE ((pm.from_user_id=? AND pm.to_user_id=?) OR (pm.from_user_id=? AND pm.to_user_id=?)) AND pm.deleted=0 ORDER BY pm.created_at ASC LIMIT 100`,
    [req.user.id, req.params.userId, req.params.userId, req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
      // Each row: ciphertext, iv, encrypted_key_sender, encrypted_key_recipient, is_encrypted
      // Frontend picks encrypted_key_sender or encrypted_key_recipient depending on
      // whether the logged-in user is from_user_id or to_user_id, then decrypts with
      // their own RSA private key to get the AES key, then decrypts ciphertext.
    }
  );
});

// ── SEND PRIVATE MESSAGE ──
// E2E CHANGE: requires encrypted_key_sender + encrypted_key_recipient when encrypted,
// since a DM's AES key must be readable by BOTH parties (each via their own RSA key).
router.post('/private', auth, (req, res) => {
  const { to_user_id, text, ciphertext, iv, encrypted_key_sender, encrypted_key_recipient, reply_to_id, reply_to_text, reply_to_username } = req.body;
  const isEncrypted = !!(ciphertext && iv && encrypted_key_sender && encrypted_key_recipient);
  if (!to_user_id || (!text && !isEncrypted)) return res.status(400).json({ message: 'Required fields missing' });
  const ts = Date.now();
  const toId = parseInt(to_user_id);
  const fromId = parseInt(req.user.id);
  req.db.query(
    'INSERT INTO private_messages (from_user_id,to_user_id,text,ciphertext,iv,encrypted_key_sender,encrypted_key_recipient,is_encrypted,reply_to_id,reply_to_text,reply_to_username) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [fromId, toId, isEncrypted ? null : text, ciphertext||null, iv||null, encrypted_key_sender||null, encrypted_key_recipient||null, isEncrypted?1:0, reply_to_id||null, reply_to_text||null, reply_to_username||null],
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
      id:result.insertId, from_user_id:fromId, to_user_id:toId,
      text: isEncrypted ? null : text, ciphertext: ciphertext||null, iv: iv||null,
      encrypted_key_sender: encrypted_key_sender||null, encrypted_key_recipient: encrypted_key_recipient||null,
      is_encrypted: isEncrypted?1:0,
      username:req.user.username, created_at:new Date(), edited:0, deleted:0,
      reply_to_id:reply_to_id||null, reply_to_text:reply_to_text||null, reply_to_username:reply_to_username||null
    });
  });
});

// ── EDIT PRIVATE MESSAGE ──
router.put('/private/:id', auth, (req, res) => {
  const { text, ciphertext, iv, encrypted_key_sender, encrypted_key_recipient } = req.body;
  const isEncrypted = !!(ciphertext && iv);
  req.db.query(
    'UPDATE private_messages SET text=?, ciphertext=?, iv=?, encrypted_key_sender=?, encrypted_key_recipient=?, is_encrypted=?, edited=1 WHERE id=? AND from_user_id=?',
    [isEncrypted?null:text, ciphertext||null, iv||null, encrypted_key_sender||null, encrypted_key_recipient||null, isEncrypted?1:0, req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message:'Edited', id:req.params.id, text, ciphertext, iv, is_encrypted: isEncrypted?1:0 });
    }
  );
});

// ── DELETE PRIVATE MESSAGE ──
router.delete('/private/:id', auth, (req, res) => {
  req.db.query('UPDATE private_messages SET deleted=1, text="This message was deleted", ciphertext=NULL, iv=NULL WHERE id=? AND from_user_id=?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message:'Deleted', id:req.params.id });
  });
});

// ── MARK AS SEEN ──
router.put('/private/:id/seen', auth, (req, res) => {
  req.db.query('UPDATE private_messages SET seen_at=NOW() WHERE id=? AND to_user_id=?', [req.params.id, req.user.id], err => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message:'Marked as seen' });
  });
});

// ── INCREMENT UNREAD COUNT (receiver only) ──
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

// ── UPDATE LAST MESSAGE TIME (for ordering, without incrementing count) ──
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

// ── CLEAR UNREAD COUNT ──
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