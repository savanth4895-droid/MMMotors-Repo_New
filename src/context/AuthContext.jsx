import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true); // checking persisted session

  // On mount, restore user from localStorage if token exists
  useEffect(() => {
    const token    = localStorage.getItem('mm_token');
    const userJson = localStorage.getItem('mm_user');
    if (token && userJson) {
      try {
        setUser(JSON.parse(userJson));
      } catch {
        localStorage.removeItem('mm_token');
        localStorage.removeItem('mm_user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await authApi.login({ username, password });
    const { access_token, user: u } = res.data;
    localStorage.setItem('mm_token', access_token);
    localStorage.setItem('mm_user', JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    localStorage.removeItem('mm_token');
    localStorage.removeItem('mm_user');
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
