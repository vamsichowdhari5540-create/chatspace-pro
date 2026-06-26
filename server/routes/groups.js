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
 * GROUPS ARE PLAINTEXT (reverted from E2E encryption): group-level
 * end-to-end encryption — the manual toggle, automatic encryption on
 * creation, key rotation on member add/remove, and the auto-encrypt-on-
 * login catch-up — has been fully removed after repeated, hard-to-debug
 * client-side key-caching issues made it unreliable in practice. Only
 * Direct Messages remain end-to-end encrypted; channels were never
 * encrypted by design (public broadcast spaces). The
 * ciphertext/iv/is_encrypted columns on group_messages remain in place
 * for backward compatibility with any old encrypted messages already in
 * the database, but new messages are always sent and stored as plain
 * `text`.
 *
 * GROUP READ RECEIPTS: group_message_reads records (message_id, user_id,
 * seen_at) — one row per member per message they've viewed. A group
 * message's "seen" state is a count out of total members, surfaced via
 * GET /:id/messages/reads. Unrelated to encryption, remains fully intact.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getCompanyDb } = require('../config/db_manager');

// ── AUTH ──
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    req.db = req.user.dbName ? getCompanyDb(req.user.dbName) : require('../config/db');
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
};

// ── GET ALL GROUPS FOR USER ──
router.get('/', auth, (req, res) => {
  req.db.query(
    `SELECT g.*, u.username as admin_username 
     FROM groups_table g
     JOIN group_members gm ON g.id = gm.group_id
     JOIN users u ON g.admin_id = u.id
     WHERE gm.user_id = ?
     ORDER BY g.created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) { console.error('Get groups error:', err.message); return res.status(500).json({ message: 'Database error' }); }
      res.json(rows);
    }
  );
});

// ── CREATE GROUP ──
router.post('/', auth, (req, res) => {
  const { name, memberUsernames } = req.body;
  if (!name || !memberUsernames?.length) return res.status(400).json({ message: 'Name and members required' });

  const placeholders = memberUsernames.map(() => '?').join(',');
  req.db.query(`SELECT id, username FROM users WHERE username IN (${placeholders})`, memberUsernames, (err, found) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    const notFound = memberUsernames.filter(u => !found.find(f => f.username.toLowerCase() === u.toLowerCase()));
    if (notFound.length) return res.status(400).json({ message: `Users not found: ${notFound.join(', ')}` });

    req.db.query('INSERT INTO groups_table (name, admin_id) VALUES (?,?)', [name, req.user.id], (err, result) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      const groupId = result.insertId;

      const allMemberIds = [req.user.id, ...found.map(f => f.id).filter(id => id !== req.user.id)];
      const memberValues = allMemberIds.map(id => [groupId, id]);

      req.db.query('INSERT INTO group_members (group_id, user_id) VALUES ?', [memberValues], (err) => {
        if (err) { console.error('Add members error:', err.message); return res.status(500).json({ message: 'Failed to add members' }); }

        req.db.query(
          `SELECT g.*, u.username as admin_username, COUNT(gm.user_id) as member_count
           FROM groups_table g
           JOIN users u ON g.admin_id = u.id
           JOIN group_members gm ON g.id = gm.group_id
           WHERE g.id = ?
           GROUP BY g.id`,
          [groupId],
          (err, rows) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            console.log(`Group "${name}" created with ${allMemberIds.length} members`);
            res.status(201).json(rows[0]);
          }
        );
      });
    });
  });
});

// ── GET GROUP MEMBERS ──
router.get('/:id/members', auth, (req, res) => {
  req.db.query(
    `SELECT u.id, u.username, u.avatar_color, u.avatar_url, u.role, u.status, u.user_code
     FROM users u
     JOIN group_members gm ON u.id = gm.user_id
     WHERE gm.group_id = ?`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

// ── GET GROUP MESSAGES ──
router.get('/:id/messages', auth, (req, res) => {
  req.db.query(
    `SELECT gm.*, u.username, u.avatar_color, u.avatar_url
     FROM group_messages gm
     JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = ? AND gm.deleted = 0
     ORDER BY gm.created_at ASC LIMIT 100`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

// ── SEND GROUP MESSAGE ──
// Always plaintext now. The ciphertext/iv/is_encrypted columns remain in
// the table for backward compatibility with old encrypted rows already
// stored, but new inserts never populate them.
router.post('/:id/messages', auth, (req, res) => {
  const { text, reply_to_id, reply_to_text, reply_to_username } = req.body;
  if (!text) return res.status(400).json({ message: 'Text required' });
  const ts = Date.now();
  const groupId = req.params.id;
  req.db.query(
    'INSERT INTO group_messages (group_id, user_id, text, reply_to_id, reply_to_text, reply_to_username) VALUES (?,?,?,?,?,?)',
    [groupId, req.user.id, text, reply_to_id||null, reply_to_text||null, reply_to_username||null],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Database error' });

      req.db.query(
        'SELECT user_id FROM group_members WHERE group_id=? AND user_id!=?',
        [groupId, req.user.id],
        (err2, members) => {
          if (!err2 && members.length) {
            const values = members.map(m => [m.user_id, 'group', String(groupId), 1, ts]);
            req.db.query(
              `INSERT INTO unread_counts (user_id, ref_type, ref_id, count, last_message_time)
               VALUES ? ON DUPLICATE KEY UPDATE count=count+1, last_message_time=?`,
              [values, ts], () => {}
            );
          }
        }
      );

      // Sender automatically counts as having "seen" their own message
      req.db.query(
        'INSERT IGNORE INTO group_message_reads (message_id, user_id) VALUES (?,?)',
        [result.insertId, req.user.id],
        () => {}
      );

      res.status(201).json({
        id: result.insertId, group_id: groupId, user_id: req.user.id,
        text,
        username: req.user.username, created_at: new Date(), edited: 0, deleted: 0,
        reply_to_id:reply_to_id||null, reply_to_text:reply_to_text||null, reply_to_username:reply_to_username||null
      });
    }
  );
});

// ── DELETE GROUP MESSAGE ──
router.delete('/:id/messages/:msgId', auth, (req, res) => {
  req.db.query(
    'UPDATE group_messages SET deleted=1, text="This message was deleted", ciphertext=NULL, iv=NULL WHERE id=? AND user_id=?',
    [req.params.msgId, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Deleted' });
    }
  );
});

// ── GROUP READ RECEIPTS: mark a message as seen by me ──
router.post('/:id/messages/:msgId/seen', auth, (req, res) => {
  req.db.query(
    'INSERT IGNORE INTO group_message_reads (message_id, user_id) VALUES (?,?)',
    [req.params.msgId, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Marked as seen' });
    }
  );
});

// ── GROUP READ RECEIPTS: mark ALL currently-loaded messages as seen by me ──
router.post('/:id/messages/seen-bulk', auth, (req, res) => {
  const { messageIds } = req.body;
  if (!Array.isArray(messageIds) || !messageIds.length) return res.json({ message: 'Nothing to mark' });
  const values = messageIds.map(id => [id, req.user.id]);
  req.db.query(
    'INSERT IGNORE INTO group_message_reads (message_id, user_id) VALUES ?',
    [values],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Marked as seen', count: messageIds.length });
    }
  );
});

// ── GROUP READ RECEIPTS: get read status for messages in a group ──
router.get('/:id/messages/reads', auth, (req, res) => {
  const idsParam = req.query.messageIds;
  if (!idsParam) return res.json({});
  const messageIds = idsParam.split(',').map(Number).filter(n => !isNaN(n));
  if (!messageIds.length) return res.json({});
  const placeholders = messageIds.map(() => '?').join(',');
  req.db.query(
    `SELECT r.message_id, r.user_id, r.seen_at, u.username
     FROM group_message_reads r
     JOIN users u ON r.user_id = u.id
     WHERE r.message_id IN (${placeholders})`,
    messageIds,
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      const grouped = {};
      rows.forEach(row => {
        if (!grouped[row.message_id]) grouped[row.message_id] = [];
        grouped[row.message_id].push({ userId: row.user_id, username: row.username, seenAt: row.seen_at });
      });
      res.json(grouped);
    }
  );
});

// ── ADD MEMBER ──
router.post('/:id/members', auth, (req, res) => {
  const { userId, username } = req.body;
  if (userId) {
    req.db.query('INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?,?)', [req.params.id, userId], (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Member added' });
    });
  } else if (username) {
    req.db.query('SELECT id FROM users WHERE username=?', [username], (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!rows.length) return res.status(404).json({ message: 'User not found' });
      req.db.query('INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?,?)', [req.params.id, rows[0].id], (err) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({ message: 'Member added' });
      });
    });
  } else {
    res.status(400).json({ message: 'userId or username required' });
  }
});

// ── REMOVE MEMBER ──
router.delete('/:id/members/:userId', auth, (req, res) => {
  req.db.query('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.params.userId], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Member removed' });
  });
});

// ── DELETE GROUP (admin only) ──
router.delete('/:id', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!rows.length) return res.status(404).json({ message: 'Group not found' });
    if (rows[0].admin_id !== req.user.id) return res.status(403).json({ message: 'Only group admin can delete' });

    req.db.query('DELETE FROM group_messages WHERE group_id=?', [req.params.id], () => {
      req.db.query('DELETE FROM group_members WHERE group_id=?', [req.params.id], () => {
        req.db.query('DELETE FROM groups_table WHERE id=?', [req.params.id], (err) => {
          if (err) return res.status(500).json({ message: 'Database error' });
          console.log(`Group ${req.params.id} deleted`);
          res.json({ message: 'Group deleted' });
        });
      });
    });
  });
});

// ── GET PINNED MESSAGES ──
router.get('/:id/pinned', auth, (req, res) => {
  req.db.query(
    `SELECT gm.* FROM group_messages gm
     JOIN pinned_messages pm ON gm.id = pm.message_id
     WHERE pm.group_id = ? AND gm.deleted = 0
     ORDER BY pm.created_at DESC`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    }
  );
});

// ── PIN MESSAGE ──
router.post('/:id/pin/:msgId', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.id], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ message: 'Group not found' });
    if (rows[0].admin_id !== req.user.id) return res.status(403).json({ message: 'Only admin can pin messages' });
    req.db.query(
      'INSERT IGNORE INTO pinned_messages (group_id, message_id, pinned_by) VALUES (?,?,?)',
      [req.params.id, req.params.msgId, req.user.id],
      (err) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({ message: 'Message pinned' });
      }
    );
  });
});

// ── MAKE ADMIN ──
router.put('/:id/make-admin/:userId', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.id], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ message: 'Group not found' });
    if (rows[0].admin_id !== req.user.id) return res.status(403).json({ message: 'Only admin can transfer admin' });
    req.db.query('UPDATE groups_table SET admin_id=? WHERE id=?', [req.params.userId, req.params.id], (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      console.log(`Group ${req.params.id} admin changed to ${req.params.userId}`);
      res.json({ message: 'Admin transferred', newAdminId: parseInt(req.params.userId) });
    });
  });
});

// ── LEAVE GROUP ──
router.delete('/:id/leave', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.id], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ message: 'Group not found' });
    if (rows[0].admin_id === req.user.id) return res.status(400).json({ message: 'Admin cannot leave. Transfer admin first or delete the group.' });
    req.db.query('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.user.id], (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Left group' });
    });
  });
});

// ── UPDATE GROUP NAME ──
router.put('/:id', auth, (req, res) => {
  const { name } = req.body;
  req.db.query('UPDATE groups_table SET name=? WHERE id=? AND admin_id=?', [name, req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Group updated' });
  });
});

module.exports = router;