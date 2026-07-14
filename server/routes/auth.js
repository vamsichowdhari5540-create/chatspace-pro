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

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { masterDb, getCompanyDb, createCompanyDatabase, getCompanyByCode, parseUserId, generateUserId } = require('../config/db_manager');

// ── EMAIL TRANSPORTER ──
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sendVerificationEmail = async (email, code, companyName) => {
  await transporter.sendMail({
    from: `"ChatSpace Pro" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `🔐 Your ${companyName} Verification Code`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;background:#050914;padding:40px;border-radius:16px;max-width:480px;margin:0 auto;">
        <h1 style="color:#4A90E2;text-align:center;">ChatSpace Pro</h1>
        <p style="color:#a0b0d0;text-align:center;">${companyName} Workspace</p>
        <div style="background:rgba(74,144,226,0.1);border:1px solid rgba(74,144,226,0.3);border-radius:12px;padding:30px;text-align:center;margin-top:20px;">
          <p style="color:#fff;font-size:16px;">Your verification code:</p>
          <div style="background:rgba(74,144,226,0.2);border:2px solid #4A90E2;border-radius:12px;padding:20px;margin:15px 0;">
            <span style="font-size:42px;font-weight:900;color:#4A90E2;letter-spacing:12px;">${code}</span>
          </div>
          <p style="color:#a0b0d0;font-size:13px;">Expires in 10 minutes</p>
        </div>
      </div>
    `,
  });
};

