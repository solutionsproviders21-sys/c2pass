'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, getSession, onSessionChange, setSession } from './api';
import type { Me, Tokens } from './types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  /** The profile could not be loaded because the network is down (the session itself is kept). */
  offline: boolean;
  signIn: (tokens: Tokens) => Promise<Me | null>;
  signOut: () => Promise<void>;
  reload: () => Promise<Me | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const reload = useCallback(async () => {
    if (!getSession()) {
      setMe(null);
      setLoading(false);
      return null;
    }
    try {
      const m = await api.get<Me>('/me');
      setMe(m);
      setOffline(false);
      return m;
    } catch (e) {
      // A refused session signs out; a lost connection does not.
      if (e instanceof ApiError) setMe(null);
      else setOffline(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const back = () => void reload();
    window.addEventListener('online', back);
    const off = onSessionChange((s) => {
      if (!s) setMe(null);
    });
    return () => {
      window.removeEventListener('online', back);
      off();
    };
  }, [reload]);

  const signIn = useCallback(async (tokens: Tokens) => {
    setSession(tokens);
    return reload();
  }, [reload]);

  const signOut = useCallback(async () => {
    const s = getSession();
    if (s) await api.post('/auth/logout', { refreshToken: s.refreshToken }).catch(() => undefined);
    setSession(null);
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, loading, offline, signIn, signOut, reload }), [me, loading, offline, signIn, signOut, reload]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Where a freshly signed-in user lands. */
export function homeFor(me: Pick<Me, 'role'> | null) {
  if (!me) return '/connexion';
  if (me.role === 'admin') return '/admin';
  if (me.role === 'teacher') return '/admin/corrections';
  return '/tableau-de-bord';
}
