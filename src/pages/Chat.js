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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash, Plus, Search, Sun, Moon, LogOut,
  Send, Paperclip, Smile, Reply, X,
  Users, Info, CheckCheck, Shield,
  Phone, Video, PhoneOff, VideoOff, Mic, MicOff,
  PhoneMissed, Edit2, Trash2, Forward, Pin,
  Bell, BellOff, UserX, UserCheck, Clock,
  Check, User, Save, Settings, Camera
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useE2EEncryption } from '../hooks/useE2EEncryption';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import EmojiPicker from 'emoji-picker-react';

const API = 'https://gong-unbend-chief.ngrok-free.dev/api';
const formatUID = (id) => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letterIndex = Math.floor((id - 1) / 9999) % 26;
  const letter = letters[letterIndex];
  return `CSP-${letter}-${String(id).padStart(6,'0')}`;
};
const CHANNELS = ['announcements', 'tech-updates', 'job-notifications'];
let socket;

const STATUS_CONFIG = {
  online: { color: 'status-online', label: 'Online', text: 'text-green-400', hex: '#22c55e' },
  away:   { color: 'status-away',   label: 'Away',   text: 'text-yellow-400', hex: '#f59e0b' },
  busy:   { color: 'status-busy',   label: 'Busy',   text: 'text-red-400', hex: '#ef4444' },
  dnd:    { color: 'status-dnd',    label: 'Do Not Disturb', text: 'text-purple-400', hex: '#8b5cf6' },
};

// ── STARS BACKGROUND ──
const StarsBackground = () => {
  const canvasRef = useRef();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    const stars = Array.from({ length: 180 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      size: Math.random() * 1.8 + 0.3,
      opacity: Math.random() * 0.6 + 0.1,
      speed: 0.5 + Math.random() * 2,
      offset: Math.random() * Math.PI * 2,
    }));
    let frame = 0;
    let animId;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      frame++;
      stars.forEach(s => {
        const twinkle = 0.5 + 0.5 * Math.sin(frame * 0.015 * s.speed + s.offset);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.opacity * twinkle})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={canvasRef} className="stars-canvas" />;
};

// ── AVATAR ──
const Avatar = ({ user, size = 38, showStatus = false }) => {
  const s = user?.status || 'online';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {user?.avatar_url ? (
        <img src={`https://gong-unbend-chief.ngrok-free.dev${user.avatar_url}`} alt=""
          className="rounded-full object-cover w-full h-full avatar-ring" />
      ) : (
        <div className="rounded-full flex items-center justify-center text-white font-bold w-full h-full"
          style={{ background: user?.avatar_color || '#4A90E2', fontSize: size * 0.38 }}>
          {(user?.username?.[0] || '?').toUpperCase()}
        </div>
      )}
      {showStatus && (
        <div className={`absolute bottom-0 right-0 rounded-full border-2 ${STATUS_CONFIG[s]?.color || 'status-offline'}`}
          style={{ width: size * 0.28, height: size * 0.28, borderColor: 'rgba(3,8,25,0.95)' }} />
      )}
    </div>
  );
};

const TypingIndicator = ({ username }) => (
  <div className="flex items-center gap-2 px-4 py-1">
    <div className="flex gap-1 px-3 py-2 rounded-2xl" style={{ background:'rgba(74,144,226,0.1)', border:'1px solid rgba(74,144,226,0.2)' }}>
      {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full typing-dot" style={{ background:'#4A90E2', animationDelay:`${i*0.2}s` }} />)}
    </div>
    <span className="text-xs" style={{ color:'rgba(150,180,255,0.6)' }}>{username} is typing...</span>
  </div>
);

const IncomingCall = ({ caller, callType, onAccept, onReject }) => (
  <motion.div initial={{ opacity:0, y:-50 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-50 }}
    className="fixed top-4 left-1/2 -translate-x-1/2 z-50 modal-card rounded-2xl p-5 shadow-2xl w-80">
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Avatar user={caller} size={64} />
        <motion.div animate={{ scale:[1,1.3,1] }} transition={{ repeat:Infinity, duration:1.5 }}
          className="absolute inset-0 rounded-full border-2 opacity-50" style={{ borderColor:'#22c55e' }} />
      </div>
      <div className="text-center">
        <p className="font-bold text-white text-lg">{caller?.username}</p>
        <p className="text-xs mt-1" style={{ color:'rgba(150,180,255,0.6)' }}>{callType==='video'?'📹 Incoming video call...':'📞 Incoming voice call...'}</p>
      </div>
      <div className="flex gap-4">
        <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }} onClick={onReject}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background:'#ef4444', boxShadow:'0 4px 20px rgba(239,68,68,0.5)' }}>
          <PhoneOff size={22} className="text-white" />
        </motion.button>
        <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }} onClick={onAccept}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background:'#22c55e', boxShadow:'0 4px 20px rgba(34,197,94,0.5)' }}>
          <Phone size={22} className="text-white" />
        </motion.button>
      </div>
    </div>
  </motion.div>
);

const ActiveCall = ({ callType, remoteUser, onEnd, localVideoRef, remoteVideoRef, onScreenShare, screenSharing }) => {
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  useEffect(() => { const t = setInterval(() => setDuration(d=>d+1), 1000); return () => clearInterval(t); }, []);
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between py-10"
      style={{ background:'linear-gradient(135deg, #010a1e, #021030, #050e28)' }}>
      {callType==='video' && (
        <div className="absolute inset-0">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
          <div className="absolute inset-0" style={{ background:'linear-gradient(to bottom, rgba(0,0,0,0.3), transparent, rgba(0,0,0,0.6))' }} />
        </div>
      )}
      <div className="relative z-10 flex flex-col items-center gap-3 mt-8">
        <Avatar user={remoteUser} size={80} />
        <h2 className="text-2xl font-bold text-white">{remoteUser?.username}</h2>
        <p className="font-mono text-sm" style={{ color:'#22c55e' }}>{fmt(duration)}</p>
        {screenSharing && <span className="text-xs px-3 py-1 rounded-full" style={{ background:'rgba(74,144,226,0.3)', color:'#4A90E2', border:'1px solid rgba(74,144,226,0.5)' }}>📺 Sharing screen</span>}
      </div>
      {callType==='video' && (
        <div className="absolute top-4 right-4 w-32 h-44 rounded-xl overflow-hidden z-10" style={{ border:'2px solid rgba(74,144,226,0.4)' }}>
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>
      )}
      <div className="relative z-10 flex items-center gap-4 mb-4 flex-wrap justify-center px-4">
        <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }} onClick={() => setMuted(!muted)}
          className="w-13 h-13 rounded-full flex items-center justify-center transition-all"
          style={{ width:52, height:52, background: muted ? '#ef4444' : 'rgba(255,255,255,0.15)' }}>
          {muted ? <MicOff size={20} className="text-white" /> : <Mic size={20} className="text-white" />}
        </motion.button>
        {callType==='video' && (
          <>
            <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }} onClick={() => setVideoOff(!videoOff)}
              className="rounded-full flex items-center justify-center transition-all"
              style={{ width:52, height:52, background: videoOff ? '#ef4444' : 'rgba(255,255,255,0.15)' }}>
              {videoOff ? <VideoOff size={20} className="text-white" /> : <Video size={20} className="text-white" />}
            </motion.button>
            <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }} onClick={onScreenShare}
              className="rounded-full flex items-center justify-center transition-all"
              title="Screen Share"
              style={{ width:52, height:52, background: screenSharing ? 'rgba(74,144,226,0.8)' : 'rgba(255,255,255,0.15)', border: screenSharing ? '2px solid #4A90E2' : 'none' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
            </motion.button>
          </>
        )}
        <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }} onClick={onEnd}
          className="rounded-full flex items-center justify-center"
          style={{ width:60, height:60, background:'#ef4444', boxShadow:'0 4px 25px rgba(239,68,68,0.6)' }}>
          <PhoneOff size={24} className="text-white" />
        </motion.button>
      </div>
    </motion.div>
  );
};

