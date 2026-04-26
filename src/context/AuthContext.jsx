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
    useEffect(() => {
  const token = localStorage.getItem('mm_token');
  if (!token) { setLoading(false); return; }

  authApi.me()
    .then((res) => setUser(res.data))
    .catch((err) => {
      // Only log out on 401 (invalid/expired token)
      // Ignore network errors, 500s, server cold starts etc.
      if (err?.response?.status === 401) {
        localStorage.removeItem('mm_token');
        setUser(null);
      }
    })
    .finally(() => setLoading(false));
}, []);
    
  const login = useCallback(async (username, password) => {
    const res = await authApi.login({ username, password });
    const { user: u, access_token } = res.data;
    // Store token so it persists across tabs, devices and refreshes
    if (access_token) localStorage.setItem('mm_token', access_token);
    setUser(u);
    return u;
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
