# 💬 ChatSpace Pro

> A Real-Time Multi-Tenant SaaS Chat Platform for Colleges & Organizations

![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red)
![Tech](https://img.shields.io/badge/built%20with-React%20%7C%20Node.js%20%7C%20Socket.io-blue)
![Status](https://img.shields.io/badge/status-Active-brightgreen)

---

## 👨‍💻 Developer

**Venkata Vamsi** — Full Stack Developer  
📧 vamsichowdhari5540@gmail.com  
🌐 [Portfolio](https://inspiring-snickerdoodle-481992.netlify.app)  
🐙 [GitHub](https://github.com/vamsichowdhari5540-create)  

---

## 📌 About

**ChatSpace Pro** is a production-ready, real-time chat platform built entirely from scratch. Designed for colleges and organizations, it provides a private communication workspace — similar to Slack or Microsoft Teams — with complete data isolation between organizations.

---

## ✨ Features

- 🔴 **Real-Time Messaging** — Instant messages via Socket.io WebSockets
- 🏢 **Multi-Tenant Architecture** — Each organization gets its own isolated MySQL database
- 📢 **Channel System** — Announcements, Tech Updates, Job Notifications with role-based access
- 💬 **Direct Messages** — Private 1-on-1 conversations sorted by latest activity
- 👥 **Group Chats** — Create groups, manage members, group admin controls
- 📎 **File Sharing** — Images, PDFs, Word, Excel, ZIP files (up to 50MB)
- 📹 **Video & Voice Calls** — WebRTC peer-to-peer calling with screen sharing
- 🔔 **Persistent Notifications** — Unread badges saved in database, survive logout/login
- 👑 **Admin Panel** — Real-time role management and channel permissions
- 🔐 **JWT Authentication** — Secure 7-day tokens with bcrypt password hashing
- 🌓 **Dark / Light Theme** — Toggle between themes
- ✍️ **Typing Indicators** — See when someone is typing in real-time
- 🟢 **Online Status** — Live presence tracking (online/away/offline)

---

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React.js, Tailwind CSS v3, Framer Motion, GSAP |
| **Backend** | Node.js, Express.js, Socket.io |
| **Database** | MySQL (XAMPP), Multi-tenant schema |
| **Auth** | JWT (JSON Web Tokens), bcrypt |
| **Real-Time** | Socket.io WebSockets, WebRTC |
| **File Upload** | Multer |
| **Email** | Nodemailer + Gmail SMTP |
| **Deployment** | ngrok tunnel, React served from Node.js |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           ChatSpace Pro Platform             │
├─────────────────────────────────────────────┤
│  React Frontend  ←→  Node.js + Express      │
│                  ←→  Socket.io (WebSockets)  │
│                  ←→  MySQL (Multi-tenant)    │
├─────────────────────────────────────────────┤
│  chatspace_master  (companies registry)      │
│  chatspace_vits    (VITS College data)       │
│  chatspace_vec     (VEC College data)        │
│  chatspace_xyz     (any organization...)     │
└─────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- XAMPP (MySQL on port 3307)
- ngrok (for public URL)

### Installation

```bash
# Clone the repository
git clone https://github.com/vamsichowdhari5540-create/chatspace-pro.git
cd chatspace-pro

# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
```

### Setup Database
1. Start XAMPP MySQL
2. Import the database schema
3. Create `chatspace_master` database

### Environment Variables
Create `server/.env`:
```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=
DB_NAME=chatspace_master
DB_PORT=3307
JWT_SECRET=your_secret_key
PORT=5000
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
SUPER_ADMIN_KEY=your_admin_key
```

### Run the Application
```bash
# Build React frontend
npm run build

# Start server
cd server
node index.js

# Start ngrok (separate terminal)
ngrok http 5000
```

---

## 📁 Project Structure

```
chatspace-pro/
├── public/
├── src/
│   ├── pages/
│   │   ├── Chat.js        ← Main chat component
│   │   ├── Login.js       ← Login page
│   │   └── Register.js    ← Registration page
│   └── context/
│       └── AuthContext.js
├── server/
│   ├── routes/
│   │   ├── auth.js        ← Authentication APIs
│   │   ├── messages.js    ← Channel message APIs
│   │   ├── users.js       ← User management APIs
│   │   ├── groups.js      ← Group chat APIs
│   │   └── admin.js       ← Admin panel APIs
│   ├── config/
│   │   └── db_manager.js  ← Multi-tenant DB manager
│   ├── uploads/
│   │   ├── images/        ← Uploaded images
│   │   └── files/         ← Uploaded files
│   └── index.js           ← Main server entry point
├── LICENSE
└── README.md
```

---

## 🔐 User ID Format

```
CSP - VITS - 000001
 ↑      ↑       ↑
App  Company  User Number
```

Example: `CSP-VITS-000001` = ChatSpace Pro, VITS College, User #1

---

## 📸 Screenshots

> Demo available on request — contact developer

---

## ⚖️ License & Copyright

```
Copyright (c) 2026 Venkata Vamsi
All Rights Reserved.
```

This project is proprietary software. Viewing the source code on GitHub  
does **NOT** grant permission to use, copy, modify, or distribute it.  
See the [LICENSE](LICENSE) file for full details.

---

## 🤝 Contact & Collaboration

For academic evaluation, licensing, or collaboration inquiries:

- 📧 **Email:** vamsichowdhari5540@gmail.com
- 🐙 **GitHub:** https://github.com/vamsichowdhari5540-create
- 🌐 **Portfolio:** https://inspiring-snickerdoodle-481992.netlify.app

---

<div align="center">

**© 2026 Venkata Vamsi — All Rights Reserved**

*Built with ❤️ by Venkata Vamsi*

</div>
