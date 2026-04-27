import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

function saveSession(user, token) {
  if (token) localStorage.setItem('mm_token', token);
  if (user)  localStorage.setItem('mm_user',  JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('mm_token');
  localStorage.removeItem('mm_user');
}

function loadStoredUser() {
  try { return JSON.parse(localStorage.getItem('mm_user') || 'null'); }
  catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => loadStoredUser()); // restore instantly
  const [loading, setLoading] = useState(true);

  // On mount: validate token with /me in background
  useEffect(() => {
    const token = localStorage.getItem('mm_token');
    if (!token) {
      clearSession();
      setUser(null);
      setLoading(false);
      return;
    }
    authApi.me()
      .then((res) => {
        setUser(res.data);
        saveSession(res.data, null); // refresh stored user (allowed_pages may have changed)
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          // Token truly invalid — log out
          clearSession();
          setUser(null);
        }
        // Network error / 500 / cold start — keep stored user, stay logged in
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await authApi.login({ username, password });
    const { user: u, access_token } = res.data;
    try {
      const meRes = await authApi.me();
      saveSession(meRes.data, access_token);
      setUser(meRes.data);
      return meRes.data;
    } catch {
      saveSession(u, access_token);
      setUser(u);
      return u;
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
