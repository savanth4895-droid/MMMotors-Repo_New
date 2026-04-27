import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, if we have a stored token try to restore session
  useEffect(() => {
    const token = localStorage.getItem('mm_token');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then((res) => setUser(res.data))
      .catch((err) => {
        // Only clear token on 401 (invalid/expired)
        // Ignore network errors, 500s, server cold starts
        if (err?.response?.status === 401) {
          localStorage.removeItem('mm_token');
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await authApi.login({ username, password });
    const { access_token } = res.data;
    if (access_token) localStorage.setItem('mm_token', access_token);
    // Fetch full user doc (includes allowed_pages) instead of using login response subset
    const meRes = await authApi.me();
    setUser(meRes.data);
    return meRes.data;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    localStorage.removeItem('mm_token');
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
