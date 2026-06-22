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
 * KEY ROTATION ON MEMBER REMOVAL: removing a member leaves their old key
 * copy in group_keys (harmless on its own since they're no longer fetched
 * into the room) but for true forward-secrecy the admin should rotate the
 * key afterward so future messages use a key the removed member never
 * had. This route flags keyRotationRecommended:true; Chat.js reads that
 * flag and auto-triggers /:id/key/rotate again with a fresh key encrypted
 * only for the remaining members, IF the group currently has encryption
 * enabled.
 *
 * GROUP READ RECEIPTS: group_message_reads records (message_id, user_id,
 * seen_at) — one row per member per message they've viewed. A group
 * message's "seen" state is a count out of total members, surfaced via
 * GET /:id/messages/reads.
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
  const { name, memberUsernames, memberKeys } = req.body;
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

        const finishUp = () => {
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
              res.status(201).json({ ...rows[0], is_encrypted: !!(memberKeys && memberKeys.length) });
            }
          );
        };

        if (memberKeys && memberKeys.length) {
          const keyVals = memberKeys.map(m => [groupId, m.userId, m.encryptedKey, 1]);
          req.db.query(
            'INSERT INTO group_keys (group_id, user_id, encrypted_key, key_version) VALUES ?',
            [keyVals],
            (err2) => {
              if (err2) { console.error('Group key setup error:', err2.message); finishUp(); return; }
              req.db.query('UPDATE groups_table SET is_encrypted=1 WHERE id=?', [groupId], () => finishUp());
            }
          );
        } else {
          finishUp();
        }
      });
    });
  });
});

// ── E2E: GET MY COPY OF A GROUP'S ENCRYPTION KEY ──
router.get('/:id/key', auth, (req, res) => {
  req.db.query(
    'SELECT encrypted_key, key_version FROM group_keys WHERE group_id=? AND user_id=? ORDER BY key_version DESC LIMIT 1',
    [req.params.id, req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!rows.length) return res.status(404).json({ message: 'No encryption key found for you in this group' });
      res.json({ encryptedKey: rows[0].encrypted_key, keyVersion: rows[0].key_version });
    }
  );
});

// ── E2E: ROTATE GROUP KEY (enable encryption / rotate after member removal) ──
router.post('/:id/key/rotate', auth, (req, res) => {
  const { memberKeys } = req.body;
  if (!Array.isArray(memberKeys) || !memberKeys.length) return res.status(400).json({ message: 'memberKeys required' });
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.id], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ message: 'Group not found' });
    if (rows[0].admin_id !== req.user.id) return res.status(403).json({ message: 'Only group admin can rotate the encryption key' });
    req.db.query('SELECT MAX(key_version) as v FROM group_keys WHERE group_id=?', [req.params.id], (err2, vrows) => {
      if (err2) return res.status(500).json({ message: 'Database error' });
      const nextVersion = (vrows[0]?.v || 0) + 1;
      const vals = memberKeys.map(m => [req.params.id, m.userId, m.encryptedKey, nextVersion]);
      req.db.query('INSERT INTO group_keys (group_id, user_id, encrypted_key, key_version) VALUES ?', [vals], (err3) => {
        if (err3) return res.status(500).json({ message: 'Database error: ' + err3.message });
        req.db.query('UPDATE groups_table SET is_encrypted=1 WHERE id=?', [req.params.id], () => {
          console.log(`Group ${req.params.id} key rotated to version ${nextVersion}, encryption ON`);
          res.json({ message: 'Key rotated', keyVersion: nextVersion });
        });
      });
    });
  });
});

// ── E2E: DISABLE encryption for this group (going forward only) ──
router.put('/:id/encryption/disable', auth, (req, res) => {
  req.db.query('SELECT admin_id FROM groups_table WHERE id=?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!rows.length) return res.status(404).json({ message: 'Group not found' });
    if (rows[0].admin_id !== req.user.id) return res.status(403).json({ message: 'Only group admin can disable encryption' });
    req.db.query('UPDATE groups_table SET is_encrypted=0 WHERE id=?', [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ message: 'Database error' });
      console.log(`Group ${req.params.id} encryption disabled (existing messages unaffected)`);
      res.json({ message: 'Encryption disabled for new messages. Existing encrypted messages are unaffected.' });
    });
  });
});

// ── GET GROUP MEMBERS ──
router.get('/:id/members', auth, (req, res) => {
  req.db.query(
    `SELECT u.id, u.username, u.avatar_color, u.avatar_url, u.role, u.status, u.user_code, u.public_key
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
router.post('/:id/messages', auth, (req, res) => {
  const { text, ciphertext, iv, reply_to_id, reply_to_text, reply_to_username } = req.body;
  const isEncrypted = !!(ciphertext && iv);
  if (!text && !isEncrypted) return res.status(400).json({ message: 'Text (or ciphertext+iv) required' });
  const ts = Date.now();
  const groupId = req.params.id;
  req.db.query(
    'INSERT INTO group_messages (group_id, user_id, text, ciphertext, iv, is_encrypted, reply_to_id, reply_to_text, reply_to_username) VALUES (?,?,?,?,?,?,?,?,?)',
    [groupId, req.user.id, isEncrypted ? null : text, ciphertext||null, iv||null, isEncrypted?1:0, reply_to_id||null, reply_to_text||null, reply_to_username||null],
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
        text: isEncrypted ? null : text, ciphertext: ciphertext||null, iv: iv||null, is_encrypted: isEncrypted?1:0,
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

// ── E2E: SHARE EXISTING GROUP KEY WITH A NEWLY ADDED MEMBER ──
router.post('/:id/key/share', auth, (req, res) => {
  const { userId, encryptedKey } = req.body;
  if (!userId || !encryptedKey) return res.status(400).json({ message: 'userId and encryptedKey required' });
  req.db.query('SELECT MAX(key_version) as v FROM group_keys WHERE group_id=?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    const version = rows[0]?.v || 1;
    req.db.query(
      'INSERT INTO group_keys (group_id, user_id, encrypted_key, key_version) VALUES (?,?,?,?)',
      [req.params.id, userId, encryptedKey, version],
      (err2) => {
        if (err2) return res.status(500).json({ message: 'Database error' });
        res.json({ message: 'Key shared with new member' });
      }
    );
  });
});

// ── REMOVE MEMBER ──
router.delete('/:id/members/:userId', auth, (req, res) => {
  req.db.query('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.params.userId], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Member removed', keyRotationRecommended: true });
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
        req.db.query('DELETE FROM group_keys WHERE group_id=?', [req.params.id], () => {
          req.db.query('DELETE FROM groups_table WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            console.log(`Group ${req.params.id} deleted`);
            res.json({ message: 'Group deleted' });
          });
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