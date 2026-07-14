-- ── COMPANY DATABASE TEMPLATE ──
-- This gets executed when a new company is created
-- Replace COMPANY_DB_NAME with actual db name

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  user_code VARCHAR(30) UNIQUE,
  avatar_url VARCHAR(500),
  avatar_color VARCHAR(20) DEFAULT '#4A90E2',
  bio VARCHAR(200),
  status ENUM('online','away','busy','dnd') DEFAULT 'online',
  role ENUM('admin','team_lead','member') DEFAULT 'member',
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  room VARCHAR(100) NOT NULL,
  text TEXT NOT NULL,
  edited TINYINT DEFAULT 0,
  deleted TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS private_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_user_id INT NOT NULL,
  to_user_id INT NOT NULL,
  text TEXT NOT NULL,
  seen_at TIMESTAMP NULL,
  edited TINYINT DEFAULT 0,
  deleted TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS groups_table (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  admin_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES groups_table(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  user_id INT NOT NULL,
  text TEXT NOT NULL,
  edited TINYINT DEFAULT 0,
  deleted TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups_table(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS blocked_users (
  user_id INT NOT NULL,
  blocked_user_id INT NOT NULL,
  PRIMARY KEY (user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS pinned_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  message_id INT NOT NULL,
  pinned_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channel_permissions (
  user_id INT NOT NULL,
  channel VARCHAR(50) NOT NULL,
  can_post TINYINT DEFAULT 0,
  granted_by INT,
  PRIMARY KEY (user_id, channel)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  used TINYINT DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE messages ADD COLUMN reply_to_id INT DEFAULT NULL, ADD COLUMN reply_to_text TEXT DEFAULT NULL, ADD COLUMN reply_to_username VARCHAR(50) DEFAULT NULL;
ALTER TABLE private_messages ADD COLUMN reply_to_id INT DEFAULT NULL, ADD COLUMN reply_to_text TEXT DEFAULT NULL, ADD COLUMN reply_to_username VARCHAR(50) DEFAULT NULL;
CREATE TABLE IF NOT EXISTS unread_counts (
  user_id INT NOT NULL,
  ref_type VARCHAR(20) NOT NULL,
  ref_id VARCHAR(50) NOT NULL,
  count INT DEFAULT 0,
  last_message_time BIGINT DEFAULT 0,
  PRIMARY KEY (user_id, ref_type, ref_id)
);
ALTER TABLE group_messages ADD COLUMN reply_to_id INT DEFAULT NULL, ADD COLUMN reply_to_text TEXT DEFAULT NULL, ADD COLUMN reply_to_username VARCHAR(50) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS group_message_reads (message_id INT NOT NULL, user_id INT NOT NULL, seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (message_id, user_id));
