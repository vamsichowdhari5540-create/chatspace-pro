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
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(compression());
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});
// Makes `req.app.get('io')` available inside route files, so HTTP routes
// (like registration) can notify already-connected clients in real time
// without needing a separate socket connection of their own.
app.set('io', io);

app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));

app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const requestCounts = {};
app.use('/api', (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  if (!requestCounts[ip]) requestCounts[ip] = { count: 0, resetAt: now + 60000 };
  if (now > requestCounts[ip].resetAt) { requestCounts[ip] = { count: 0, resetAt: now + 60000 }; }
  requestCounts[ip].count++;
  if (requestCounts[ip].count > 200) {
    return res.status(429).json({ message: 'Too many requests, please slow down' });
  }
  next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/files', express.static(path.join(__dirname, 'uploads/files')));

app.use(express.static(path.join(__dirname, '../build')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/admin', require('./routes/admin'));

const onlineUsers = {};

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on('userOnline', (userData) => {
    // Remove any stale entries for this same user — e.g. a previous socket
    // that never cleanly fired 'disconnect' (network blip, ngrok tunnel
    // restart, etc). Without this, a reconnecting user can be routed to a
    // dead socket, which silently breaks calls to/from them.
    Object.keys(onlineUsers).forEach(sid => {
      if (sid !== socket.id && onlineUsers[sid].id === userData.id) {
        delete onlineUsers[sid];
      }
    });
    onlineUsers[socket.id] = { ...userData, socketId: socket.id };
    io.emit('onlineUsers', Object.values(onlineUsers));
    console.log(`✅ ${userData.username} (id ${userData.id}) online as socket ${socket.id}`);
  });

  socket.on('joinRoom', (room) => socket.join(room));
  socket.on('joinGroup', (groupId) => {
    const room = `group_${groupId}`;
    socket.join(room);
    console.log(`➕ Socket ${socket.id} joined ${room} (now ${io.sockets.adapter.rooms.get(room)?.size || 0} in room)`);
  });
  socket.on('leaveAllGroups', () => {
    socket.rooms.forEach(room => {
      if (room.startsWith('group_')) socket.leave(room);
    });
  });

  socket.on('sendMessage', (msg) => {
    const roomSize = io.sockets.adapter.rooms.get(msg.room)?.size || 0;
    console.log(`💬 sendMessage → room "${msg.room}" (${roomSize} socket(s) in room) from ${msg.username || msg.user_id}`);
    io.to(msg.room).emit('newMessage', msg);
  });

  socket.on('sendPrivateMessage', (msg) => {
    const target = Object.values(onlineUsers).find(u => Number(u.id) === Number(msg.to_user_id));
    console.log(`💬 sendPrivateMessage → user ${msg.to_user_id}: ${target ? `target online, relaying to socket ${target.socketId}` : '⚠️  target NOT in onlineUsers (offline or stale)'}`);
    if (target) io.to(target.socketId).emit('newPrivateMessage', msg);
    socket.emit('newPrivateMessage', msg);
  });

  socket.on('sendGroupMessage', (msg) => {
    const room = `group_${msg.group_id}`;
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
    console.log(`💬 sendGroupMessage → ${room} (${roomSize} socket(s) in room) from ${msg.username || msg.user_id}`);
    io.to(room).emit('newGroupMessage', msg);
  });

  socket.on('typing', ({ room, username, isTyping }) => {
    socket.to(room).emit('userTyping', { username, isTyping, room });
  });

  socket.on('addReaction', (data) => {
    const { messageId, emoji, userId, username, room, toUserId } = data;
    console.log(`👍 addReaction: msg ${messageId}, emoji ${emoji}, from ${username} (user ${userId}), room=${room || 'none'}, toUserId=${toUserId || 'none'}`);
    if (!global.reactions) global.reactions = {};
    if (!global.reactions[messageId]) global.reactions[messageId] = {};
    const msgReactions = global.reactions[messageId];
    if (!msgReactions[emoji]) msgReactions[emoji] = [];
    const existing = msgReactions[emoji].findIndex(u => u.userId === userId);
    if (existing >= 0) msgReactions[emoji].splice(existing, 1);
    else msgReactions[emoji].push({ userId, username });
    if (msgReactions[emoji].length === 0) delete msgReactions[emoji];
    if (room) {
      io.to(room).emit('messageReaction', { messageId, reactions: msgReactions });
    } else if (toUserId) {
      const target = Object.values(onlineUsers).find(u => Number(u.id) === Number(toUserId));
      console.log(`   → DM reaction target: ${target ? `found, relaying to socket ${target.socketId}` : '⚠️  NOT FOUND in onlineUsers'}`);
      if (target) io.to(target.socketId).emit('messageReaction', { messageId, reactions: msgReactions });
    } else {
      io.emit('messageReaction', { messageId, reactions: msgReactions });
    }
  });

  socket.on('editMessage', (data) => io.emit('messageEdited', data));
  socket.on('roleUpdated', ({ userId, role }) => {
    const target = Object.values(onlineUsers).find(u => Number(u.id) === Number(userId));
    if (target) {
      io.to(target.socketId).emit('roleUpdated', { userId, role });
      console.log(`✅ Role updated for user ${userId} to ${role}`);
    }
  });

  socket.on('groupCreated', ({ group, memberUsernames }) => {
    Object.values(onlineUsers).forEach(u => {
      if (memberUsernames && memberUsernames.includes(u.username)) {
        io.to(u.socketId).emit('groupCreated', { group });
      }
    });
    socket.emit('groupCreated', { group });
  });

  socket.on('memberAdded', ({ group, username }) => {
    const target = Object.values(onlineUsers).find(u => u.username === username);
    if (target) {
      io.to(target.socketId).emit('memberAdded', { group });
      console.log(`➕ Notified ${username} they were added to group "${group?.name}"`);
    } else {
      console.log(`➕ ${username} added to group "${group?.name}" but is offline — they'll see it on next login`);
    }
  });

  socket.on('groupDeleted', ({ groupId, memberIds }) => {
    if (memberIds && memberIds.length) {
      const memberIdsNum = memberIds.map(Number);
      Object.values(onlineUsers).forEach(u => {
        if (memberIdsNum.includes(Number(u.id))) {
          io.to(u.socketId).emit('groupDeleted', { groupId });
        }
      });
    } else {
      io.emit('groupDeleted', { groupId });
    }
  });

  socket.on('deleteMessage', (data) => io.emit('messageDeleted', data));
  socket.on('messageSeen', (data) => io.emit('messageSeen', data));
  socket.on('groupMessageSeen', ({ messageId, groupId, userId, username }) => {
    // Broadcast to everyone else currently in the group room so their
    // "Seen by X of Y" indicator updates immediately, instead of only
    // catching up whenever something else happens to refetch from the DB.
    const room = `group_${groupId}`;
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
    console.log(`👀 groupMessageSeen: msg ${messageId} seen by ${username} (user ${userId}) in group ${groupId} — relaying to ${roomSize - 1} other socket(s) in ${room}`);
    socket.to(room).emit('groupMessageSeen', { messageId, userId, username });
  });

  socket.on('callUser', ({ toUserId, callType, fromUser, offer }) => {
    const target = Object.values(onlineUsers).find(u => Number(u.id) === Number(toUserId));
    if (target) {
      io.to(target.socketId).emit('incomingCall', { from: socket.id, fromUser, callType, offer });
      console.log(`📞 Call routed: ${fromUser?.username} -> user ${toUserId} (${callType})`);
    } else {
      console.log(`⚠️  Call failed: target user ${toUserId} not found in onlineUsers (offline or stale)`);
    }
  });
  socket.on('acceptCall', ({ to, answer }) => io.to(to).emit('callAccepted', { answer }));
  socket.on('rejectCall', ({ to }) => io.to(to).emit('callRejected'));
  socket.on('callEnded', ({ to }) => { if (to) io.to(to).emit('callEnded'); });
  socket.on('iceCandidate', ({ to, candidate }) => io.to(to).emit('iceCandidate', { candidate }));
  socket.on('missedCall', ({ to, fromUser, callType }) => io.to(to).emit('missedCallMessage', { fromUser, callType }));

  socket.on('disconnect', () => {
    if (onlineUsers[socket.id]) console.log(`🔌 ${onlineUsers[socket.id].username} disconnected`);
    delete onlineUsers[socket.id];
    io.emit('onlineUsers', Object.values(onlineUsers));
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));