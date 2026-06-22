/**
 * ============================================================
 * ChatSpace Pro — Reset Password Page
 * ============================================================
 * Copyright (c) 2026 Venkata Vamsi. All Rights Reserved.
 *
 * Users land here after clicking the link in their "forgot password"
 * email. The link looks like:
 *   /reset-password?token=abc123...&db=chatspace_vits
 *
 * Both the token and dbName are read from the URL query string and
 * submitted along with the new password to POST /auth/reset-password.
 * ============================================================
 */

import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const API = 'https://gong-unbend-chief.ngrok-free.dev/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const dbName = searchParams.get('db');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const missingLinkParams = !token || !dbName;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError("Passwords don't match"); return; }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token, dbName, newPassword });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── STYLES (matching the dark space theme used elsewhere in the app) ──
  const pageWrap = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #010a1e, #021030, #050e28)', padding: 20,
  };
  const card = {
    width: '100%', maxWidth: 420, borderRadius: 20, padding: 40,
    background: 'rgba(3,8,28,0.95)', border: '1px solid rgba(74,144,226,0.25)',
    boxShadow: '0 0 100px rgba(20,50,200,0.2), 0 40px 80px rgba(0,0,0,0.8)',
    textAlign: 'center',
  };
  const inputSt = {
    width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 14,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(74,144,226,0.25)',
    color: 'white', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    marginBottom: 14, transition: 'all 0.2s',
  };
  const btnPrimary = {
    width: '100%', padding: '14px 0', borderRadius: 12, fontWeight: 700, fontSize: 15,
    background: 'linear-gradient(135deg,#4A90E2,#2563eb)', border: 'none', color: 'white',
    cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(74,144,226,0.4)',
    transition: 'all 0.2s',
  };
  const iconCircle = {
    width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
    background: 'rgba(74,144,226,0.15)', border: '1px solid rgba(74,144,226,0.3)',
  };

  if (missingLinkParams) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <div style={{ ...iconCircle, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>⚠️</div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Invalid Reset Link</h2>
          <p style={{ color: 'rgba(150,180,255,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            This password reset link is missing required information. Please request a new one from the login page.
          </p>
          <Link to="/login" style={{ ...btnPrimary, display: 'inline-block', textDecoration: 'none', boxSizing: 'border-box' }}>Back to Login</Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <div style={{ ...iconCircle, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>✅</div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Password Reset!</h2>
          <p style={{ color: 'rgba(150,180,255,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            Your password has been changed successfully. You can now log in with your new password.
          </p>
          <button onClick={() => navigate('/login')} style={btnPrimary}>Back to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <div style={card}>
        <div style={iconCircle}>🔑</div>
        <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Set New Password</h2>
        <p style={{ color: 'rgba(150,180,255,0.65)', fontSize: 13, margin: '0 0 24px' }}>
          Choose a new password for your account.
        </p>
        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="New password (min. 6 characters)"
            style={inputSt}
            onFocus={e => { e.target.style.borderColor = 'rgba(74,144,226,0.7)'; e.target.style.boxShadow = '0 0 0 3px rgba(74,144,226,0.12)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(74,144,226,0.25)'; e.target.style.boxShadow = 'none'; }}
            autoFocus
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            style={{ ...inputSt, marginBottom: error ? 8 : 20 }}
            onFocus={e => { e.target.style.borderColor = 'rgba(74,144,226,0.7)'; e.target.style.boxShadow = '0 0 0 3px rgba(74,144,226,0.12)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(74,144,226,0.25)'; e.target.style.boxShadow = 'none'; }}
          />
          {error && <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 16px' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                Resetting...
              </span>
            ) : 'Reset Password'}
          </button>
        </form>
        <Link to="/login" style={{ display: 'inline-block', marginTop: 20, color: 'rgba(150,180,255,0.6)', fontSize: 13, textDecoration: 'none' }}>
          Back to Login
        </Link>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}