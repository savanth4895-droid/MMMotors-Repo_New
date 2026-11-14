import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

// Signed out after this long with no mouse, keyboard, touch or scroll in any open tab.
// The time is kept in localStorage so every tab shares it, and a reopened laptop is caught too.
const IDLE_MS     = 60 * 60 * 1000;
const ACTIVE_KEY  = 'mm_last_active';
const ACTIVITY    = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];

const markActive = () => localStorage.setItem(ACTIVE_KEY, String(Date.now()));
const idleTooLong = () => {
  const last = Number(localStorage.getItem(ACTIVE_KEY));
  return !!last && Date.now() - last > IDLE_MS;   // no record yet (older sessions) = not idle
};

function saveSession(user, token) {
  if (token) localStorage.setItem('mm_token', token);
  if (user)  localStorage.setItem('mm_user',  JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('mm_token');
  localStorage.removeItem('mm_user');
  localStorage.removeItem(ACTIVE_KEY);
}

// A stored token counts only if the hour of inactivity hasn't already run out
const hasLiveSession = () => !!localStorage.getItem('mm_token') && !idleTooLong();

function loadStoredUser() {
  try { return JSON.parse(localStorage.getItem('mm_user') || 'null'); }
  catch { return null; }
}

export function AuthProvider({ children }) {
  // No token, or idle for over an hour → signed out straight away; otherwise restore the stored user instantly
  const [user, setUser]       = useState(() => hasLiveSession() ? loadStoredUser() : null);
  const [loading, setLoading] = useState(() => hasLiveSession());

  // On mount: validate token with /me in background
  useEffect(() => {
    if (!hasLiveSession()) {
      if (localStorage.getItem('mm_token')) {   // idle too long: end it on the server too
        toast('Signed out after 1 hour without activity', { id: 'idle-logout' });
        const token = localStorage.getItem('mm_token');
        clearSession();
        authApi.logout(token).catch(() => {});
      } else {
        clearSession();
      }
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
    markActive();   // a fresh login starts a fresh hour
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

  // Clears this device at once; the server call (which can be slow while Render wakes up) follows
  const logout = useCallback(() => {
    const token = localStorage.getItem('mm_token');
    clearSession();
    setUser(null);
    authApi.logout(token).catch(() => {});
  }, []);

  // Idle logout: activity refreshes the shared timestamp; a minute timer and returning
  // to the tab check it. Runs only while someone is signed in.
  useEffect(() => {
    if (!user) return;
    const check = () => {
      if (!idleTooLong()) return false;
      logout();
      toast('Signed out after 1 hour without activity', { id: 'idle-logout' });
      return true;
    };
    if (check()) return;   // e.g. the page was reopened after the hour ran out
    markActive();

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 15000) { lastWrite = now; markActive(); }   // don't write on every mousemove
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    // Signed out in another tab → follow it here
    const onStorage = (e) => { if (e.key === 'mm_token' && !e.newValue) setUser(null); };

    ACTIVITY.forEach(ev => window.addEventListener(ev, onActivity, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    const timer = setInterval(check, 60 * 1000);
    return () => {
      ACTIVITY.forEach(ev => window.removeEventListener(ev, onActivity, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
      clearInterval(timer);
    };
  }, [user, logout]);

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
