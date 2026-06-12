require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── ROUTES ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/admin', require('./routes/admin'));

// ── SOCKET.IO ──
const onlineUsers = {};

io.on('connection', (socket) => {
  socket.on('userOnline', (userData) => {
    onlineUsers[socket.id] = { ...userData, socketId: socket.id };
    io.emit('onlineUsers', Object.values(onlineUsers));
  });

  socket.on('joinRoom', (room) => socket.join(room));
  socket.on('joinGroup', (groupId) => socket.join(`group_${groupId}`));

  socket.on('sendMessage', (msg) => {
    io.to(msg.room).emit('newMessage', msg);
  });

  socket.on('sendPrivateMessage', (msg) => {
    const target = Object.values(onlineUsers).find(u => u.id === msg.to_user_id);
    if (target) io.to(target.socketId).emit('newPrivateMessage', msg);
    socket.emit('newPrivateMessage', msg);
  });

  socket.on('sendGroupMessage', (msg) => {
    io.to(`group_${msg.group_id}`).emit('newGroupMessage', msg);
  });

  socket.on('typing', ({ room, username, isTyping }) => {
    socket.to(room).emit('userTyping', { username, isTyping });
  });

  socket.on('addReaction', (data) => {
    io.to(data.room || socket.id).emit('messageReaction', data);
  });

  socket.on('editMessage', (data) => io.emit('messageEdited', data));
  socket.on('deleteMessage', (data) => io.emit('messageDeleted', data));
  socket.on('messageSeen', (data) => io.emit('messageSeen', data));

  // ── WebRTC ──
  socket.on('callUser', ({ toUserId, callType, fromUser, offer }) => {
    const target = Object.values(onlineUsers).find(u => u.id === toUserId);
    if (target) io.to(target.socketId).emit('incomingCall', { from: socket.id, fromUser, callType, offer });
  });
  socket.on('acceptCall', ({ to, answer }) => io.to(to).emit('callAccepted', { answer }));
  socket.on('rejectCall', ({ to }) => io.to(to).emit('callRejected'));
  socket.on('callEnded', ({ to }) => { if (to) io.to(to).emit('callEnded'); });
  socket.on('iceCandidate', ({ to, candidate }) => io.to(to).emit('iceCandidate', { candidate }));
  socket.on('missedCall', ({ to, fromUser }) => io.to(to).emit('missedCallMessage', { fromUser }));

  socket.on('disconnect', () => {
    delete onlineUsers[socket.id];
    io.emit('onlineUsers', Object.values(onlineUsers));
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));