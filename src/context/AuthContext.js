import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://localhost:5000/api';
const AuthContext = createContext();

// Set axios default auth header
const setAuthHeader = (token) => {
  if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete axios.defaults.headers.common['Authorization'];
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setAuthHeader(token);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
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