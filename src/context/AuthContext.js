import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://resume-embezzle-overbill.ngrok-free.dev/api';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';
const AuthContext = createContext();

// Set axios default auth header
const setAuthHeader = (token) => {
  if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete axios.defaults.headers.common['Authorization'];
};

// ── GLOBAL 401 HANDLER ──
// Catches token expiry/invalidity at ANY point during active use, not just
// on initial page load — e.g. if someone's session expires mid-conversation.
// Without this, a 401 from any API call (loadGroups, sendMessage, etc.)
// just fails silently in a .catch(()=>{}) somewhere, leaving the person
// stuck in a broken half-logged-in state until they manually refresh.
let logoutHandler = null;
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && logoutHandler) {
      logoutHandler();
    }
    return Promise.reject(error);
  }
);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    // ── FIX: previously this just trusted whatever was in localStorage
    // without ever asking the backend if the token was still valid. Since
    // JWTs are signed with expiresIn:'7d', a token from more than 7 days
    // ago is cryptographically rejected by the SERVER the moment any
    // request uses it — but the UI kept showing the person as "logged in"
    // regardless, because nothing here ever made that check. They'd only
    // discover their session was dead when some random click triggered a
    // 401 deep in the app (e.g. an empty Groups/DMs sidebar with no
    // explanation). Now we verify the token against a real protected
    // endpoint (GET /users/me) right away, and if it's rejected, we clear
    // the stale session and send them back to login immediately instead
    // of letting them sit in a broken, silently-logged-out state.
    if (token && savedUser) {
      setAuthHeader(token);
      axios.get(`${API}/users/me`)
        .then((r) => {
          // Token still valid — use the FRESH server data (not the stale
          // cached copy), so role changes and other profile updates made
          // elsewhere (e.g. by an admin) are reflected immediately on load
          // instead of silently reverting to whatever was cached at login.
          const freshUser = { ...JSON.parse(savedUser), ...r.data };
          localStorage.setItem('user', JSON.stringify(freshUser));
          setUser(freshUser);
        })
        .catch((err) => {
          if (err.response?.status === 401) {
            // Token expired or invalid — clear everything and force a
            // real login instead of leaving a half-authenticated state.
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setAuthHeader(null);
            setUser(null);
          } else {
            // Some other error (network blip, server down) — don't log
            // the person out over a transient issue; let them keep using
            // the cached session and try again on their next action.
            setUser(JSON.parse(savedUser));
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // ── LOGIN with User ID ──
  const login = async (userId, password) => {
    const res = await axios.post(`${API}/auth/login`, { userId, password });
    const { token, user } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setAuthHeader(token);
    setUser(user);
    return user;
  };

  // ── LOGOUT ──
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthHeader(null);
    setUser(null);
  };

  // Register this instance's logout as the global 401 handler, so the
  // axios interceptor above can clear the session the moment any request
  // anywhere in the app gets rejected for an expired/invalid token.
  useEffect(() => {
    logoutHandler = logout;
    return () => { logoutHandler = null; };
  }, []);

  // ── REGISTER ──
  const register = async (email, password, username, companyCode, avatar_color) => {
    const res = await axios.post(`${API}/auth/register`, { email, password, username, companyCode, avatar_color });
    const { token, user } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setAuthHeader(token);
    setUser(user);
    return user;
  };

  // ── UPDATE PROFILE ──
  const updateProfile = async (data) => {
    await axios.put(`${API}/users/me`, data);
    const updated = { ...user, ...data };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  // ── UPDATE AVATAR ──
  const updateAvatar = async (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    const res = await axios.post(`${API}/users/avatar`, fd);
    const updated = { ...user, avatar_url: res.data.avatar_url };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  // ── SUGGEST USERNAME ──
  const suggestUsername = async (email) => {
    const res = await axios.post(`${API}/auth/suggest-username`, { email });
    return res.data.suggestion;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, register, updateProfile, updateAvatar, suggestUsername }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);