export default function Chat() {
  const { user, logout, updateAvatar, setUser } = useAuth();
  const e2e = useE2EEncryption(user, axios, API);
  const groupKeyCacheRef = useRef({});
  const channelKeyCacheRef = useRef({});
  const { dark, toggle } = useTheme();
  const { addToast } = useToast();

  const [activeChannel, setActiveChannel] = useState('announcements');
  const [activeDM, setActiveDM] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const messageInputRef = useRef(null); // for autofocus on conversation switch, WhatsApp-style
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState({}); // { 'dm_5': 'unsent text...', 'group_3': '...', 'channel_announcements': '...' } — keeps each conversation's typed-but-not-sent message separate, like WhatsApp
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(null); // user object being viewed read-only, or null
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState('');
  const [groupError, setGroupError] = useState('');
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [dmSearch, setDmSearch] = useState('');
  const [showMoreGroups, setShowMoreGroups] = useState(false);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [groupMembersList, setGroupMembersList] = useState([]);
  const [reactions, setReactions] = useState({});
  const [addMemberInput, setAddMemberInput] = useState('');
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [showAddMemberDropdown, setShowAddMemberDropdown] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState('');
  const [forwardMsg, setForwardMsg] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [accountForm, setAccountForm] = useState({ username:'', bio:'', avatar_color:'', status:'online' });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [callLoading, setCallLoading] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const [canPost, setCanPost] = useState(true);
  const [showAdminUsers, setShowAdminUsers] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [lastMessageTimes, setLastMessageTimes] = useState({});
  const [imageViewer, setImageViewer] = useState(null); // { src, zoom }

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileShareInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const missedCallTimerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  // Refs to track current state inside socket listeners (avoid stale closures)
  const activeChannelRef = useRef(activeChannel);
  const activeDMRef = useRef(activeDM);
  const activeGroupRef = useRef(activeGroup);
  const userIdRef = useRef(user?.id);
  const unreadCountsRef = useRef({});
  const lastMessageTimesRef = useRef({});
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  };

  const cleanupCall = useCallback(() => {
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    clearTimeout(missedCallTimerRef.current);
    setActiveCall(null); setIncomingCall(null); setCallLoading(false);
  }, []);

  const sendMissedCallMessage = useCallback(async (toUserId, callType) => {
    const text = callType==='video' ? '📹 Missed video call' : '📞 Missed voice call';
    try {
      const r = await axios.post(`${API}/messages/private`, { to_user_id: toUserId, text });
      socket.emit('sendPrivateMessage', { ...r.data, avatar_color: user.avatar_color });
      setMessages(prev => [...prev, { ...r.data, username: user.username, avatar_color: user.avatar_color }]);
    } catch {}
  }, [user]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission==='default') Notification.requestPermission();
  }, []);

  // WhatsApp-style autofocus + per-conversation draft restore: the moment you
  // switch to a channel, DM, or group, the cursor should already be active in
  // the message box, AND it should show whatever unsent text you'd typed in
  // THIS specific conversation before (not leftover text from a different one).
  useEffect(() => {
    const key = getCurrentConvoKey();
    setInput(key ? (drafts[key] || '') : '');
    messageInputRef.current?.focus();
  }, [activeChannel, activeDM, activeGroup]);


  const showPushNotif = (title, body) => {
    if (!notifEnabled) return;
    if ('Notification' in window && Notification.permission==='granted' && document.hidden)
      new Notification(title, { body, icon: '/logo192.png' });
  };

  useEffect(() => {
    socket = io('https://gong-unbend-chief.ngrok-free.dev');
    socket.emit('userOnline', { id:user.id, username:user.username, avatar_color:user.avatar_color, avatar_url:user.avatar_url, status:user.status||'online' });
    // Join all group rooms for notifications
    setTimeout(() => {
      if (groups.length > 0) groups.forEach(g => socket.emit('joinGroup', g.id));
    }, 1000);
    socket.on('onlineUsers', setOnlineUsers);
    socket.on('groupCreated', () => loadGroups());
    // Role updated by admin - update permissions instantly
    socket.on('roleUpdated', ({ userId, role }) => {
      if (Number(userId) === Number(user.id)) {
        // Update user role in context
        setUser(prev => ({ ...prev, role }));
        // Re-check channel permissions immediately
        if (activeChannelRef.current) {
          axios.get(`${API}/admin/can-post/${activeChannelRef.current}`)
            .then(r => setCanPost(r.data.canPost))
            .catch(() => {});
        }
        // Show notification
        addToast({ 
          title: '🔄 Role Updated!', 
          message: `Your role has been changed to ${role}` 
        });
      }
    });
    socket.on('groupDeleted', ({ groupId }) => {
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (activeGroup?.id === groupId) { setActiveGroup(null); setMessages([]); }
    });
    socket.on('newMessage', async msg => {
      const ts = Date.now();
      const isSender = Number(msg.user_id) === Number(userIdRef.current);
      const isViewing = msg.room === activeChannelRef.current;
      setLastMessageTimes(prev => ({ ...prev, [`channel_${msg.room}`]: ts }));
      if (!isViewing) addUnread(`channel_${msg.room}`, ts, msg.user_id);

      let displayMsg = msg;
      if (msg.is_encrypted) {
        const encKey = channelKeyCacheRef.current[msg.room] || await fetchChannelKey(msg.room);
        const [decryptedArr] = await Promise.all([
          e2e.decryptIncoming([msg], { type: 'channel', channelName: msg.room, myEncryptedChannelKey: encKey })
        ]);
        displayMsg = decryptedArr[0];
      }

      if (isViewing) setMessages(prev => prev.find(m=>m.id===displayMsg.id) ? prev : [...prev, displayMsg]);
      if (!isSender) {
        addToast({ title:displayMsg.username, message:displayMsg.text?.substring(0,60)||'📷 Image', avatar:{color:displayMsg.avatar_color,letter:displayMsg.username?.[0]?.toUpperCase()} });
        showPushNotif(displayMsg.username, displayMsg.text?.substring(0,60)||'📷');
      }
    });

    socket.on('newPrivateMessage', async msg => {
      const ts = Date.now();
      const isSender = Number(msg.from_user_id) === Number(userIdRef.current);
      const dmId = isSender ? msg.to_user_id : msg.from_user_id;
      const isViewing = activeDMRef.current && Number(activeDMRef.current.id) === Number(dmId);
      setLastMessageTimes(prev => ({ ...prev, [`dm_${dmId}`]: ts }));
      if (!isSender && !isViewing) addUnread(`dm_${dmId}`, ts, msg.from_user_id);

      let displayMsg = msg;
      if (msg.is_encrypted) {
        const [decryptedArr] = await Promise.all([
          e2e.decryptIncoming([msg], { type: 'dm', peerId: dmId })
        ]);
        displayMsg = decryptedArr[0];
      }

      if (isViewing || isSender) setMessages(prev => prev.find(m=>m.id===displayMsg.id) ? prev : [...prev, displayMsg]);
      if (!isSender) {
        addToast({ title:displayMsg.username, message:displayMsg.text?.substring(0,60)||'📷 Image', avatar:{color:displayMsg.avatar_color,letter:displayMsg.username?.[0]?.toUpperCase()} });
        showPushNotif(displayMsg.username, displayMsg.text?.substring(0,60)||'📷');
      }
    });

    socket.on('newGroupMessage', async msg => {
      const ts = Date.now();
      const isSender = Number(msg.user_id) === Number(userIdRef.current);
      const isViewing = activeGroupRef.current && Number(activeGroupRef.current.id) === Number(msg.group_id);
      setLastMessageTimes(prev => ({ ...prev, [`group_${msg.group_id}`]: ts }));

      let displayMsg = msg;
      if (msg.is_encrypted) {
        const encKey = groupKeyCacheRef.current[msg.group_id] || await fetchGroupKey(msg.group_id);
        const [decryptedArr] = await Promise.all([
          e2e.decryptIncoming([msg], { type: 'group', groupId: msg.group_id, myEncryptedGroupKey: encKey })
        ]);
        displayMsg = decryptedArr[0];
      }

      if (!isSender && !isViewing) {
        addUnread(`group_${msg.group_id}`, ts, msg.user_id);
        addToast({
          title: displayMsg.username || 'Group Message',
          message: displayMsg.text?.includes('[IMAGE]') ? '📷 Image' : displayMsg.text?.includes('[FILE]') ? '📎 File' : displayMsg.text?.substring(0,60) || '...',
          avatar: { color: displayMsg.avatar_color, letter: displayMsg.username?.[0]?.toUpperCase() }
        });
        showPushNotif(displayMsg.username, displayMsg.text?.substring(0,60) || '📷');
      }
      if (isViewing) setMessages(prev => prev.find(m=>m.id===displayMsg.id) ? prev : [...prev, displayMsg]);
    });
    socket.on('userTyping', ({ username, isTyping, room }) => {
      // Only show typing if:
      // 1. We are in the same channel
      // 2. Not in a DM or group (channel typing shouldn't show in DMs/groups)
      if (!activeChannel) return; // We're in DM or group, don't show channel typing
      if (room !== activeChannel) return; // Different channel
      setTypingUsers(prev => isTyping ? [...prev.filter(u=>u!==username),username] : prev.filter(u=>u!==username));
    });
    socket.on('messageReaction', ({ messageId, reactions:r }) => { setReactions(prev => ({...prev,[messageId]:r})); });
    socket.on('messageEdited', ({ id, text }) => { setMessages(prev => prev.map(m=>m.id===id?{...m,text,edited:1}:m)); });
    socket.on('messageDeleted', ({ id }) => { setMessages(prev => prev.map(m=>m.id===id?{...m,text:'This message was deleted',deleted:1}:m)); });
    socket.on('messageSeen', ({ id }) => { setMessages(prev => prev.map(m=>m.id===id?{...m,seen_at:new Date()}:m)); });
    socket.on('incomingCall', ({ from, fromUser, callType, offer }) => {
      setIncomingCall({ from, fromUser, callType, offer });
      missedCallTimerRef.current = setTimeout(() => { socket.emit('rejectCall', { to:from, toUserId:fromUser.id, fromUser:user }); setIncomingCall(null); }, 30000);
    });
    socket.on('callAccepted', async ({ answer }) => { if (peerConnectionRef.current) { await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer)); setCallLoading(false); } });
    socket.on('callRejected', () => { cleanupCall(); addToast({ title:'Call declined', message:'The user rejected your call' }); });
    socket.on('callEnded', () => { cleanupCall(); });
    socket.on('iceCandidate', async ({ candidate }) => { if (peerConnectionRef.current && candidate) { try { await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {} } });
    socket.on('missedCallMessage', async ({ fromUser }) => {
      try { const r = await axios.post(`${API}/messages/private`, { to_user_id:fromUser.id, text:'📞 Missed voice call' }); setMessages(prev => [...prev, { ...r.data, username:user.username, avatar_color:user.avatar_color }]); } catch {}
    });
    loadUsers(); loadGroups(); loadMessages('channel', 'announcements', false);
    loadUnreadCounts();
    setTimeout(() => loadUnreadCounts(), 2000);
    // Join ALL channel rooms so we receive notifications from all channels
    ['announcements', 'tech-updates', 'job-notifications'].forEach(ch => {
      socket.emit('joinRoom', ch);
    });
    // Check if user can post in default channel
    if (user.role !== 'admin') {
      axios.get(`${API}/admin/can-post/announcements`).then(r => setCanPost(r.data.canPost)).catch(() => {});
    } else {
      setCanPost(true);
    }
    loadBlockedUsers();
    window.addEventListener('beforeunload', () => axios.put(`${API}/users/last-seen`));
    return () => { socket.disconnect(); cleanupCall(); };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior:'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages]);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { activeDMRef.current = activeDM; }, [activeDM]);
  useEffect(() => { activeGroupRef.current = activeGroup; }, [activeGroup]);
  useEffect(() => { userIdRef.current = user?.id; }, [user]);
  useEffect(() => { unreadCountsRef.current = unreadCounts; }, [unreadCounts]);
  useEffect(() => { lastMessageTimesRef.current = lastMessageTimes; }, [lastMessageTimes]);

  useEffect(() => {
    if (activeDM) {
      messages.filter(m=>m.from_user_id===activeDM.id && !m.seen_at).forEach(async m => {
        try { await axios.put(`${API}/messages/private/${m.id}/seen`); socket.emit('messageSeen', { id:m.id, to:activeDM.id }); } catch {}
      });
    }
  }, [messages, activeDM]);

  const loadUsers = async () => { try { const r = await axios.get(`${API}/users`); setUsers(r.data); } catch {} };
  const loadGroups = async () => {
    try {
      const r = await axios.get(`${API}/groups`);
      setGroups(r.data);
      // Join ALL group rooms so we receive messages from all groups
      if (socket) {
        r.data.forEach(g => socket.emit('joinGroup', g.id));
      }
    } catch {}
  };
  const loadBlockedUsers = async () => { try { const r = await axios.get(`${API}/users/blocked`); setBlockedUsers(r.data); } catch {} };

  const addUnread = useCallback((key, timestamp, senderId) => {
    // Never add unread badge for the sender
    if (senderId && Number(senderId) === Number(userIdRef.current)) {
      // Still update time for ordering
      if (timestamp) setLastMessageTimes(prev => ({ ...prev, [key]: timestamp }));
      const [type, ...rest] = key.split('_');
      axios.post(`${API}/messages/unread-update-time`, { ref_type: type, ref_id: rest.join('_'), last_message_time: timestamp }).catch(() => {});
      return;
    }
    setUnreadCounts(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    if (timestamp) setLastMessageTimes(prev => ({ ...prev, [key]: timestamp }));
    const [type, ...rest] = key.split('_');
    const refId = rest.join('_');
    axios.post(`${API}/messages/unread-increment`, { ref_type: type, ref_id: refId, last_message_time: timestamp || Date.now() }).catch(() => {});
  }, []);

  const clearUnread = useCallback((key) => {
    setUnreadCounts(prev => ({ ...prev, [key]: 0 }));
    const [type, ...rest] = key.split('_');
    const refId = rest.join('_');
    axios.post(`${API}/messages/unread-clear`, { ref_type: type, ref_id: refId }).catch(() => {});
  }, []);

  const loadUnreadCounts = async () => {
    try {
      const r = await axios.get(`${API}/messages/unread-counts`);
      console.log('📊 Unread counts from DB:', r.data);
      const counts = {};
      const times = {};
      r.data.forEach(item => {
        const key = `${item.ref_type}_${item.ref_id}`;
        if (item.count > 0) counts[key] = item.count;
        if (item.last_message_time > 0) times[key] = Number(item.last_message_time);
      });
      console.log('📊 Processed counts:', counts);
      setUnreadCounts(counts);
      setLastMessageTimes(prev => ({ ...prev, ...times }));
    } catch(err) {
      console.error('loadUnreadCounts error:', err.message);
    }
  };

  const loadAdminUsers = async () => {
    try {
      const [usersRes, permsRes] = await Promise.all([
        axios.get(`${API}/admin/users`),
        axios.get(`${API}/admin/permissions`)
      ]);
      setAdminUsers(usersRes.data);
      setAllPermissions(permsRes.data);
    } catch(err) {
      console.error('loadAdminUsers error:', err.response?.data || err.message);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;
    try {
      // Get members first so we can notify them
      const membersRes = await axios.get(`${API}/groups/${groupId}/members`);
      const memberIds = membersRes.data.map(m => m.id);
      
      await axios.delete(`${API}/groups/${groupId}`);
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (activeGroup?.id === groupId) { setActiveGroup(null); setMessages([]); }
      addToast({ title:'Group deleted!', message:'' });
      // Notify only group members via socket
      if (socket) socket.emit('groupDeleted', { groupId, memberIds });
    } catch(err) {
      addToast({ title:'Error', message: err.response?.data?.message || 'Failed to delete group' });
    }
  };

  const handleSetRole = async (userId, role) => {
    try {
      await axios.put(`${API}/admin/users/${userId}/role`, { role });
      loadAdminUsers();
      addToast({ title:'Role updated!', message:`User role set to ${role}` });
      // Notify the user instantly via socket - no refresh needed!
      if (socket) socket.emit('roleUpdated', { userId: Number(userId), role });
    } catch(err) { addToast({ title:'Error', message: err.response?.data?.message || 'Failed' }); }
  };

  const handleGrantPermission = async (userId, channel) => {
    try {
      await axios.post(`${API}/admin/permissions`, { user_id: userId, channel });
      loadAdminUsers();
      addToast({ title:'Permission granted!', message:`Can now post in ${channel}` });
    } catch {}
  };

  const handleRevokePermission = async (userId, channel) => {
    try {
      await axios.delete(`${API}/admin/permissions`, { data: { user_id: userId, channel } });
      loadAdminUsers();
      addToast({ title:'Permission revoked!', message:'' });
    } catch {}
  };

  const fetchGroupKey = async (groupId) => {
    if (groupKeyCacheRef.current[groupId]) return groupKeyCacheRef.current[groupId];
    try {
      const r = await axios.get(`${API}/groups/${groupId}/key`);
      groupKeyCacheRef.current[groupId] = r.data.encryptedKey;
      return r.data.encryptedKey;
    } catch { return null; }
  };

  const fetchChannelKey = async (channelName) => {
    if (channelKeyCacheRef.current[channelName]) return channelKeyCacheRef.current[channelName];
    try {
      const r = await axios.get(`${API}/messages/channel-key/${channelName}`);
      channelKeyCacheRef.current[channelName] = r.data.encryptedKey;
      return r.data.encryptedKey;
    } catch { return null; }
  };

  const loadMessages = async (type, id, shouldClearUnread = false) => {
    try {
      setMessages([]);
      let r;
      let context = { type };

      if (type==='channel') {
        r = await axios.get(`${API}/messages/${id}`);
        socket.emit('joinRoom', id);
        if (shouldClearUnread) clearUnread(`channel_${id}`);
        context.channelName = id;
        context.myEncryptedChannelKey = await fetchChannelKey(id);
      }
      else if (type==='dm') {
        r = await axios.get(`${API}/messages/private/${id}`);
        if (shouldClearUnread) clearUnread(`dm_${id}`);
        context.peerId = id;
      }
      else {
        r = await axios.get(`${API}/groups/${id}/messages`);
        socket.emit('joinGroup', id);
        if (shouldClearUnread) clearUnread(`group_${id}`);
        context.groupId = id;
        context.myEncryptedGroupKey = await fetchGroupKey(id);
      }

      const recent = r.data.slice(-100);
      // Show messages immediately with a "decrypting" placeholder for encrypted ones,
      // rather than blocking the whole UI (and the input box) until every single
      // message has gone through RSA+AES decryption. This is what makes switching
      // conversations feel instant even when there are many encrypted messages —
      // text fills in progressively a moment later instead of freezing the screen.
      setMessages(recent.map(m => (m.is_encrypted && m.ciphertext) ? { ...m, text: null, _decrypting: true } : m));
      const decrypted = await e2e.decryptIncoming(recent, context);
      setMessages(decrypted);
    } catch (err) { console.error('loadMessages error:', err); }
  };

  const switchChannel = async ch => {
    setTypingUsers([]);
    setViewingProfile(null); // defensive: prevent a stale profile-viewer overlay from silently blocking clicks/input after switching
    clearUnread(`channel_${ch}`);
    setActiveChannel(ch); setActiveDM(null); setActiveGroup(null); loadMessages('channel', ch, true);
    if (user.role === 'admin') { setCanPost(true); return; }
    try {
      const r = await axios.get(`${API}/admin/can-post/${ch}`);
      setCanPost(r.data.canPost);
    } catch { setCanPost(true); }
  };
  const switchDM = u => {
    setLastMessageTimes(prev => ({ ...prev, [`dm_${u.id}`]: Date.now() }));
    clearUnread(`dm_${u.id}`);
    setTypingUsers([]);
    setViewingProfile(null); // defensive: same fix as switchChannel above
    setActiveDM(u); setActiveChannel(null); setActiveGroup(null); loadMessages('dm', u.id, true);
  };
  const switchGroup = async g => {
    setLastMessageTimes(prev => ({ ...prev, [`group_${g.id}`]: Date.now() }));
    clearUnread(`group_${g.id}`);
    setViewingProfile(null); // defensive: same fix as switchChannel above
    setTypingUsers([]);
    setActiveGroup(g); setActiveChannel(null); setActiveDM(null); loadMessages('group', g.id, true);
    try {
      const membersRes = await axios.get(`${API}/groups/${g.id}/members`);
      setGroupMembersList(membersRes.data);
    } catch {}
    try {
      const pinnedRes = await axios.get(`${API}/groups/${g.id}/pinned`);
      setPinnedMessages(pinnedRes.data || []);
    } catch { setPinnedMessages([]); }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    const replyData = replyTo ? {
      reply_to_id: replyTo.id,
      reply_to_text: replyTo.text ? replyTo.text.substring(0,100) : replyTo.image_url ? '📷 Image' : '📎 File',
      reply_to_username: replyTo.username
    } : {};

    setInput(''); setReplyTo(null); setShowEmoji(false);
    const sentKey = getCurrentConvoKey();
    if (sentKey) setDrafts(prev => ({ ...prev, [sentKey]: '' })); // clear this conversation's saved draft now that it's been sent
    try {
      if (activeDM) {
        const enc = await e2e.encryptOutgoing(text, { type: 'dm', peerId: activeDM.id });
        const r = await axios.post(`${API}/messages/private`, { to_user_id:activeDM.id, ...enc, ...replyData });
        const finalMsg = { ...r.data, text, ...replyData, avatar_color:user.avatar_color, username:user.username };
        socket.emit('sendPrivateMessage', { ...r.data, ...replyData, avatar_color:user.avatar_color, username:user.username });
        setMessages(prev => [...prev, finalMsg]);
      } else if (activeGroup) {
        const myEncryptedGroupKey = groupKeyCacheRef.current[activeGroup.id] || await fetchGroupKey(activeGroup.id);
        const enc = await e2e.encryptOutgoing(text, { type: 'group', groupId: activeGroup.id, myEncryptedGroupKey });
        const r = await axios.post(`${API}/groups/${activeGroup.id}/messages`, { ...enc, ...replyData });
        const finalMsg = { ...r.data, text, ...replyData, group_id: activeGroup.id, avatar_color:user.avatar_color, username:user.username };
        socket.emit('sendGroupMessage', { ...r.data, ...replyData, group_id: activeGroup.id, avatar_color:user.avatar_color, username:user.username });
        setMessages(prev => [...prev, finalMsg]);
      } else if (activeChannel) {
        const myEncryptedChannelKey = channelKeyCacheRef.current[activeChannel] || await fetchChannelKey(activeChannel);
        const enc = await e2e.encryptOutgoing(text, { type: 'channel', channelName: activeChannel, myEncryptedChannelKey });
        const r = await axios.post(`${API}/messages`, { room:activeChannel, ...enc, ...replyData });
        const finalMsg = { ...r.data, text, ...replyData, room:activeChannel, avatar_color:user.avatar_color, username:user.username };
        socket.emit('sendMessage', { ...r.data, ...replyData, room:activeChannel, avatar_color:user.avatar_color, username:user.username });
        setMessages(prev => [...prev, finalMsg]);
      }
    } catch(err) { console.error('Send error:', err); }
  };

  const handleTyping = e => {
    const value = e.target.value;
    setInput(value);
    const key = getCurrentConvoKey();
    if (key) setDrafts(prev => ({ ...prev, [key]: value }));
    if (activeChannel) {
      // Only emit typing if not already typing (debounce)
      if (!typingTimeoutRef.current) {
        socket.emit('typing', { room:activeChannel, username:user.username, isTyping:true });
      }
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { room:activeChannel, username:user.username, isTyping:false });
        typingTimeoutRef.current = null;
      }, 1500);
    }
    if (activeDM || activeGroup) setTypingUsers([]);
  };

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileShare = async e => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      setIsUploading(true);
      setUploadProgress(0);
      const r = await axios.post(`${API}/messages/upload-file`, fd, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });
      setIsUploading(false);
      setUploadProgress(0);
      const baseUrl = window.location.origin.includes('localhost') ? 'https://gong-unbend-chief.ngrok-free.dev' : window.location.origin;
      const fileUrl = `${baseUrl}${r.data.file_url}`;
      const text = `[FILE]${JSON.stringify({ url: fileUrl, name: r.data.file_name, size: r.data.file_size, type: r.data.file_type })}[/FILE]`;

      if (activeDM) {
        const mr = await axios.post(`${API}/messages/private`, { to_user_id: activeDM.id, text });
        const finalMsg = { ...mr.data, username: user.username, avatar_color: user.avatar_color };
        if (socket) socket.emit('sendPrivateMessage', { ...finalMsg, to_user_id: activeDM.id });
        setMessages(prev => [...prev, finalMsg]);
      } else if (activeGroup) {
        const mr = await axios.post(`${API}/groups/${activeGroup.id}/messages`, { text });
        const finalMsg = { ...mr.data, username: user.username, avatar_color: user.avatar_color, group_id: activeGroup.id };
        if (socket) socket.emit('sendGroupMessage', { ...finalMsg, group_id: activeGroup.id });
        setMessages(prev => [...prev, finalMsg]);
      } else if (activeChannel) {
        const mr = await axios.post(`${API}/messages`, { room: activeChannel, text });
        const finalMsg = { ...mr.data, username: user.username, avatar_color: user.avatar_color };
        if (socket) socket.emit('sendMessage', { ...finalMsg, room: activeChannel });
        setMessages(prev => [...prev, finalMsg]);
      }
      addToast({ title:'File sent!', message: file.name });
    } catch(err) {
      addToast({ title:'Upload failed', message: err.response?.data?.message || 'Could not send file' });
    }
  };

  const handleImageUpload = async e => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await axios.post(`${API}/messages/upload-image`, fd);
      const imageUrl = `https://gong-unbend-chief.ngrok-free.dev${r.data.image_url}`;
      const text = `[IMAGE]${imageUrl}[/IMAGE]`;

      if (activeDM) {
        const mr = await axios.post(`${API}/messages/private`, { to_user_id: activeDM.id, text });
        const finalMsg = { ...mr.data, username: user.username, avatar_color: user.avatar_color };
        if (socket) socket.emit('sendPrivateMessage', { ...finalMsg, to_user_id: activeDM.id });
        setMessages(prev => [...prev, finalMsg]);
      } else if (activeGroup) {
        const mr = await axios.post(`${API}/groups/${activeGroup.id}/messages`, { text });
        const finalMsg = { ...mr.data, username: user.username, avatar_color: user.avatar_color, group_id: activeGroup.id };
        if (socket) socket.emit('sendGroupMessage', { ...finalMsg, group_id: activeGroup.id });
        setMessages(prev => [...prev, finalMsg]);
      } else if (activeChannel) {
        const mr = await axios.post(`${API}/messages`, { room: activeChannel, text });
        const finalMsg = { ...mr.data, username: user.username, avatar_color: user.avatar_color };
        if (socket) socket.emit('sendMessage', { ...finalMsg, room: activeChannel });
        setMessages(prev => [...prev, finalMsg]);
      }
    } catch(err) {
      console.error('Image send error:', err.response?.data || err.message);
      addToast({ title:'Upload failed', message: err.response?.data?.message || 'Could not send image' });
    }
  };

  const handleEditMessage = async () => {
    if (!editingMsg || !editText.trim()) return;
    try {
      if (editingMsg.type==='private') await axios.put(`${API}/messages/private/${editingMsg.id}`, { text:editText });
      else if (editingMsg.type==='group') await axios.put(`${API}/groups/${activeGroup.id}/messages/${editingMsg.id}`, { text:editText });
      else await axios.put(`${API}/messages/${editingMsg.id}`, { text:editText });
      socket.emit('editMessage', { id:editingMsg.id, text:editText });
      setMessages(prev => prev.map(m=>m.id===editingMsg.id?{...m,text:editText,edited:1}:m));
      setEditingMsg(null); setEditText('');
    } catch {}
  };

  const handleDeleteMessage = async (msg) => {
    try {
      if (activeDM) await axios.delete(`${API}/messages/private/${msg.id}`);
      else if (activeGroup) await axios.delete(`${API}/groups/${activeGroup.id}/messages/${msg.id}`);
      else await axios.delete(`${API}/messages/${msg.id}`);
      socket.emit('deleteMessage', { id:msg.id });
      setMessages(prev => prev.map(m=>m.id===msg.id?{...m,text:'This message was deleted',deleted:1}:m));
    } catch {}
    setContextMenu(null);
  };

  const handleForward = async (targetUserId) => {
    if (!forwardMsg) return;
    try {
      const r = await axios.post(`${API}/messages/private`, { to_user_id:targetUserId, text:`↩ Forwarded: ${forwardMsg.text}` });
      socket.emit('sendPrivateMessage', { ...r.data, avatar_color:user.avatar_color });
      addToast({ title:'Message forwarded!', message:'' });
    } catch {}
    setForwardMsg(null);
  };

  const handlePinMessage = async (msg) => {
    if (!activeGroup || activeGroup.admin_id!==user.id) return;
    try { await axios.post(`${API}/groups/${activeGroup.id}/pin/${msg.id}`); setPinnedMessages(prev=>[...prev,msg]); addToast({ title:'Message pinned!', message:'' }); } catch {}
    setContextMenu(null);
  };

  const handleBlock = async (userId) => {
    try { await axios.post(`${API}/users/block/${userId}`); loadBlockedUsers(); loadUsers(); addToast({ title:'User blocked', message:'' }); } catch {}
    setContextMenu(null);
  };

  const handleUnblock = async (userId) => {
    try { await axios.delete(`${API}/users/block/${userId}`); loadBlockedUsers(); loadUsers(); addToast({ title:'User unblocked', message:'' }); } catch {}
  };

  const handleSaveAccount = async () => {
    setAccountSaving(true); setAccountError('');
    try {
      await axios.put(`${API}/users/me`, accountForm);
      setUser(prev => ({...prev,...accountForm}));
      socket.emit('userOnline', { id:user.id, username:accountForm.username, avatar_color:accountForm.avatar_color, status:accountForm.status });
      await axios.put(`${API}/users/status`, { status:accountForm.status });
      addToast({ title:'Profile saved!', message:'' });
      setShowAccount(false); // Close modal and return to chat
    } catch (err) { setAccountError(err.response?.data?.message||'Failed to save'); }
    setAccountSaving(false);
  };

  const openAccount = () => {
    setAccountForm({ username:user.username, bio:user.bio||'', avatar_color:user.avatar_color||'#4A90E2', status:user.status||'online' });
    setShowAccount(true);
  };

  const startCall = async (callType) => {
    if (!activeDM) return;
    setCallLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(callType==='video'?{video:true,audio:true}:{audio:true});
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = e => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
      pc.onicecandidate = e => { if (e.candidate) socket.emit('iceCandidate', { to:activeDM._socketId, candidate:e.candidate }); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const toUser = onlineUsers.find(u=>u.id===activeDM.id);
      if (!toUser) { await sendMissedCallMessage(activeDM.id, callType); cleanupCall(); return; }
      activeDM._socketId = toUser.socketId;
      socket.emit('callUser', { toUserId:activeDM.id, callType, fromUser:{ id:user.id, username:user.username, avatar_color:user.avatar_color }, offer });
      setActiveCall({ callType, remoteUser:activeDM });
      missedCallTimerRef.current = setTimeout(async () => {
        if (peerConnectionRef.current) { socket.emit('missedCall', { to:toUser.socketId, fromUser:user }); await sendMissedCallMessage(activeDM.id, callType); cleanupCall(); }
      }, 30000);
    } catch { cleanupCall(); addToast({ title:'Call failed', message:'Could not access camera/microphone' }); }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    clearTimeout(missedCallTimerRef.current);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(incomingCall.callType==='video'?{video:true,audio:true}:{audio:true});
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = e => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
      pc.onicecandidate = e => { if (e.candidate) socket.emit('iceCandidate', { to:incomingCall.from, candidate:e.candidate }); };
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('acceptCall', { to:incomingCall.from, answer });
      setActiveCall({ callType:incomingCall.callType, remoteUser:incomingCall.fromUser });
      setIncomingCall(null);
    } catch { cleanupCall(); }
  };

  const rejectCall = () => {
    clearTimeout(missedCallTimerRef.current);
    socket.emit('rejectCall', { to:incomingCall.from, toUserId:incomingCall.fromUser.id, fromUser:user });
    setIncomingCall(null);
  };

  const endCall = () => { if (activeCall) socket.emit('callEnded', { to:activeDM?._socketId||'' }); cleanupCall(); };
  // ── SCREEN SHARE ──
  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen share - restore camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      // Restore original camera track
      if (localStreamRef.current && peerConnectionRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(videoTrack);
            if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
          }
        }
      }
      setScreenSharing(false);
      addToast({ title:'Screen share stopped', message:'' });
    } else {
      // Check if browser supports screen sharing
      if (!navigator.mediaDevices?.getDisplayMedia) {
        addToast({ title:'Not supported', message:'Screen sharing not supported in this browser' });
        return;
      }
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { cursor: 'always' }, 
          audio: false 
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in WebRTC peer connection
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(screenTrack);
          }
        }

        // Show screen in local video preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Auto stop when user clicks "Stop sharing" in browser
        screenTrack.onended = async () => {
          screenStreamRef.current = null;
          setScreenSharing(false);
          // Restore camera
          if (localStreamRef.current && peerConnectionRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
              const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
              if (sender) {
                await sender.replaceTrack(videoTrack);
                if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
              }
            }
          }
          addToast({ title:'Screen share stopped', message:'' });
        };

        setScreenSharing(true);
        addToast({ title:'Screen sharing started', message:'Your screen is now visible to the other person' });
      } catch(e) {
        if (e.name !== 'NotAllowedError') {
          addToast({ title:'Screen share failed', message: e.message || 'Could not share screen' });
        }
      }
    }
  };

  const handleReaction = (msgId, emoji) => {
    const room = activeChannel || (activeGroup ? `group_${activeGroup.id}` : `dm_${activeDM?.id}`);
    socket.emit('addReaction', { messageId:msgId, emoji, userId:user.id, username:user.username, room });
    // Update local state immediately
    setReactions(prev => {
      const msgReactions = { ...(prev[msgId] || {}) };
      const users = msgReactions[emoji] ? [...msgReactions[emoji]] : [];
      const existing = users.findIndex(u => u.userId === user.id);
      if (existing >= 0) users.splice(existing, 1); // toggle off
      else users.push({ userId: user.id, username: user.username }); // add
      if (users.length === 0) delete msgReactions[emoji];
      else msgReactions[emoji] = users;
      return { ...prev, [msgId]: msgReactions };
    });
    setContextMenu(null);
  };
  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    const menuWidth = 190;
    const menuHeight = 300;
    const x = e.clientX + menuWidth > window.innerWidth ? e.clientX - menuWidth : e.clientX;
    const y = e.clientY + menuHeight > window.innerHeight ? e.clientY - menuHeight : e.clientY;
    setContextMenu({ x, y, msg });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) { setGroupError('Enter a group name'); return; }
    if (!selectedGroupMembers.length) { setGroupError('Add at least one member'); return; }
    try {
      const memberUsernames = selectedGroupMembers.map(m => m.username);
      const newGroup = await axios.post(`${API}/groups`, { name:groupName, memberUsernames });
      setShowCreateGroup(false);
      setGroupName('');
      setGroupMembers('');
      setGroupError('');
      setSelectedGroupMembers([]);
      setGroupMemberSearch('');
      loadGroups();
      // Notify only group members via socket so their sidebar updates
      if (socket) socket.emit('groupCreated', { group: newGroup.data, memberUsernames });
    }
    catch (err) { setGroupError(err.response?.data?.message || 'Failed to create group'); }
  };

  const handleAddMember = async (selectedUser) => {
    const username = selectedUser ? selectedUser.username : addMemberInput.trim();
    if (!username) return;
    try {
      await axios.post(`${API}/groups/${activeGroup.id}/members`, { username });
      setAddMemberInput('');
      setAddMemberSearch('');
      setShowAddMemberDropdown(false);
      setAdminError('');
      const r = await axios.get(`${API}/groups/${activeGroup.id}/members`);
      setGroupMembersList(r.data);
      addToast({ title:'Member added!', message:`${username} added to group` });
    }
    catch (err) { setAdminError(err.response?.data?.message||'Failed to add member'); }
  };

  const handleRemoveMember = async (memberId) => {
    try { await axios.delete(`${API}/groups/${activeGroup.id}/members/${memberId}`); const r = await axios.get(`${API}/groups/${activeGroup.id}/members`); setGroupMembersList(r.data); }
    catch (err) { setAdminError(err.response?.data?.message||'Failed'); }
  };

  const handleLeaveGroup = async () => {
    try { await axios.delete(`${API}/groups/${activeGroup.id}/leave`); setGroups(prev=>prev.filter(g=>g.id!==activeGroup.id)); setActiveGroup(null); setActiveChannel('announcements'); setShowAdminPanel(false); loadMessages('channel','announcements'); }
    catch (err) { setAdminError(err.response?.data?.message||'Failed'); }
  };

  const handleMakeAdmin = async (memberId) => {
    try {
      await axios.put(`${API}/groups/${activeGroup.id}/make-admin/${memberId}`);
      // Update local state
      setActiveGroup(prev => ({ ...prev, admin_id: Number(memberId) }));
      setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, admin_id: Number(memberId) } : g));
      setAdminError('');
      const r = await axios.get(`${API}/groups/${activeGroup.id}/members`);
      setGroupMembersList(r.data);
      addToast({ title:'Admin transferred!', message:'New admin assigned successfully' });
    }
    catch (err) {
      console.error('Make admin error:', err.response?.data || err.message);
      setAdminError(err.response?.data?.message || 'Failed to transfer admin');
    }
  };

  // E2E: bootstrap (or re-key) this group's shared AES key, encrypted for every
  // current member's RSA public key. Safe to call on groups created before
  // encryption existed — uses /key/rotate which works whether group_keys is
  // currently empty (version becomes 1) or already populated (version increments).
  const [enablingEncryption, setEnablingEncryption] = useState(false);
  const handleEnableGroupEncryption = async () => {
    if (!activeGroup) return;
    setEnablingEncryption(true);
    try {
      const r = await axios.get(`${API}/groups/${activeGroup.id}/members`);
      const members = r.data;
      const missingKey = members.find(m => !m.public_key);
      if (missingKey) {
        addToast({ title:'Cannot enable yet', message:`${missingKey.username} hasn't logged in since encryption was added` });
        setEnablingEncryption(false);
        return;
      }
      const memberPublicKeys = members.map(m => ({ userId: m.id, publicKeyB64: m.public_key }));
      const { encryptedKeys } = await e2e.createGroupKeys(memberPublicKeys);
      await axios.post(`${API}/groups/${activeGroup.id}/key/rotate`, { memberKeys: encryptedKeys });
      groupKeyCacheRef.current[activeGroup.id] = encryptedKeys.find(k => k.userId === user.id)?.encryptedKey;
      addToast({ title:'🔐 Encryption enabled!', message:'New messages in this group are now end-to-end encrypted' });
    } catch (err) {
      console.error('Enable group encryption failed:', err);
      addToast({ title:'Failed to enable encryption', message: err.response?.data?.message || '' });
    } finally {
      setEnablingEncryption(false);
    }
  };

  // NOTE: Channels (Announcements, Tech Updates, Job Notifications) are
  // intentionally NOT end-to-end encrypted. They're company-wide broadcast
  // spaces with no real "membership" to encrypt against, and the content is
  // meant to be readable by everyone in the org anyway — the same reason
  // Slack/Teams don't E2E-encrypt public channels. E2E here is scoped to
  // DMs and Groups, where confidentiality between specific people matters.

  const handleRenameGroup = async () => {
    const newName = groupNameInput.trim();
    if (!newName || newName === activeGroup.name) { setEditingGroupName(false); return; }
    try {
      await axios.put(`${API}/groups/${activeGroup.id}`, { name: newName });
      setActiveGroup(prev => ({ ...prev, name: newName }));
      setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, name: newName } : g));
      addToast({ title: 'Group renamed!', message: newName });
      setEditingGroupName(false);
    } catch (err) {
      console.error('Rename group error:', err);
      addToast({ title: 'Failed to rename group', message: err.response?.data?.message || '' });
    }
  };

  const isOnline = id => onlineUsers.some(u=>u.id===id);
  const isBlocked = id => blockedUsers.some(u=>u.id===id);
  const filteredMessages = searchQuery ? messages.filter(m=>m.text?.toLowerCase().includes(searchQuery.toLowerCase())) : messages;
  // Filter users by username or ID
  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    formatUID(u.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(u.id).includes(searchQuery)
  );
  const getChatTitle = () => activeDM ? activeDM.username : activeGroup ? activeGroup.name : `#${activeChannel}`;
  // Unique key for whichever conversation is currently open — used to keep each
  // conversation's unsent draft text separate (so typing in one DM and switching
  // to another doesn't leak that text into the wrong conversation).
  const getCurrentConvoKey = () => activeDM ? `dm_${activeDM.id}` : activeGroup ? `group_${activeGroup.id}` : activeChannel ? `channel_${activeChannel}` : null;

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024/1024).toFixed(1)} MB`;
  };

  const getFileIcon = (type) => {
    const icons = {
      pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
      ppt: '📊', pptx: '📊', zip: '📦', rar: '📦', txt: '📃',
      mp3: '🎵', mp4: '🎬', png: '🖼️', jpg: '🖼️', jpeg: '🖼️',
      gif: '🖼️', csv: '📊', json: '⚙️', js: '⚙️', py: '⚙️',
    };
    return icons[type?.toLowerCase()] || '📎';
  };

  const getFileColor = (type) => {
    const colors = {
      pdf: '#ef4444', doc: '##4A90E2', docx: '#4A90E2',
      xls: '#22c55e', xlsx: '#22c55e', zip: '#f59e0b',
      rar: '#f59e0b', mp3: '#8b5cf6', mp4: '#8b5cf6',
      ppt: '#f97316', pptx: '#f97316',
    };
    return colors[type?.toLowerCase()] || '#4A90E2';
  };

  const formatLastSeen = (ts) => {
    if (!ts) return 'Never';
    const diff = Math.floor((new Date() - new Date(ts)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const COLORS = ['#4A90E2','#10b981','#ef4444','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#f97316'];

  // Unread badge component
  const UnreadBadge = ({ count }) => {
    if (!count) return null;
    return (
      <span style={{
        background:'#ef4444', color:'white', fontSize:10, fontWeight:800,
        borderRadius:10, minWidth:18, height:18, display:'flex',
        alignItems:'center', justifyContent:'center', padding:'0 5px'
      }}>
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  const renderMessage = (msg) => {
    const isOwn = msg.user_id===user.id || msg.from_user_id===user.id;
    const isDeleted2 = msg.deleted === 1 || msg.text === 'This message was deleted';
    const imageMatch = !isDeleted2 && msg.text?.match(/\[IMAGE\](.*?)\[\/IMAGE\]/);
    const imageUrl2 = imageMatch ? imageMatch[1].replace('http://localhost:5000', window.location.origin.includes('localhost') ? 'http://localhost:5000' : window.location.origin).replace(/https:\/\/[a-z0-9-]+\.ngrok-free\.(app|dev)/, window.location.origin.includes('localhost') ? 'https://gong-unbend-chief.ngrok-free.dev' : window.location.origin) : null;
    const fileMatch = !isDeleted2 && msg.text?.match(/\[FILE\](.*?)\[\/FILE\]/);
    const fileData = fileMatch ? (() => { try { return JSON.parse(fileMatch[1]); } catch { return null; } })() : null;
    const isMissedCall = msg.deleted!==1 && msg.text && (msg.text.includes('Missed')||msg.text.includes('missed')) && (msg.text.includes('📞')||msg.text.includes('📹'));
    const isDeleted = isDeleted2;
    const msgReactions = reactions[msg.id] || {};
    const isChannel = !!activeChannel;

    return (
      <motion.div key={msg.id} id={`msg-${msg.id}`}
        initial={{ opacity:0, y:8, x:isOwn?20:-20 }}
        animate={{ opacity:1, y:0, x:0 }}
        transition={{ duration:0.25, ease:[0.34,1.56,0.64,1] }}
        className={`flex gap-2 px-4 py-1 message-bubble ${isOwn?'flex-row-reverse':'flex-row'}`}
        onContextMenu={e => !isDeleted && handleContextMenu(e, msg)}>

        {!isOwn && (
          <div className="flex-shrink-0 self-end">
            <Avatar user={{ username:msg.username, avatar_color:msg.avatar_color, avatar_url:msg.avatar_url }} size={30} />
          </div>
        )}

        <div className={`max-w-[65%] flex flex-col ${isOwn?'items-end':'items-start'}`}>
          {isChannel && !isOwn && <span className="text-xs font-semibold mb-1 px-1" style={{ color:'rgba(150,180,255,0.7)' }}>{msg.username}</span>}

          <div className={`relative px-3 py-2 rounded-2xl shadow-sm ${
            isDeleted ? 'italic' :
            isMissedCall ? 'border' : ''
          }`} style={{
            background: isDeleted ? 'rgba(255,255,255,0.04)' :
              isMissedCall ? 'rgba(239,68,68,0.1)' :
              isOwn ? 'linear-gradient(135deg, #4A90E2, #2563eb)' :
              dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.95)',
            border: isDeleted ? '1px solid rgba(255,255,255,0.08)' :
              isMissedCall ? '1px solid rgba(239,68,68,0.3)' :
              isOwn ? 'none' : dark ? '1px solid rgba(74,144,226,0.15)' : '1px solid rgba(74,144,226,0.25)',
            borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            boxShadow: isOwn ? '0 4px 15px rgba(74,144,226,0.25)' : 'none',
          }}>
            {/* Reply Quote */}
            {msg.reply_to_text && !isDeleted && (
              <div onClick={()=>{ const el=document.getElementById(`msg-${msg.reply_to_id}`); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); }}
                style={{ background:'rgba(74,144,226,0.12)', borderLeft:'3px solid #4A90E2', borderRadius:6, padding:'4px 8px', marginBottom:6, cursor:'pointer' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#4A90E2', marginBottom:1 }}>↩ {msg.reply_to_username}</div>
                <div style={{ fontSize:11, color:'rgba(180,200,255,0.8)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{msg.reply_to_text}</div>
              </div>
            )}
            {msg._decrypting ? (
              <p className="text-xs italic flex items-center gap-1.5" style={{ color:'rgba(150,180,255,0.5)' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:'currentColor', display:'inline-block', animation:'pulseGlow 1.2s ease-in-out infinite' }}/>
                Decrypting…
              </p>
            ) : isDeleted ? (
              <p className="text-xs italic" style={{ color:'rgba(150,180,255,0.4)' }}>🚫 This message was deleted</p>
            ) : imageMatch ? (
              <img src={imageUrl2} alt="shared"
                className="max-w-xs rounded-xl cursor-pointer transition-all hover:scale-105 hover:shadow-lg"
                style={{ boxShadow:'0 4px 20px rgba(74,144,226,0.2)' }}
                onClick={e=>{e.stopPropagation();setImageViewer(imageUrl2);}}
              />
            ) : fileData ? (
              <div style={{ minWidth:220, maxWidth:280 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:14, background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(74,144,226,0.1)', border: `1px solid ${getFileColor(fileData.type)}33` }}>
                  {/* File icon */}
                  <div style={{ width:42, height:42, borderRadius:10, background:`${getFileColor(fileData.type)}22`, border:`1.5px solid ${getFileColor(fileData.type)}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                    {getFileIcon(fileData.type)}
                  </div>
                  {/* File info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, color:'white', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={fileData.name}>{fileData.name}</p>
                    <p style={{ fontSize:11, color:'rgba(150,180,255,0.6)', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:0.5 }}>
                      {fileData.type?.toUpperCase() || 'FILE'} · {formatFileSize(fileData.size)}
                    </p>
                  </div>
                </div>
                {/* Download button */}
                <a href={fileData.url} download={fileData.name} target="_blank" rel="noreferrer"
                  style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:6, padding:'7px 14px', borderRadius:10, background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(74,144,226,0.15)', border: isOwn ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(74,144,226,0.3)', color:'white', fontSize:12, fontWeight:600, textDecoration:'none', transition:'all 0.2s', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background= isOwn ? 'rgba(255,255,255,0.25)' : 'rgba(74,144,226,0.25)'}
                  onMouseLeave={e=>e.currentTarget.style.background= isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(74,144,226,0.15)'}>
                  ⬇ Download
                </a>
              </div>
            ) : isMissedCall ? (
              <div className="flex items-center gap-2"><PhoneMissed size={14} style={{ color:'#ef4444' }} /><span className="text-sm" style={{ color:'#ef4444' }}>{msg.text}</span></div>
            ) : (
              <p className="text-sm leading-relaxed break-words" style={{ color: isOwn ? 'white' : dark ? 'white' : '#1a1a2e' }}>{msg.text}</p>
            )}
            {msg.edited===1 && !isDeleted && <span className="text-xs opacity-50 ml-1">(edited)</span>}
          </div>

          <div className={`flex items-center gap-1 mt-0.5 px-1 ${isOwn?'flex-row-reverse':'flex-row'}`}>
            <span className="text-xs" style={{ color:'rgba(150,180,255,0.4)' }}>{new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
            {isOwn && (() => {
              const isSeen = !!(msg.seen_at && msg.seen_at !== 'null' && msg.seen_at !== null && msg.seen_at !== undefined);
              return (
                <CheckCheck
                  size={13}
                  style={{ color: isSeen ? '#2563eb' : dark ? 'rgba(150,180,255,0.4)' : '#94a3b8', flexShrink:0 }}
                />
              );
            })()}
          </div>

          {Object.keys(msgReactions).length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {Object.entries(msgReactions).map(([emoji, users]) => (
                <span key={emoji} onClick={()=>handleReaction(msg.id,emoji)}
                  className="text-xs rounded-full px-2 py-0.5 cursor-pointer transition-all hover:scale-110"
                  title={users.map(u=>u.username).join(', ')}
                  style={{ background: users.find(u=>u.userId===user.id) ? 'rgba(74,144,226,0.35)' : 'rgba(74,144,226,0.15)', border:'1px solid rgba(74,144,226,0.4)', color:'white' }}>
                  {emoji} {users.length}
                </span>
              ))}
            </div>
          )}
        </div>

        {!isDeleted && (
          <button onClick={()=>setReplyTo(msg)} className="self-center p-1 opacity-0 hover:opacity-100 transition-opacity rounded-lg"
            style={{ color:'rgba(150,180,255,0.6)' }}>
            <Reply size={14} />
          </button>
        )}
      </motion.div>
    );
  };

  // ── IMAGE VIEWER ──
  const ImageViewer = ({ src, onClose, hideDownload = false }) => {
    const [zoom, setZoom] = useState(1);
    const [pos, setPos] = useState({ x:0, y:0 });
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x:0, y:0 });
    const imgRef = useRef();

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom(z => Math.max(0.5, Math.min(5, z + delta)));
    };

    const handleMouseDown = (e) => {
      setDragging(true);
      setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    };

    const handleMouseMove = (e) => {
      if (!dragging) return;
      setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    useEffect(() => {
      const el = imgRef.current;
      if (el) el.addEventListener('wheel', handleWheel, { passive: false });
      return () => { if (el) el.removeEventListener('wheel', handleWheel); };
    }, []);

    return (
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background:'rgba(0,0,0,0.95)', backdropFilter:'blur(20px)' }}
        onClick={onClose}>

        {/* Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button onClick={e=>{e.stopPropagation();setZoom(z=>Math.min(5,z+0.25));}}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-lg transition-all hover:scale-110"
            style={{ background:'rgba(74,144,226,0.3)', border:'1px solid rgba(74,144,226,0.5)' }}>+</button>
          <span className="text-white text-sm font-mono px-2 py-1 rounded" style={{ background:'rgba(0,0,0,0.5)' }}>{Math.round(zoom*100)}%</span>
          <button onClick={e=>{e.stopPropagation();setZoom(z=>Math.max(0.5,z-0.25));}}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-lg transition-all hover:scale-110"
            style={{ background:'rgba(74,144,226,0.3)', border:'1px solid rgba(74,144,226,0.5)' }}>−</button>
          <button onClick={e=>{e.stopPropagation();setZoom(1);setPos({x:0,y:0});}}
            className="px-3 h-9 rounded-full text-white text-xs font-semibold transition-all hover:scale-110"
            style={{ background:'rgba(74,144,226,0.3)', border:'1px solid rgba(74,144,226,0.5)' }}>Reset</button>
          {!hideDownload && (
            <button onClick={async e=>{
              e.stopPropagation();
              try {
                const response = await fetch(src);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chatspace_image_${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch {
                // Fallback - open in new tab
                window.open(src, '_blank');
              }
            }}
              className="px-3 h-9 rounded-full text-white text-xs font-semibold flex items-center gap-1 transition-all hover:scale-110"
              style={{ background:'rgba(34,197,94,0.3)', border:'1px solid rgba(34,197,94,0.5)' }}>
              ⬇ Download
            </button>
          )}
          <button onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-all hover:scale-110"
            style={{ background:'rgba(239,68,68,0.3)', border:'1px solid rgba(239,68,68,0.5)' }}>✕</button>
        </div>

        {/* Zoom hint */}
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs" style={{ color:'rgba(150,180,255,0.5)' }}>
          🖱️ Scroll to zoom · Drag to pan · Click outside to close
        </p>

        {/* Image */}
        <div ref={imgRef}
          style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect:'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={()=>setDragging(false)}
          onMouseLeave={()=>setDragging(false)}
          onClick={e=>e.stopPropagation()}>
          <motion.img
            src={src} alt="preview"
            style={{ transform:`translate(${pos.x}px,${pos.y}px) scale(${zoom})`, transformOrigin:'center', maxWidth:'85vw', maxHeight:'85vh', borderRadius:12, objectFit:'contain', boxShadow:'0 20px 60px rgba(0,0,0,0.8)' }}
            transition={{ type:'spring', damping:20 }}
            draggable={false}
          />
        </div>
      </motion.div>
    );
  };

  // ── MODAL STYLES ──
  const modalOverlay = { position:'fixed',inset:0,zIndex:50,background:'rgba(0,5,20,0.8)',backdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 };
  const modalCard = { borderRadius:20,padding:32,background:'rgba(3,8,28,0.95)',border:'1px solid rgba(74,144,226,0.25)',boxShadow:'0 0 100px rgba(20,50,200,0.2),0 40px 80px rgba(0,0,0,0.8)',width:'100%',maxWidth:400 };
  const inputSt = { width:'100%',padding:'12px 14px',borderRadius:10,fontSize:14,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(74,144,226,0.25)',color:'white',outline:'none',boxSizing:'border-box',fontFamily:'inherit',transition:'all 0.2s' };
  const btnPrimary = { width:'100%',padding:'13px 0',borderRadius:10,fontWeight:700,fontSize:14,background:'linear-gradient(135deg,#4A90E2,#2563eb)',border:'none',color:'white',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 20px rgba(74,144,226,0.4)',transition:'all 0.2s' };

  return (
    <div className="flex h-screen overflow-hidden chat-bg" style={{ fontFamily:"'Segoe UI',sans-serif" }}
      onClick={() => { setContextMenu(null); setShowEmoji(false); }}>

      {/* Stars background */}
      <StarsBackground />

      {/* ── SIDEBAR ── */}
      <motion.div initial={{ x:-20, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ duration:0.5 }}
        className="sidebar flex flex-col flex-shrink-0 z-10" style={{ width:240 }}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-between" style={{ borderBottom:'1px solid rgba(74,144,226,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'linear-gradient(135deg,#4A90E2,#2563eb)', boxShadow:'0 0 12px rgba(74,144,226,0.4)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <span className="font-bold text-sm text-white">ChatSpace Pro</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setNotifEnabled(!notifEnabled)} className="p-1.5 rounded-lg transition-all hover:scale-110" style={{ color:'rgba(150,180,255,0.6)' }} title={notifEnabled?'Mute':'Unmute'}>
              {notifEnabled ? <Bell size={13}/> : <BellOff size={13}/>}
            </button>
            <button onClick={toggle} className="p-1.5 rounded-lg transition-all hover:scale-110" style={{ color:'rgba(150,180,255,0.6)' }}>
              {dark ? <Sun size={13}/> : <Moon size={13}/>}
            </button>
          </div>
        </div>

        {/* Channels */}
        <div className="px-2 pt-2">
          <p style={{ fontSize:10, fontWeight:700, color:'rgba(150,180,255,0.45)', textTransform:'uppercase', letterSpacing:'0.12em', padding:'0 8px', marginBottom:4 }}>Channels</p>
          {CHANNELS.map(ch => {
            const meta = {
              'announcements':     { icon:'📢', label:'Announcements' },
              'tech-updates':      { icon:'💻', label:'Tech Updates' },
              'job-notifications': { icon:'💼', label:'Job Notifications' },
            };
            const m = meta[ch] || { icon:'#', label:ch };
            return (
              <button key={ch} onClick={()=>switchChannel(ch)}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:7,
                  padding:'5px 8px', borderRadius:7, fontSize:12, fontWeight:500,
                  marginBottom:2, textAlign:'left', border:'none', cursor:'pointer',
                  fontFamily:'inherit', transition:'all 0.15s',
                  color: activeChannel===ch ? '#4A90E2' : 'rgba(160,185,255,0.7)',
                  background: activeChannel===ch ? 'rgba(74,144,226,0.12)' : 'transparent',
                }}>
                <span style={{ fontSize:13, flexShrink:0 }}>{m.icon}</span>
                <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.label}</span>
                <UnreadBadge count={unreadCounts[`channel_${ch}`]} />
              </button>
            );
          })}
        </div>

        {/* Groups */}
        <div className="px-2 pt-2">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 8px', marginBottom:4 }}>
            <p style={{ fontSize:10, fontWeight:700, color:'rgba(150,180,255,0.45)', textTransform:'uppercase', letterSpacing:'0.12em', margin:0 }}>Groups</p>
            <button onClick={()=>setShowCreateGroup(true)} className="transition-all hover:scale-125" style={{ color:'rgba(150,180,255,0.5)', background:'none', border:'none', cursor:'pointer' }}><Plus size={13}/></button>
          </div>
          {/* Group search bar */}
          {groups.length > 0 && (
            <div style={{ position:'relative', marginBottom:6 }}>
              <input
                value={groupSearch}
                onChange={e => setGroupSearch(e.target.value)}
                placeholder="Search groups..."
                style={{ width:'100%', padding:'6px 10px 6px 28px', borderRadius:8, fontSize:12, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(74,144,226,0.2)', color:'white', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}
                onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.5)';}}
                onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.2)';}}
              />
              <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:12, pointerEvents:'none', color:'rgba(150,180,255,0.4)' }}>🔍</span>
              {groupSearch && (
                <button onClick={()=>setGroupSearch('')}
                  style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'rgba(150,180,255,0.5)', cursor:'pointer', fontSize:13 }}>✕</button>
              )}
            </div>
          )}
          <div style={{ maxHeight:76, overflowY:'auto' }}>
            {groups
              .filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
              .sort((a,b) => {
                const aTime = lastMessageTimes[`group_${a.id}`] || new Date(a.created_at).getTime();
                const bTime = lastMessageTimes[`group_${b.id}`] || new Date(b.created_at).getTime();
                return bTime - aTime;
              })
              .map(g => (
                <button key={g.id} onClick={()=>{ switchGroup(g); clearUnread(`group_${g.id}`); }}
                  className={`sidebar-item w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-0.5 ${activeGroup?.id===g.id?'active':''}`}
                  style={{ color: activeGroup?.id===g.id ? '#4A90E2' : 'rgba(150,180,255,0.65)', background: activeGroup?.id===g.id ? 'rgba(74,144,226,0.12)' : 'transparent' }}>
                  <Users size={14} style={{ flexShrink:0 }}/>
                  <span className="truncate flex-1">{g.name}</span>
                  {g.admin_id===user.id && <span className="text-xs" style={{ color:'#f59e0b' }}>★</span>}
                  <UnreadBadge count={unreadCounts[`group_${g.id}`]} />
                </button>
              ))
            }
            {groups.length > 0 && groupSearch && groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 && (
              <p style={{ fontSize:11, color:'rgba(150,180,255,0.4)', textAlign:'center', padding:'8px 0' }}>No groups found</p>
            )}
          </div>
        </div>

        {/* DMs */}
        <div className="px-2 pt-2 flex-1 overflow-y-auto">
          <p style={{ fontSize:10, fontWeight:700, color:'rgba(150,180,255,0.45)', textTransform:'uppercase', letterSpacing:'0.12em', padding:'0 8px', marginBottom:4 }}>Direct Messages</p>
          {/* DM Search */}
          <div style={{ position:'relative', marginBottom:6 }}>
            <input
              value={dmSearch}
              onChange={e => setDmSearch(e.target.value)}
              placeholder="Search users..."
              style={{ width:'100%', padding:'5px 8px 5px 26px', borderRadius:7, fontSize:11, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(74,144,226,0.2)', color:'white', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}
              onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.5)';}}
              onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.2)';}}
            />
            <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'rgba(150,180,255,0.4)', pointerEvents:'none' }}>🔍</span>
            {dmSearch && <button onClick={()=>setDmSearch('')} style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'rgba(150,180,255,0.5)', cursor:'pointer', fontSize:12 }}>✕</button>}
          </div>
          {users.filter(u => {
            if (!dmSearch) return true;
            const q = dmSearch.toLowerCase();
            return u.username.toLowerCase().includes(q) ||
              (u.user_code && u.user_code.toLowerCase().includes(q)) ||
              String(u.id).includes(q);
          })
            .slice()
            .sort((a,b) => {
              const aTime = lastMessageTimes[`dm_${a.id}`] || a.last_message_time || 0;
              const bTime = lastMessageTimes[`dm_${b.id}`] || b.last_message_time || 0;
              return bTime - aTime;
            })
            .map(u => (
            <button key={u.id} onClick={()=>switchDM(u)}
              className={`sidebar-item w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm mb-0.5 ${activeDM?.id===u.id?'active':''}`}
              style={{ color: activeDM?.id===u.id ? '#4A90E2' : 'rgba(150,180,255,0.65)', background: activeDM?.id===u.id ? 'rgba(74,144,226,0.12)' : 'transparent' }}>
              <Avatar user={u} size={24} showStatus />
              <div className="flex-1 min-w-0">
                <span className="truncate block">{u.username}</span>
                <span className="text-xs" style={{ color:'rgba(100,140,255,0.5)' }}>{formatUID(u.id)}</span>
              </div>
              {isOnline(u.id) && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 online-dot" style={{ background: STATUS_CONFIG[u.status||'online']?.hex || '#22c55e' }} />}
              <UnreadBadge count={unreadCounts[`dm_${u.id}`] ?? u.unread_count ?? 0} />
            </button>
          ))}
        </div>

        {/* Admin Panel Button - only for admin */}
        {/* Admin Panel - show for admin role */}
        <div className="px-2 pb-2">
          <button
            onClick={() => { console.log('Admin panel clicked, role:', user.role, 'user:', user); setShowAdminUsers(true); loadAdminUsers(); }}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, fontSize:13, fontWeight:700, background: user.role==='admin' ? 'rgba(245,158,11,0.15)' : 'rgba(74,144,226,0.1)', border: user.role==='admin' ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(74,144,226,0.2)', color: user.role==='admin' ? '#f59e0b' : 'rgba(74,144,226,0.5)', cursor:'pointer', fontFamily:'inherit' }}>
            {user.role==='admin' ? '👑' : '🔒'} {user.role==='admin' ? 'Admin Panel' : `Role: ${user.role}`}
          </button>
        </div>

        {/* User footer */}
        <div className="p-3 flex items-center gap-2" style={{ borderTop:'1px solid rgba(74,144,226,0.15)' }}>
          <button onClick={openAccount} className="flex-shrink-0 hover:scale-105 transition-transform">
            <Avatar user={user} size={32} showStatus />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user.username}</p>
            <p className="text-xs" style={{ color:'rgba(100,140,255,0.6)' }}>{formatUID(user.id)} · <span style={{ color: STATUS_CONFIG[user.status||'online']?.hex }}>● {STATUS_CONFIG[user.status||'online']?.label}</span></p>
          </div>
          <button onClick={logout} className="p-1.5 rounded-lg transition-all hover:scale-110" style={{ color:'#ef4444', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)' }} title="Logout">
            <LogOut size={13}/>
          </button>
        </div>
      </motion.div>

      {/* ── MAIN CHAT ── */}
      <div className="flex-1 flex flex-col overflow-hidden z-10">

        {/* Header */}
        <div className="chat-header h-14 flex items-center px-4 gap-3 flex-shrink-0">
          {activeDM ? (
            <button onClick={()=>setViewingProfile(activeDM)} className="hover:scale-105 transition-transform">
              <Avatar user={activeDM} size={32} showStatus />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:'rgba(74,144,226,0.15)', border:'1px solid rgba(74,144,226,0.25)' }}>
              {activeGroup ? <Users size={15} style={{ color:'#4A90E2' }}/> : <Hash size={15} style={{ color:'#4A90E2' }}/>}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`font-bold text-sm text-white ${activeDM ? 'cursor-pointer hover:underline' : ''}`} onClick={()=>{ if (activeDM) setViewingProfile(activeDM); }}>{getChatTitle()}</h2>
              {activeDM && <span className="text-xs px-1.5 py-0.5 rounded-md font-mono" style={{ background:'rgba(74,144,226,0.15)', color:'rgba(100,160,255,0.8)', border:'1px solid rgba(74,144,226,0.2)' }}>{formatUID(activeDM.id)}</span>}
            </div>
            {activeDM && <p className="text-xs" style={{ color:'rgba(150,180,255,0.5)' }}>{isOnline(activeDM.id) ? `● ${STATUS_CONFIG[activeDM.status||'online']?.label}` : `Last seen ${formatLastSeen(activeDM.last_seen)}`}</p>}
            {activeGroup && <p className="text-xs" style={{ color:'rgba(150,180,255,0.5)' }}>{groupMembersList.length} members{pinnedMessages.length>0?` · 📌 ${pinnedMessages.length} pinned`:''}</p>}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {activeDM && (
              <>
                <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }} onClick={()=>startCall('voice')} disabled={callLoading}
                  className="call-btn p-2 rounded-lg" style={{ background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.25)', color:'#22c55e' }}>
                  <Phone size={15}/>
                </motion.button>
                <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }} onClick={()=>startCall('video')} disabled={callLoading}
                  className="call-btn p-2 rounded-lg" style={{ background:'rgba(74,144,226,0.15)', border:'1px solid rgba(74,144,226,0.25)', color:'#4A90E2' }}>
                  <Video size={15}/>
                </motion.button>
              </>
            )}
            {activeGroup && (
              <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }} onClick={()=>startCall('video')} disabled={callLoading}
                className="call-btn p-2 rounded-lg" style={{ background:'rgba(74,144,226,0.15)', border:'1px solid rgba(74,144,226,0.25)', color:'#4A90E2' }} title="Group Video Call">
                <Video size={15}/>
              </motion.button>
            )}
            <button onClick={()=>setShowSearch(!showSearch)} className="p-2 rounded-lg transition-all hover:scale-110" style={{ color:'rgba(150,180,255,0.6)' }}><Search size={15}/></button>
            {activeGroup && <button onClick={()=>setShowAdminPanel(true)} className="p-2 rounded-lg transition-all hover:scale-110" style={{ color:'rgba(150,180,255,0.6)' }}><Users size={15}/></button>}
            <button onClick={()=>setShowInfo(!showInfo)} className="p-2 rounded-lg transition-all hover:scale-110" style={{ color:'rgba(150,180,255,0.6)' }}><Info size={15}/></button>
          </div>
        </div>

        {/* Pinned messages bar */}
        {activeGroup && pinnedMessages.length>0 && (
          <div className="pinned-bar px-4 py-1.5 flex items-center gap-2">
            <Pin size={11} style={{ color:'#4A90E2' }}/>
            <p className="text-xs truncate" style={{ color:'rgba(150,180,255,0.7)' }}>📌 {pinnedMessages[pinnedMessages.length-1]?.text}</p>
          </div>
        )}

        {/* Search bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
              className="px-4 py-2" style={{ borderBottom:'1px solid rgba(74,144,226,0.15)', background:'rgba(3,8,25,0.6)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'rgba(150,180,255,0.5)' }}/>
                <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search messages..."
                  className="w-full text-sm text-white outline-none"
                  style={{ ...inputSt, paddingLeft:32, paddingRight:32, padding:'8px 32px' }}
                  onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.6)';e.target.style.boxShadow='0 0 0 3px rgba(74,144,226,0.12)';}}
                  onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.25)';e.target.style.boxShadow='none';}}
                />
                {searchQuery && <button onClick={()=>setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color:'rgba(150,180,255,0.5)' }}><X size={13}/></button>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-1"
          style={{ background: dark ? 'transparent' : 'rgba(240,244,255,0.5)' }}>
          <AnimatePresence>{filteredMessages.map(renderMessage)}</AnimatePresence>
          {typingUsers.map(u => <TypingIndicator key={u} username={u}/>)}
          <div ref={messagesEndRef}/>
        </div>

        {/* Reply preview */}
        <AnimatePresence>
          {replyTo && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
              className="mx-4 mb-2 px-3 py-2 flex items-center gap-3 rounded-xl"
              style={{ background:'rgba(74,144,226,0.1)', border:'1px solid rgba(74,144,226,0.25)' }}>
              <Reply size={13} style={{ color:'#4A90E2' }}/>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color:'#4A90E2' }}>{replyTo.username}</p>
                <p className="text-xs truncate" style={{ color:'rgba(150,180,255,0.5)' }}>{replyTo.text}</p>
              </div>
              <button onClick={()=>setReplyTo(null)} style={{ color:'rgba(150,180,255,0.5)' }}><X size={13}/></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit bar */}
        <AnimatePresence>
          {editingMsg && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
              className="mx-4 mb-2 px-3 py-2 flex items-center gap-3 rounded-xl"
              style={{ background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)' }}>
              <Edit2 size={13} style={{ color:'#f59e0b' }}/>
              <input value={editText} onChange={e=>setEditText(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') handleEditMessage(); if(e.key==='Escape'){setEditingMsg(null);setEditText('');} }}
                className="flex-1 bg-transparent text-sm text-white focus:outline-none" placeholder="Edit message..."/>
              <button onClick={handleEditMessage} style={{ color:'#f59e0b' }}><Check size={13}/></button>
              <button onClick={()=>{setEditingMsg(null);setEditText('');}} style={{ color:'rgba(150,180,255,0.5)' }}><X size={13}/></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="chat-input-area flex-shrink-0">
          {activeChannel && !canPost ? (
            <div className="p-4 flex items-center justify-center gap-3">
              <span style={{ fontSize:22 }}>🔒</span>
              <div>
                <p className="text-sm font-semibold text-white">Read Only</p>
                <p className="text-xs" style={{ color:'rgba(150,180,255,0.5)' }}>
                  {activeChannel === 'announcements' ? 'Only admin can post in Announcements' : 'You need permission to post here'}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3">
              <div className="chat-input-box relative flex items-end gap-2 p-2 rounded-2xl">
                <button onClick={()=>fileInputRef.current?.click()} className="p-2 rounded-xl transition-all hover:scale-110 flex-shrink-0" title="Send Image" style={{ color:'rgba(150,180,255,0.6)' }}>
                  <Paperclip size={17}/>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageUpload}/>
                {/* Upload progress bar */}
                {isUploading && (
                  <div style={{ position:'absolute', bottom:'100%', left:0, right:0, padding:'8px 16px', background:'rgba(3,8,28,0.95)', borderTop:'1px solid rgba(74,144,226,0.2)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:11, color:'rgba(150,180,255,0.7)' }}>Uploading...</span>
                      <span style={{ fontSize:11, color:'#4A90E2', fontWeight:700 }}>{uploadProgress}%</span>
                    </div>
                    <div style={{ height:4, background:'rgba(74,144,226,0.15)', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${uploadProgress}%`, background:'linear-gradient(90deg,#2563eb,#4A90E2)', borderRadius:4, transition:'width 0.2s ease' }}/>
                    </div>
                  </div>
                )}
                <button onClick={()=>fileShareInputRef.current?.click()} className="p-2 rounded-xl transition-all hover:scale-110 flex-shrink-0" title="Share File" style={{ color:'rgba(150,180,255,0.6)' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="12"/><line x1="15" y1="15" x2="12" y2="12"/>
                  </svg>
                </button>
                <input ref={fileShareInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv,.mp3,.mp4,.json" style={{ display:'none' }} onChange={handleFileShare}/>
                <textarea ref={messageInputRef} value={input} onChange={handleTyping}
                  onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }}
                  placeholder={`Message ${getChatTitle()}...`} rows={1}
                  className="flex-1 bg-transparent text-sm text-white focus:outline-none resize-none py-1.5 max-h-32"
                  style={{ fontFamily:'inherit' }}/>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={e=>{e.stopPropagation();setShowEmoji(!showEmoji);}} className="p-2 rounded-xl transition-all hover:scale-110" style={{ color:'rgba(150,180,255,0.6)' }}>
                    <Smile size={17}/>
                  </button>
                  <motion.button onClick={sendMessage} whileHover={{ scale:1.08 }} whileTap={{ scale:0.92 }}
                    disabled={!input.trim()} className="send-btn p-2 rounded-xl text-white disabled:opacity-40">
                    <Send size={15}/>
                  </motion.button>
                </div>
                <AnimatePresence>
                  {showEmoji && (
                    <motion.div initial={{ opacity:0, scale:0.9, y:10 }} animate={{ opacity:1, scale:1, y:0 }}
                      exit={{ opacity:0, scale:0.9, y:10 }} onClick={e=>e.stopPropagation()}
                      className="absolute bottom-full right-0 mb-2 z-50">
                      <EmojiPicker onEmojiClick={e=>setInput(prev=>prev+e.emoji)} theme="dark" height={350} width={300}/>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── INFO PANEL ── */}
      <AnimatePresence>
        {showInfo && (
          <motion.div initial={{ width:0, opacity:0 }} animate={{ width:260, opacity:1 }} exit={{ width:0, opacity:0 }}
            className="z-10 flex-shrink-0 overflow-hidden" style={{ background:'rgba(3,8,25,0.9)', borderLeft:'1px solid rgba(74,144,226,0.15)', backdropFilter:'blur(20px)' }}>
            <div className="p-4 flex items-center justify-between" style={{ borderBottom:'1px solid rgba(74,144,226,0.15)' }}>
              <h3 className="font-bold text-sm text-white">{activeGroup?'Group Info':activeDM?'Profile':'Channel Info'}</h3>
              <button onClick={()=>setShowInfo(false)} style={{ color:'rgba(150,180,255,0.5)' }}><X size={15}/></button>
            </div>
            <div className="p-4 flex flex-col items-center gap-3">
              {activeDM ? (
                <>
                  <Avatar user={activeDM} size={64} showStatus />
                  <div className="text-center">
                    <p className="font-bold text-white">{activeDM.username}</p>
                    <p className="text-xs font-mono mt-1 px-2 py-0.5 rounded-md inline-block" style={{ background:'rgba(74,144,226,0.15)', color:'rgba(100,160,255,0.8)', border:'1px solid rgba(74,144,226,0.2)' }}>ID: {formatUID(activeDM.id)}</p>
                    <p className="text-xs mt-1" style={{ color: STATUS_CONFIG[activeDM.status||'online']?.hex }}>{isOnline(activeDM.id) ? `● ${STATUS_CONFIG[activeDM.status||'online']?.label}` : `Last seen ${formatLastSeen(activeDM.last_seen)}`}</p>
                    {activeDM.bio && <p className="text-xs mt-2 italic" style={{ color:'rgba(150,180,255,0.6)' }}>"{activeDM.bio}"</p>}
                  </div>
                  <div className="flex gap-2 w-full mt-2">
                    <button onClick={()=>startCall('voice')} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm transition-all hover:scale-105" style={{ background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)', color:'#22c55e' }}>
                      <Phone size={13}/> Call
                    </button>
                    <button onClick={()=>startCall('video')} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm transition-all hover:scale-105" style={{ background:'rgba(74,144,226,0.15)', border:'1px solid rgba(74,144,226,0.3)', color:'#4A90E2' }}>
                      <Video size={13}/> Video
                    </button>
                  </div>
                  <button onClick={()=>isBlocked(activeDM.id)?handleUnblock(activeDM.id):handleBlock(activeDM.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm transition-all hover:scale-105"
                    style={{ background: isBlocked(activeDM.id)?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)', border:`1px solid ${isBlocked(activeDM.id)?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`, color: isBlocked(activeDM.id)?'#22c55e':'#ef4444' }}>
                    {isBlocked(activeDM.id)?<><UserCheck size={13}/> Unblock</>:<><UserX size={13}/> Block User</>}
                  </button>
                </>
              ) : activeGroup ? (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background:'rgba(74,144,226,0.2)', border:'1px solid rgba(74,144,226,0.35)' }}>
                    <Users size={24} style={{ color:'#4A90E2' }}/>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-white">{activeGroup.name}</p>
                    <p className="text-xs mt-1" style={{ color:'rgba(150,180,255,0.5)' }}>{groupMembersList.length} members</p>
                  </div>
                  {pinnedMessages.length>0 && (
                    <div className="w-full">
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(150,180,255,0.5)' }}>📌 Pinned</p>
                      {pinnedMessages.map(m=>(
                        <div key={m.id} className="text-xs truncate px-2 py-1 mb-1 rounded-lg" style={{ background:'rgba(74,144,226,0.1)', border:'1px solid rgba(74,144,226,0.2)', color:'rgba(150,180,255,0.7)' }}>{m.text}</div>
                      ))}
                    </div>
                  )}
                  <div className="w-full">
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(150,180,255,0.5)' }}>Members</p>
                    {groupMembersList.map(m=>(
                      <div key={m.id} className="flex items-center gap-2 py-1.5">
                        <Avatar user={m} size={26} showStatus />
                        <span className="text-sm text-white">{m.username}</span>
                        {m.id===activeGroup.admin_id && <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background:'rgba(245,158,11,0.15)', color:'#f59e0b' }}>admin</span>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background:'rgba(74,144,226,0.2)', border:'1px solid rgba(74,144,226,0.35)' }}>
                    <Hash size={24} style={{ color:'#4A90E2' }}/>
                  </div>
                  <p className="font-bold text-white">#{activeChannel}</p>
                  <p className="text-xs mt-1" style={{ color:'rgba(150,180,255,0.5)' }}>{onlineUsers.length} online</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTEXT MENU ── */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.9 }}
            onClick={e=>e.stopPropagation()} className="context-menu fixed z-50 rounded-xl p-2 min-w-[170px]"
            style={{ left:contextMenu.x, top:contextMenu.y }}>
            <div className="flex gap-1 mb-2 px-2">
              {['👍','❤️','😂','😮','😢','🔥'].map(emoji=>(
                <button key={emoji} onClick={()=>handleReaction(contextMenu.msg.id,emoji)} className="text-lg hover:scale-125 transition-transform">{emoji}</button>
              ))}
            </div>
            <div className="pt-1" style={{ borderTop:'1px solid rgba(74,144,226,0.15)' }}>
              {[
                { icon:<Reply size={13}/>, label:'Reply', action:()=>{setReplyTo(contextMenu.msg);setContextMenu(null);} },
                { icon:<Forward size={13}/>, label:'Forward', action:()=>{setForwardMsg(contextMenu.msg);setContextMenu(null);} },
                ...((Number(contextMenu.msg.user_id)===Number(user.id)) || (Number(contextMenu.msg.from_user_id)===Number(user.id)) || (contextMenu.msg.user_id===user.id) || (contextMenu.msg.from_user_id===user.id) || (String(contextMenu.msg.user_id)===String(user.id)) || (String(contextMenu.msg.from_user_id)===String(user.id)) ? [
                  ...(!contextMenu.msg.text?.includes('[IMAGE]') ? [{ icon:<Edit2 size={13}/>, label:'Edit', action:()=>{setEditingMsg({...contextMenu.msg,type:activeDM?'private':activeGroup?'group':'channel'});setEditText(contextMenu.msg.text);setContextMenu(null);} }] : []),
                  { icon:<Trash2 size={13}/>, label:'Delete', action:()=>handleDeleteMessage(contextMenu.msg), red:true },
                ] : []),
                ...(activeGroup&&activeGroup.admin_id===user.id ? [{ icon:<Pin size={13}/>, label:'Pin', action:()=>handlePinMessage(contextMenu.msg), yellow:true }] : []),
              ].map((item,i)=>(
                <button key={i} onClick={item.action}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: item.red ? '#ef4444' : item.yellow ? '#f59e0b' : 'rgba(200,220,255,0.8)' }}>
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CREATE GROUP ── */}
      {showCreateGroup && (
        <div style={modalOverlay} onClick={()=>setShowCreateGroup(false)}>
          <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} onClick={e=>e.stopPropagation()} style={{ ...modalCard, maxWidth:440 }}>
            <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2"><Users size={19} style={{ color:'#4A90E2' }}/> Create Group</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

              {/* Group name */}
              <input value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Group name" style={inputSt}
                onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.7)';e.target.style.boxShadow='0 0 0 3px rgba(74,144,226,0.12)';}}
                onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.25)';e.target.style.boxShadow='none';}}/>

              {/* Member search */}
              <div>
                <p style={{ fontSize:11,color:'rgba(150,180,255,0.6)',marginBottom:8,textTransform:'uppercase',letterSpacing:1,fontWeight:700 }}>Add Members</p>
                <div style={{ position:'relative',marginBottom:8 }}>
                  <input
                    value={groupMemberSearch}
                    onChange={e=>setGroupMemberSearch(e.target.value)}
                    placeholder="Search by username or User ID..."
                    style={{ ...inputSt, paddingLeft:36 }}
                    onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.7)';e.target.style.boxShadow='0 0 0 3px rgba(74,144,226,0.12)';}}
                    onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.25)';e.target.style.boxShadow='none';}}
                  />
                  <span style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:14,pointerEvents:'none' }}>🔍</span>
                </div>

                {/* Search results */}
                {groupMemberSearch && (
                  <div style={{ maxHeight:160,overflowY:'auto',borderRadius:10,border:'1px solid rgba(74,144,226,0.2)',background:'rgba(3,8,28,0.95)',marginBottom:8 }}>
                    {users.filter(u =>
                      u.username.toLowerCase().includes(groupMemberSearch.toLowerCase()) ||
                      (u.user_code && u.user_code.toLowerCase().includes(groupMemberSearch.toLowerCase())) ||
                      String(u.id).includes(groupMemberSearch)
                    ).map(u => {
                      const already = selectedGroupMembers.find(m => m.id === u.id);
                      return (
                        <div key={u.id}
                          onClick={() => {
                            if (!already) setSelectedGroupMembers(prev => [...prev, u]);
                            setGroupMemberSearch('');
                          }}
                          style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid rgba(74,144,226,0.1)',transition:'background 0.15s' }}
                          onMouseEnter={e=>e.currentTarget.style.background='rgba(74,144,226,0.1)'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <Avatar user={u} size={28} />
                          <div>
                            <p style={{ fontSize:13,fontWeight:600,color:'white',margin:0 }}>{u.username}</p>
                            <p style={{ fontSize:11,fontFamily:'monospace',color:'rgba(100,140,255,0.6)',margin:0 }}>{u.user_code || `CSP-${user.companyCode}-${String(u.id).padStart(6,'0')}`}</p>
                          </div>
                          {already && <span style={{ marginLeft:'auto',color:'#22c55e',fontSize:12 }}>✓ Added</span>}
                        </div>
                      );
                    })}
                    {users.filter(u =>
                      u.username.toLowerCase().includes(groupMemberSearch.toLowerCase()) ||
                      (u.user_code && u.user_code.toLowerCase().includes(groupMemberSearch.toLowerCase()))
                    ).length === 0 && (
                      <p style={{ textAlign:'center',color:'rgba(150,180,255,0.4)',fontSize:13,padding:16 }}>No users found</p>
                    )}
                  </div>
                )}

                {/* Selected members */}
                {selectedGroupMembers.length > 0 && (
                  <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                    {selectedGroupMembers.map(m => (
                      <div key={m.id} style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:20,background:'rgba(74,144,226,0.15)',border:'1px solid rgba(74,144,226,0.3)' }}>
                        <span style={{ fontSize:12,color:'white',fontWeight:600 }}>{m.username}</span>
                        <button onClick={()=>setSelectedGroupMembers(prev=>prev.filter(x=>x.id!==m.id))}
                          style={{ background:'none',border:'none',color:'rgba(150,180,255,0.6)',cursor:'pointer',padding:0,fontSize:14,lineHeight:1 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {selectedGroupMembers.length === 0 && !groupMemberSearch && (
                  <p style={{ fontSize:12,color:'rgba(150,180,255,0.4)',textAlign:'center' }}>Search and select members above</p>
                )}
              </div>

              {groupError && <p style={{ color:'#f87171', fontSize:12, margin:0 }}>{groupError}</p>}

              <div style={{ display:'flex',gap:12,paddingTop:4 }}>
                <button onClick={handleCreateGroup} style={btnPrimary}>
                  Create Group {selectedGroupMembers.length > 0 && `(${selectedGroupMembers.length} members)`}
                </button>
                <button onClick={()=>{setShowCreateGroup(false);setSelectedGroupMembers([]);setGroupMemberSearch('');}}
                  style={{ ...btnPrimary, background:'rgba(255,255,255,0.06)', boxShadow:'none', border:'1px solid rgba(74,144,226,0.2)', color:'rgba(150,180,255,0.7)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── GROUP ADMIN PANEL ── */}
      {showAdminPanel && activeGroup && (
        <div style={modalOverlay} onClick={()=>setShowAdminPanel(false)}>
          <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} onClick={e=>e.stopPropagation()} style={{ ...modalCard, maxHeight:'80vh', overflowY:'auto' }}>
            {editingGroupName ? (
              <div className="flex items-center gap-2 mb-5">
                <input
                  autoFocus
                  value={groupNameInput}
                  onChange={e => setGroupNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameGroup(); if (e.key === 'Escape') setEditingGroupName(false); }}
                  style={{ ...inputSt, flex: 1 }}
                />
                <button onClick={handleRenameGroup} className="p-2 rounded-lg" style={{ background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)', color:'#22c55e' }}><Check size={15}/></button>
                <button onClick={()=>setEditingGroupName(false)} className="p-2 rounded-lg" style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444' }}><X size={15}/></button>
              </div>
            ) : (
              <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
                <Users size={19} style={{ color:'#4A90E2' }}/> {activeGroup.name}
                {activeGroup.admin_id===user.id && (
                  <button onClick={()=>{ setGroupNameInput(activeGroup.name); setEditingGroupName(true); }}
                    className="p-1 rounded-lg transition-all hover:scale-110" style={{ color:'rgba(150,180,255,0.5)' }} title="Rename group">
                    <Edit2 size={14}/>
                  </button>
                )}
              </h2>
            )}
            {activeGroup.admin_id===user.id && (
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(150,180,255,0.5)' }}>Add Member</p>
                <div style={{ position:'relative' }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <div style={{ flex:1, position:'relative' }}>
                      <input
                        value={addMemberSearch}
                        onChange={e => { setAddMemberSearch(e.target.value); setShowAddMemberDropdown(true); }}
                        onFocus={() => setShowAddMemberDropdown(true)}
                        placeholder="Search by username or User ID..."
                        style={{ ...inputSt, paddingLeft:36 }}
                        onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.7)'; setShowAddMemberDropdown(true);}}
                        onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.25)'; setTimeout(()=>setShowAddMemberDropdown(false), 200);}}
                      />
                      <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, pointerEvents:'none' }}>🔍</span>
                    </div>
                  </div>
                  {/* Search dropdown */}
                  {showAddMemberDropdown && addMemberSearch && (
                    <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:100, borderRadius:10, border:'1px solid rgba(74,144,226,0.3)', background:'rgba(3,8,28,0.98)', boxShadow:'0 8px 30px rgba(0,0,0,0.5)', maxHeight:200, overflowY:'auto', marginTop:4 }}>
                      {users
                        .filter(u => {
                          // Exclude already added members
                          const alreadyMember = groupMembersList.find(m => m.id === u.id);
                          if (alreadyMember) return false;
                          const q = addMemberSearch.toLowerCase();
                          return u.username.toLowerCase().includes(q) ||
                            (u.user_code && u.user_code.toLowerCase().includes(q)) ||
                            String(u.id).includes(q);
                        })
                        .map(u => (
                          <div key={u.id}
                            onMouseDown={() => handleAddMember(u)}
                            style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid rgba(74,144,226,0.1)', transition:'background 0.15s' }}
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(74,144,226,0.12)'}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <Avatar user={u} size={28} />
                            <div>
                              <p style={{ fontSize:13, fontWeight:600, color:'white', margin:0 }}>{u.username}</p>
                              <p style={{ fontSize:11, fontFamily:'monospace', color:'rgba(100,140,255,0.6)', margin:0 }}>{u.user_code || formatUID(u.id)}</p>
                            </div>
                            <span style={{ marginLeft:'auto', fontSize:11, color:'#22c55e', fontWeight:600 }}>+ Add</span>
                          </div>
                        ))
                      }
                      {users.filter(u => {
                        const alreadyMember = groupMembersList.find(m => m.id === u.id);
                        if (alreadyMember) return false;
                        const q = addMemberSearch.toLowerCase();
                        return u.username.toLowerCase().includes(q) || (u.user_code && u.user_code.toLowerCase().includes(q)) || String(u.id).includes(q);
                      }).length === 0 && (
                        <p style={{ textAlign:'center', color:'rgba(150,180,255,0.4)', fontSize:13, padding:16 }}>No users found</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {adminError && <p style={{ color:'#f87171', fontSize:12, marginBottom:8 }}>{adminError}</p>}
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:'rgba(150,180,255,0.5)' }}>Members</p>
            <div className="space-y-2 mb-4">
              {groupMembersList.map(m=>(
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(74,144,226,0.15)' }}>
                  <Avatar user={m} size={32} showStatus />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{m.username}</p>
                    <p className="text-xs font-mono" style={{ color:'rgba(100,140,255,0.55)' }}>{formatUID(m.id)}{m.id===activeGroup.admin_id?' · ★ Admin':''}</p>
                  </div>
                  {activeGroup.admin_id===user.id && m.id!==user.id && m.id!==activeGroup.admin_id && (
                    <div className="flex gap-1">
                      <button onClick={()=>handleMakeAdmin(m.id)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all hover:scale-105" style={{ background:'rgba(245,158,11,0.15)', border:'1px solid rgba(245,158,11,0.3)', color:'#f59e0b' }}>
                        <Shield size={10}/> Admin
                      </button>
                      <button onClick={()=>handleRemoveMember(m.id)} className="text-xs px-2 py-1 rounded-lg transition-all hover:scale-105" style={{ background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444' }}>Remove</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {activeGroup.admin_id===user.id && (
              <button onClick={handleEnableGroupEncryption} disabled={enablingEncryption}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm mb-2 transition-all hover:scale-102"
                style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', color:'#22c55e', opacity: enablingEncryption?0.6:1 }}>
                🔐 {enablingEncryption ? 'Enabling…' : 'Enable End-to-End Encryption'}
              </button>
            )}
            {activeGroup.admin_id!==user.id ? (
              <button onClick={handleLeaveGroup} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm mb-2 transition-all hover:scale-102" style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444' }}>
                <LogOut size={14}/> Leave Group
              </button>
            ) : (
              <button onClick={()=>{ setShowAdminPanel(false); handleDeleteGroup(activeGroup.id); }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm mb-2 transition-all hover:scale-102" style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444' }}>
                <Trash2 size={14}/> Delete Group
              </button>
            )}
            <button onClick={()=>{setShowAdminPanel(false);setAdminError('');}} className="w-full py-2.5 rounded-xl text-sm transition-all" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(74,144,226,0.2)', color:'rgba(150,180,255,0.6)' }}>Close</button>
          </motion.div>
        </div>
      )}

      {/* ── FORWARD MODAL ── */}
      {forwardMsg && (
        <div style={modalOverlay} onClick={()=>setForwardMsg(null)}>
          <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} onClick={e=>e.stopPropagation()} style={modalCard}>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Forward size={19} style={{ color:'#4A90E2' }}/> Forward to...</h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {users.map(u=>(
                <button key={u.id} onClick={()=>handleForward(u.id)} className="w-full flex items-center gap-3 p-3 rounded-xl transition-all hover:scale-102"
                  style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(74,144,226,0.15)' }}>
                  <Avatar user={u} size={32} showStatus />
                  <span className="text-sm font-semibold text-white">{u.username}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>setForwardMsg(null)} className="w-full mt-4 py-2.5 rounded-xl text-sm" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(74,144,226,0.2)', color:'rgba(150,180,255,0.6)' }}>Cancel</button>
          </motion.div>
        </div>
      )}

      {/* ── ACCOUNT MODAL ── */}
      {showAccount && (
        <div style={modalOverlay} onClick={()=>setShowAccount(false)}>
          <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} onClick={e=>e.stopPropagation()} style={{ ...modalCard, overflowY:'auto', maxHeight:'90vh' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><User size={19} style={{ color:'#4A90E2' }}/> My Account</h2>
              <span className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background:'rgba(74,144,226,0.15)', color:'rgba(100,160,255,0.9)', border:'1px solid rgba(74,144,226,0.25)' }}>ID: {formatUID(user.id)}</span>
            </div>
            <div className="flex flex-col items-center gap-3 mb-5">
              <div style={{ position:'relative', display:'inline-block' }}>
                <div className="relative cursor-pointer group" onClick={()=>avatarInputRef.current?.click()}>
                  <Avatar user={{ ...user, avatar_color:accountForm.avatar_color }} size={80} />
                  <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background:'rgba(0,0,0,0.6)' }}>
                    <Camera size={18} color="white"/>
                  </div>
                </div>
                {user.avatar_url && (
                  <button
                    onClick={async()=>{
                      try {
                        await axios.put(`${API}/users/profile`, { avatar_url: '' });
                        setUser(prev => ({ ...prev, avatar_url: null }));
                        addToast({ title:'Profile photo removed!', message:'' });
                      } catch(err) {
                        console.error('Remove avatar error:', err.response?.data || err.message);
                        addToast({ title:'Failed to remove', message: err.response?.data?.message || err.message });
                      }
                    }}
                    title="Remove profile photo"
                    style={{ position:'absolute', top:-2, right:-2, width:24, height:24, borderRadius:'50%', background:'#ef4444', border:'2px solid #0a0f1e', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex:10 }}>
                    <X size={12} color="white"/>
                  </button>
                )}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={async e=>{
                const file = e.target.files[0];
                if (!file) return;
                // Show simple crop confirmation
                const url = URL.createObjectURL(file);
                const confirmed = window.confirm('Upload this photo as your profile picture?');
                URL.revokeObjectURL(url);
                if (!confirmed) { e.target.value=''; return; }
                await updateAvatar(file);
              }}/>
              <p className="text-xs" style={{ color:'rgba(150,180,255,0.5)' }}>Click photo to change · ✕ to remove</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color:'rgba(150,180,255,0.6)' }}>Username</label>
                <input value={accountForm.username} onChange={e=>setAccountForm(p=>({...p,username:e.target.value}))} style={inputSt}
                  onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.7)';}} onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.25)';}}/>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color:'rgba(150,180,255,0.6)' }}>Bio</label>
                <textarea value={accountForm.bio} onChange={e=>setAccountForm(p=>({...p,bio:e.target.value}))} maxLength={200} rows={3}
                  placeholder="Tell people about yourself..." style={{ ...inputSt, resize:'none' }}
                  onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.7)';}} onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.25)';}}/>
                <p className="text-right text-xs mt-1" style={{ color:'rgba(150,180,255,0.4)' }}>{accountForm.bio.length}/200</p>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-2" style={{ color:'rgba(150,180,255,0.6)' }}>Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key,val])=>(
                    <button key={key} onClick={()=>setAccountForm(p=>({...p,status:key}))}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105"
                      style={{ border: accountForm.status===key?`1.5px solid ${val.hex}`:'1px solid rgba(74,144,226,0.2)', background: accountForm.status===key?`${val.hex}22`:'rgba(255,255,255,0.04)', color:'white' }}>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background:val.hex, boxShadow:`0 0 6px ${val.hex}` }}/>
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>

              {accountError && <p style={{ color:'#f87171', fontSize:12 }}>{accountError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveAccount} disabled={accountSaving} style={btnPrimary}>
                  {accountSaving ? <span className="flex items-center justify-center gap-2"><span style={{ width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite' }}/> Saving...</span> : <><Save size={14} style={{ display:'inline',marginRight:6 }}/> Save Changes</>}
                </button>
                <button onClick={()=>setShowAccount(false)} style={{ ...btnPrimary, background:'rgba(255,255,255,0.06)', boxShadow:'none', border:'1px solid rgba(74,144,226,0.2)', color:'rgba(150,180,255,0.7)' }}>Cancel</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── VIEW PROFILE MODAL (read-only, for viewing another user's profile) ── */}
      {viewingProfile && (
        <div style={modalOverlay} onClick={()=>setViewingProfile(null)}>
          <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} onClick={e=>e.stopPropagation()} style={{ ...modalCard, maxWidth:340 }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><User size={19} style={{ color:'#4A90E2' }}/> Profile</h2>
              <button onClick={()=>setViewingProfile(null)} className="p-1 rounded-lg hover:scale-110 transition-all" style={{ color:'rgba(150,180,255,0.5)' }}><X size={16}/></button>
            </div>
            <div className="flex flex-col items-center gap-3 mb-5">
              <button
                onClick={()=>{ if (viewingProfile.avatar_url) setImageViewer({ src:`https://gong-unbend-chief.ngrok-free.dev${viewingProfile.avatar_url}`, hideDownload:true }); }}
                className={viewingProfile.avatar_url ? 'cursor-pointer hover:scale-105 transition-transform' : 'cursor-default'}
                title={viewingProfile.avatar_url ? 'View full photo' : ''}>
                <Avatar user={viewingProfile} size={88} showStatus />
              </button>
              <div className="text-center">
                <p className="text-base font-bold text-white">{viewingProfile.username}</p>
                <p className="text-xs font-mono mt-1" style={{ color:'rgba(100,160,255,0.7)' }}>{formatUID(viewingProfile.id)}</p>
              </div>
              <p className="text-xs" style={{ color: STATUS_CONFIG[viewingProfile.status||'online']?.hex }}>
                {isOnline(viewingProfile.id) ? `● ${STATUS_CONFIG[viewingProfile.status||'online']?.label}` : `Last seen ${formatLastSeen(viewingProfile.last_seen)}`}
              </p>
              {viewingProfile.bio && <p className="text-sm text-center italic mt-1" style={{ color:'rgba(200,220,255,0.7)' }}>"{viewingProfile.bio}"</p>}
              {viewingProfile.role && <span className="text-xs px-2 py-1 rounded-lg mt-2" style={{ background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.25)', color:'#f59e0b' }}>{viewingProfile.role}</span>}
            </div>
            <div className="flex gap-3">
              <button onClick={()=>{ setViewingProfile(null); switchDM(viewingProfile); }} style={btnPrimary}>
                <Send size={14} style={{ display:'inline', marginRight:6 }}/> Message
              </button>
              <button onClick={()=>setViewingProfile(null)} style={{ ...btnPrimary, background:'rgba(255,255,255,0.06)', boxShadow:'none', border:'1px solid rgba(74,144,226,0.2)', color:'rgba(150,180,255,0.7)' }}>Close</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* INCOMING CALL */}
      <AnimatePresence>
        {incomingCall && <IncomingCall caller={incomingCall.fromUser} callType={incomingCall.callType} onAccept={acceptCall} onReject={rejectCall}/>}
      </AnimatePresence>

      {/* ACTIVE CALL */}
      <AnimatePresence>
        {activeCall && <ActiveCall callType={activeCall.callType} remoteUser={activeCall.remoteUser} onEnd={endCall} localVideoRef={localVideoRef} remoteVideoRef={remoteVideoRef} onScreenShare={toggleScreenShare} screenSharing={screenSharing}/>}
      </AnimatePresence>

      {/* IMAGE VIEWER */}
      <AnimatePresence>
        {imageViewer && (
          <ImageViewer
            src={typeof imageViewer === 'string' ? imageViewer : imageViewer.src}
            hideDownload={typeof imageViewer === 'object' && !!imageViewer.hideDownload}
            onClose={()=>setImageViewer(null)}
          />
        )}
      </AnimatePresence>

      {/* ── ADMIN USERS PANEL ── */}
      {showAdminUsers && (
        <div style={{ position:'fixed',inset:0,zIndex:50,background:'rgba(0,5,20,0.85)',backdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}
          onClick={()=>setShowAdminUsers(false)}>
          <div onClick={e=>e.stopPropagation()} style={{ borderRadius:20,padding:32,background:'rgba(3,8,28,0.98)',border:'1px solid rgba(245,158,11,0.3)',boxShadow:'0 0 100px rgba(245,158,11,0.1),0 40px 80px rgba(0,0,0,0.8)',width:'100%',maxWidth:560,maxHeight:'85vh',overflowY:'auto' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24 }}>
              <h2 style={{ fontSize:18,fontWeight:700,color:'white',margin:0 }}>👑 Admin Panel</h2>
              <button onClick={()=>{setShowAdminUsers(false);setAdminSearch('');}} style={{ color:'rgba(150,180,255,0.5)',background:'none',border:'none',cursor:'pointer',fontSize:18 }}>✕</button>
            </div>
            <div style={{ display:'flex',gap:8,marginBottom:20,flexWrap:'wrap' }}>
              {['announcements','tech-updates','job-notifications'].map(ch => (
                <div key={ch} style={{ padding:'4px 10px',borderRadius:8,fontSize:11,background:'rgba(74,144,226,0.1)',border:'1px solid rgba(74,144,226,0.2)',color:'rgba(150,180,255,0.7)' }}>
                  {ch==='announcements'?'📢':ch==='tech-updates'?'💻':'💼'} {ch}
                </div>
              ))}
            </div>
            {/* Search bar */}
            <div style={{ position:'relative',marginBottom:16 }}>
              <input
                type="text"
                value={adminSearch}
                onChange={e => setAdminSearch(e.target.value)}
                placeholder="Search by username or User ID (e.g. CSP-VITS-000002)..."
                style={{ width:'100%',padding:'10px 16px 10px 38px',borderRadius:10,fontSize:13,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(74,144,226,0.3)',color:'white',outline:'none',boxSizing:'border-box',fontFamily:'inherit',transition:'all 0.2s' }}
                onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.7)';e.target.style.boxShadow='0 0 0 3px rgba(74,144,226,0.12)';}}
                onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.3)';e.target.style.boxShadow='none';}}
              />
              <span style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:15,pointerEvents:'none' }}>🔍</span>
              {adminSearch && (
                <button onClick={()=>setAdminSearch('')}
                  style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'rgba(150,180,255,0.6)',cursor:'pointer',fontSize:16 }}>✕</button>
              )}
            </div>

            <p style={{ fontSize:11,color:'rgba(150,180,255,0.5)',marginBottom:16,textTransform:'uppercase',letterSpacing:1,fontWeight:700 }}>
              Users & Permissions {adminSearch && <span style={{ color:'#4A90E2' }}>— filtering results</span>}
            </p>
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              {adminUsers.filter(u => u.id !== user.id).length === 0 && (
                <p style={{ textAlign:'center',color:'rgba(150,180,255,0.4)',fontSize:14,padding:24 }}>No other users yet</p>
              )}
              {adminUsers.filter(u => u.id !== user.id).length > 0 && 
               adminSearch &&
               adminUsers.filter(u => {
                 if (u.id === user.id) return false;
                 const q = adminSearch.toLowerCase();
                 const generatedCode = u.user_code || `CSP-${user.companyCode}-${String(u.id).padStart(6,'0')}`;
                 return u.username.toLowerCase().includes(q) || generatedCode.toLowerCase().includes(q) || String(u.id).includes(q);
               }).length === 0 && (
                <p style={{ textAlign:'center',color:'rgba(150,180,255,0.4)',fontSize:14,padding:16 }}>No users match "<strong style={{color:'#4A90E2'}}>{adminSearch}</strong>"</p>
              )}
              {adminUsers.filter(u => {
                if (u.id === user.id) return false;
                if (!adminSearch) return true;
                const q = adminSearch.toLowerCase();
                // Generate code if missing using company code
                const generatedCode = u.user_code || `CSP-${user.companyCode}-${String(u.id).padStart(6,'0')}`;
                return (
                  u.username.toLowerCase().includes(q) ||
                  generatedCode.toLowerCase().includes(q) ||
                  String(u.id).includes(q)
                );
              }).map(u => {
                const userPerms = allPermissions.filter(p => Number(p.user_id) === Number(u.id)).map(p => p.channel);
                // Generate code if missing
                const displayCode = u.user_code || `CSP-${user.companyCode}-${String(u.id).padStart(6,'0')}`;
                return (
                  <div key={u.id} style={{ padding:16,borderRadius:14,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(74,144,226,0.15)' }}>
                    <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:u.role==='member'?12:6 }}>
                      <Avatar user={u} size={36} />
                      <div style={{ flex:1,minWidth:0 }}>
                        <p style={{ fontSize:14,fontWeight:700,color:'white',margin:0 }}>{u.username}</p>
                        <p style={{ fontSize:11,fontFamily:'monospace',color:'rgba(100,140,255,0.6)',margin:0 }}>{u.user_code || `CSP-${user.companyCode}-${String(u.id).padStart(6,'0')}`}</p>
                      </div>
                      <select value={u.role} onChange={e => handleSetRole(u.id, e.target.value)}
                        style={{ padding:'6px 10px',borderRadius:8,fontSize:12,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(74,144,226,0.3)',color:'white',cursor:'pointer',outline:'none',fontFamily:'inherit' }}>
                        <option value="member" style={{ background:'#050d1f' }}>👤 Member</option>
                        <option value="team_lead" style={{ background:'#050d1f' }}>⭐ Team Lead</option>
                        <option value="admin" style={{ background:'#050d1f' }}>👑 Admin</option>
                      </select>
                    </div>
                    {u.role === 'member' && (
                      <div>
                        <p style={{ fontSize:11,color:'rgba(150,180,255,0.5)',marginBottom:8 }}>Channel Permissions:</p>
                        <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                          {['tech-updates','job-notifications'].map(ch => {
                            const hasPerm = userPerms.includes(ch);
                            return (
                              <button key={ch} onClick={() => hasPerm ? handleRevokePermission(u.id,ch) : handleGrantPermission(u.id,ch)}
                                style={{ fontSize:12,padding:'6px 14px',borderRadius:8,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                                  background:hasPerm?'rgba(34,197,94,0.2)':'rgba(255,255,255,0.06)',
                                  border:hasPerm?'1px solid rgba(34,197,94,0.4)':'1px solid rgba(74,144,226,0.2)',
                                  color:hasPerm?'#22c55e':'rgba(150,180,255,0.6)' }}>
                                {hasPerm?'✓':'+'} {ch==='tech-updates'?'💻 Tech Updates':'💼 Job Notifications'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {u.role==='team_lead' && <p style={{ fontSize:11,color:'rgba(245,158,11,0.7)',margin:0 }}>⭐ Can post in Tech Updates & Job Notifications</p>}
                    {u.role==='admin' && <p style={{ fontSize:11,color:'rgba(74,144,226,0.7)',margin:0 }}>👑 Full access to all channels</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <video ref={localVideoRef} autoPlay playsInline muted className="hidden"/>
      <video ref={remoteVideoRef} autoPlay playsInline className="hidden"/>

      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; }
      `}</style>
    </div>
  );
}