// ── LOGIN with User ID ──
// Format: CSP-VITS-000001
router.post('/login', async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ message: 'User ID and password required' });
  const parsed = parseUserId(userId);
  if (!parsed) return res.status(400).json({ message: 'Invalid User ID format. Use CSP-COMPANY-000001' });
  try {
    const company = await getCompanyByCode(parsed.code);
    if (!company) return res.status(400).json({ message: `Company "${parsed.code}" not found or inactive` });
    const db = getCompanyDb(company.db_name);
    db.query('SELECT * FROM users WHERE id=?', [parsed.numericId], (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!rows.length) return res.status(400).json({ message: 'Invalid User ID or password' });
      const user = rows[0];
      if (!bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ message: 'Invalid User ID or password' });
      }
      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email, role: user.role, companyCode: parsed.code, dbName: company.db_name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({
        token,
        user: {
          id: user.id,
          userId: generateUserId(parsed.code, user.id),
          email: user.email,
          username: user.username,
          avatar_color: user.avatar_color,
          avatar_url: user.avatar_url,
          bio: user.bio,
          status: user.status,
          role: user.role,
          companyCode: parsed.code,
          companyName: company.name,
          dbName: company.db_name,
        }
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── CHECK EMAIL ──
router.post('/check-email', async (req, res) => {
  const { email, companyCode } = req.body;
  if (!email || !companyCode) return res.status(400).json({ message: 'Email and company code required' });
  try {
    const company = await getCompanyByCode(companyCode);
    if (!company) return res.status(400).json({ message: 'Company not found' });
    const db = getCompanyDb(company.db_name);
    db.query('SELECT id FROM users WHERE email=?', [email], (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (rows.length) return res.status(400).json({ message: 'Email already registered' });
      res.json({ available: true });
    });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── SEND VERIFICATION CODE ──
router.post('/send-code', async (req, res) => {
  const { email, companyCode } = req.body;
  if (!email || !companyCode) return res.status(400).json({ message: 'Email and company code required' });
  try {
    const company = await getCompanyByCode(companyCode);
    if (!company) return res.status(400).json({ message: 'Company not found' });
    const db = getCompanyDb(company.db_name);
    db.query('SELECT id FROM users WHERE email=?', [email], async (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (rows.length) return res.status(400).json({ message: 'Email already registered' });
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        await sendVerificationEmail(email, code, company.name);
        console.log(`✅ Code sent to ${email}: ${code}`);
        res.json({ message: 'Code sent!', code });
      } catch (err) {
        console.error('Email error:', err.message);
        res.status(500).json({ message: 'Failed to send email' });
      }
    });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── REGISTER ──
router.post('/register', async (req, res) => {
  const { email, password, username, companyCode, avatar_color } = req.body;
  if (!email || !password || !companyCode) return res.status(400).json({ message: 'All fields required' });
  try {
    const company = await getCompanyByCode(companyCode);
    if (!company) return res.status(400).json({ message: 'Company not found' });
    const db = getCompanyDb(company.db_name);
    db.query('SELECT id FROM users WHERE email=?', [email], (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (rows.length) return res.status(400).json({ message: 'Email already registered' });
      const finalUsername = username?.trim() || email.split('@')[0];
      db.query('SELECT id FROM users WHERE username=?', [finalUsername], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        if (rows.length) return res.status(400).json({ message: 'Username already taken' });
        db.query('SELECT COUNT(*) as count FROM users', (err, countRows) => {
          if (err) return res.status(500).json({ message: 'Database error' });
          if (countRows[0].count >= company.max_users) return res.status(400).json({ message: 'Company user limit reached' });
          const hash = bcrypt.hashSync(password, 10);
          const isFirstUser = countRows[0].count === 0;
          db.query(
            'INSERT INTO users (email, password, username, avatar_color, role) VALUES (?,?,?,?,?)',
            [email, hash, finalUsername, avatar_color || '#4A90E2', isFirstUser ? 'admin' : 'member'],
            (err, result) => {
              if (err) return res.status(500).json({ message: 'Database error' });
              const userId = generateUserId(companyCode, result.insertId);
              db.query('UPDATE users SET user_code=? WHERE id=?', [userId, result.insertId]);
              const token = jwt.sign(
                { id: result.insertId, username: finalUsername, email, companyCode, dbName: company.db_name },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
              );
              transporter.sendMail({
                from: `"ChatSpace Pro" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `🎉 Welcome to ${company.name} — Your User ID`,
                html: `
                  <div style="font-family:'Segoe UI',sans-serif;background:#050914;padding:40px;border-radius:16px;max-width:480px;margin:0 auto;">
                    <h1 style="color:#4A90E2;text-align:center;margin:0 0 8px">ChatSpace Pro</h1>
                    <p style="color:#a0b0d0;text-align:center;margin:0 0 30px">${company.name} Workspace</p>
                    <p style="color:#fff;font-size:16px;">Hi <strong>${finalUsername}</strong>, welcome aboard! 🎉</p>
                    <p style="color:#a0b0d0;font-size:14px;">Your account has been created successfully. Here is your User ID to login:</p>
                    <div style="background:rgba(74,144,226,0.15);border:2px solid #4A90E2;border-radius:14px;padding:24px;text-align:center;margin:20px 0;">
                      <p style="color:#a0b0d0;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:2px;">Your User ID</p>
                      <p style="color:#4A90E2;font-size:28px;font-weight:900;margin:0;font-family:monospace;letter-spacing:3px;">${userId}</p>
                    </div>
                    <p style="color:#a0b0d0;font-size:13px;">Use this User ID along with your password to login at any time.</p>
                    <p style="color:#ef4444;font-size:12px;">⚠️ Keep this ID safe — you need it to login!</p>
                    <hr style="border-color:rgba(74,144,226,0.2);margin:24px 0"/>
                    <p style="color:#506080;font-size:12px;text-align:center;">© 2026 ChatSpace Pro. All rights reserved.</p>
                  </div>
                `
              }).catch(err => console.error('Welcome email error:', err.message));
              res.status(201).json({
                token,
                user: {
                  id: result.insertId,
                  userId,
                  email,
                  username: finalUsername,
                  avatar_color: avatar_color || '#4A90E2',
                  avatar_url: null,
                  role: isFirstUser ? 'admin' : 'member',
                  companyCode,
                  companyName: company.name,
                  dbName: company.db_name,
                }
              });
              // Notify already-connected clients so their DM/user list picks
              // up the new teammate live, instead of only after their next
              // manual page refresh. companyCode is included so the client
              // can ignore signups from a different company workspace.
              const io = req.app.get('io');
              if (io) {
                io.emit('userRegistered', {
                  id: result.insertId,
                  username: finalUsername,
                  avatar_color: avatar_color || '#4A90E2',
                  avatar_url: null,
                  status: 'online',
                  companyCode,
                });
              }
            }
          );
        });
      });
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// FORGOT PASSWORD / RESET PASSWORD
// ============================================================
const findUserByEmailAcrossCompanies = (email) => new Promise((resolve, reject) => {
  masterDb.query('SELECT db_name, name FROM companies WHERE is_active=1', (err, companies) => {
    if (err) return reject(err);
    if (!companies.length) return resolve(null);
    let remaining = companies.length;
    let found = null;
    companies.forEach(company => {
      const db = getCompanyDb(company.db_name);
      db.query('SELECT * FROM users WHERE email=?', [email], (err2, rows) => {
        remaining--;
        if (!err2 && rows.length && !found) {
          found = { user: rows[0], dbName: company.db_name, companyName: company.name };
        }
        if (remaining === 0) resolve(found);
      });
    });
  });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  const genericResponse = { message: 'If an account with that email exists, a reset link has been sent.' };
  try {
    const result = await findUserByEmailAcrossCompanies(email);
    if (!result) return res.json(genericResponse);
    const { user, dbName, companyName } = result;
    const db = getCompanyDb(dbName);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    db.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?,?,?)',
      [user.id, token, expiresAt],
      async (err) => {
        if (err) {
          console.error('Forgot-password token insert error:', err.message);
          return res.json(genericResponse);
        }
        const resetUrl = `${process.env.FRONTEND_URL || 'https://resume-embezzle-overbill.ngrok-free.dev'}/reset-password?token=${token}&db=${encodeURIComponent(dbName)}`;
        try {
          await transporter.sendMail({
            from: `"ChatSpace Pro" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `🔑 Reset your ${companyName} password`,
            html: `
              <div style="font-family:'Segoe UI',sans-serif;background:#050914;padding:40px;border-radius:16px;max-width:480px;margin:0 auto;">
                <h1 style="color:#4A90E2;text-align:center;margin:0 0 8px">ChatSpace Pro</h1>
                <p style="color:#a0b0d0;text-align:center;margin:0 0 30px">${companyName} Workspace</p>
                <p style="color:#fff;font-size:16px;">Hi <strong>${user.username}</strong>,</p>
                <p style="color:#a0b0d0;font-size:14px;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
                <div style="text-align:center;margin:28px 0;">
                  <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#4A90E2,#2563eb);color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">Reset Password</a>
                </div>
                <p style="color:#506080;font-size:12px;">If you didn't request this, you can safely ignore this email — your password will remain unchanged.</p>
                <hr style="border-color:rgba(74,144,226,0.2);margin:24px 0"/>
                <p style="color:#506080;font-size:12px;text-align:center;">© 2026 ChatSpace Pro. All rights reserved.</p>
              </div>
            `
          });
          console.log(`✅ Password reset email sent to ${email}`);
        } catch (emailErr) {
          console.error('Reset email send error:', emailErr.message);
        }
        res.json(genericResponse);
      }
    );
  } catch (err) {
    console.error('Forgot-password error:', err);
    res.json(genericResponse);
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, dbName, newPassword } = req.body;
  if (!token || !dbName || !newPassword) return res.status(400).json({ message: 'Token, dbName, and newPassword required' });
  if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  try {
    const company = await new Promise((resolve, reject) => {
      masterDb.query('SELECT db_name FROM companies WHERE db_name=? AND is_active=1', [dbName], (err, rows) => {
        if (err) return reject(err);
        resolve(rows.length ? rows[0] : null);
      });
    });
    if (!company) return res.status(400).json({ message: 'Invalid or expired reset link' });
    const db = getCompanyDb(dbName);
    db.query(
      'SELECT * FROM password_reset_tokens WHERE token=? AND used=0 AND expires_at > NOW()',
      [token],
      (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        if (!rows.length) return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
        const resetRow = rows[0];
        const hash = bcrypt.hashSync(newPassword, 10);
        db.query('UPDATE users SET password=? WHERE id=?', [hash, resetRow.user_id], (err2) => {
          if (err2) return res.status(500).json({ message: 'Database error: ' + err2.message });
          db.query('UPDATE password_reset_tokens SET used=1 WHERE id=?', [resetRow.id], () => {
            console.log(`🔑 Password reset completed for user ${resetRow.user_id} in ${dbName}`);
            res.json({ message: 'Password reset successful! You can now log in with your new password.' });
          });
        });
      }
    );
  } catch (err) {
    console.error('Reset-password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── CREATE COMPANY (Super Admin) ──
router.post('/create-company', async (req, res) => {
  const { name, code, adminEmail, adminPassword, maxUsers, superAdminKey } = req.body;
  if (superAdminKey !== process.env.SUPER_ADMIN_KEY) return res.status(403).json({ message: 'Unauthorized' });
  if (!name || !code) return res.status(400).json({ message: 'Name and code required' });
  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const dbName = `chatspace_${cleanCode.toLowerCase()}`;
  try {
    const existing = await getCompanyByCode(cleanCode);
    if (existing) return res.status(400).json({ message: 'Company code already exists' });
    await createCompanyDatabase(dbName);
    masterDb.query(
      'INSERT INTO companies (name, code, db_name, admin_email, max_users) VALUES (?,?,?,?,?)',
      [name, cleanCode, dbName, adminEmail || '', maxUsers || 1000],
      async (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error: ' + err.message });
        if (adminEmail && adminPassword) {
          const db = getCompanyDb(dbName);
          const hash = bcrypt.hashSync(adminPassword, 10);
          const username = adminEmail.split('@')[0];
          db.query(
            'INSERT INTO users (email, password, username, role, avatar_color) VALUES (?,?,?,?,?)',
            [adminEmail, hash, username, 'admin', '#4A90E2'],
            async (err, userResult) => {
              if (!err) {
                const userId = generateUserId(cleanCode, userResult.insertId);
                db.query('UPDATE users SET user_code=? WHERE id=?', [userId, userResult.insertId]);
                try {
                  await transporter.sendMail({
                    from: `"ChatSpace Pro" <${process.env.EMAIL_USER}>`,
                    to: adminEmail,
                    subject: `👑 You are the Admin of ${name} on ChatSpace Pro`,
                    html: `
                      <div style="font-family:'Segoe UI',sans-serif;background:#050914;padding:40px;border-radius:16px;max-width:480px;margin:0 auto;">
                        <h1 style="color:#4A90E2;text-align:center;margin:0 0 8px">ChatSpace Pro</h1>
                        <p style="color:#a0b0d0;text-align:center;margin:0 0 30px">${name} Workspace</p>
                        <p style="color:#fff;font-size:16px;">Hi <strong>${username}</strong>, your company workspace has been created! 🎉</p>
                        <p style="color:#a0b0d0;font-size:14px;">You are the <strong style="color:#f59e0b">Admin</strong> of <strong>${name}</strong>. Here are your login credentials:</p>
                        <div style="background:rgba(74,144,226,0.15);border:2px solid #4A90E2;border-radius:14px;padding:24px;margin:20px 0;">
                          <p style="color:#a0b0d0;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:2px;">Your Admin User ID</p>
                          <p style="color:#4A90E2;font-size:28px;font-weight:900;margin:0 0 16px;font-family:monospace;letter-spacing:3px;">${userId}</p>
                          <p style="color:#a0b0d0;font-size:12px;margin:0 0 4px">Password: <strong style="color:white">${adminPassword}</strong></p>
                          <p style="color:#f59e0b;font-size:11px;margin:8px 0 0">⚠️ Please change your password after first login!</p>
                        </div>
                        <p style="color:#a0b0d0;font-size:13px;">Share your company code <strong style="color:#4A90E2">${cleanCode}</strong> with your team so they can register.</p>
                        <hr style="border-color:rgba(74,144,226,0.2);margin:24px 0"/>
                        <p style="color:#506080;font-size:12px;text-align:center;">© 2026 ChatSpace Pro</p>
                      </div>
                    `
                  });
                  console.log(`✅ Admin welcome email sent to ${adminEmail}`);
                } catch(emailErr) {
                  console.error('Admin email error:', emailErr.message);
                }
              }
            }
          );
        }
        res.status(201).json({
          message: `Company "${name}" created successfully!`,
          company: { id: result.insertId, name, code: cleanCode, dbName },
        });
      }
    );
  } catch (err) {
    console.error('Create company error:', err);
    res.status(500).json({ message: 'Failed to create company: ' + err.message });
  }
});

// ── SELF REGISTER COMPANY ──
router.post('/register-company', async (req, res) => {
  const { companyName, companyCode, adminEmail, adminPassword, adminUsername } = req.body;
  if (!companyName || !companyCode || !adminEmail || !adminPassword) {
    return res.status(400).json({ message: 'All fields required' });
  }
  const cleanCode = companyCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length < 2 || cleanCode.length > 10) {
    return res.status(400).json({ message: 'Company code must be 2-10 characters' });
  }
  const dbName = `chatspace_${cleanCode.toLowerCase()}`;
  try {
    const existing = await getCompanyByCode(cleanCode);
    if (existing) return res.status(400).json({ message: 'Company code already taken' });
    await createCompanyDatabase(dbName);
    masterDb.query(
      'INSERT INTO companies (name, code, db_name, admin_email) VALUES (?,?,?,?)',
      [companyName, cleanCode, dbName, adminEmail],
      (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        const db = getCompanyDb(dbName);
        const hash = bcrypt.hashSync(adminPassword, 10);
        const username = adminUsername || adminEmail.split('@')[0];
        db.query(
          'INSERT INTO users (email, password, username, role, avatar_color) VALUES (?,?,?,?,?)',
          [adminEmail, hash, username, 'admin', '#4A90E2'],
          (err, userResult) => {
            if (err) return res.status(500).json({ message: 'Failed to create admin user' });
            const userId = generateUserId(cleanCode, userResult.insertId);
            db.query('UPDATE users SET user_code=? WHERE id=?', [userId, userResult.insertId]);
            res.status(201).json({
              message: 'Company registered successfully!',
              company: { name: companyName, code: cleanCode },
              adminUserId: userId,
              note: `Your admin User ID is: ${userId}`
            });
          }
        );
      }
    );
  } catch (err) {
    console.error('Register company error:', err);
    res.status(500).json({ message: 'Failed: ' + err.message });
  }
});

// ── GET COMPANY INFO (public) ──
router.get('/company/:code', async (req, res) => {
  try {
    const company = await getCompanyByCode(req.params.code);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    res.json({ name: company.name, code: company.code, isActive: company.is_active });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;