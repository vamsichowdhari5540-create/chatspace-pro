const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
    // Get company from master DB
    const company = await getCompanyByCode(parsed.code);
    if (!company) return res.status(400).json({ message: `Company "${parsed.code}" not found or inactive` });

    // Get company DB
    const db = getCompanyDb(company.db_name);

    // Find user by numeric id
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

        // Check max users limit
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
              // Save user_code
              db.query('UPDATE users SET user_code=? WHERE id=?', [userId, result.insertId]);

              const token = jwt.sign(
                { id: result.insertId, username: finalUsername, email, companyCode, dbName: company.db_name },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
              );

              // Send welcome email with User ID
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

// ── CREATE COMPANY (Super Admin) ──
router.post('/create-company', async (req, res) => {
  const { name, code, adminEmail, adminPassword, maxUsers, superAdminKey } = req.body;
  // Simple super admin key protection
  if (superAdminKey !== process.env.SUPER_ADMIN_KEY) return res.status(403).json({ message: 'Unauthorized' });
  if (!name || !code) return res.status(400).json({ message: 'Name and code required' });

  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const dbName = `chatspace_${cleanCode.toLowerCase()}`;

  try {
    // Check if code already exists
    const existing = await getCompanyByCode(cleanCode);
    if (existing) return res.status(400).json({ message: 'Company code already exists' });

    // Create company database
    await createCompanyDatabase(dbName);

    // Save to master
    masterDb.query(
      'INSERT INTO companies (name, code, db_name, admin_email, max_users) VALUES (?,?,?,?,?)',
      [name, cleanCode, dbName, adminEmail || '', maxUsers || 1000],
      async (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error: ' + err.message });

        // Create admin user in company DB if email/password provided
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
                // Send welcome email to admin
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