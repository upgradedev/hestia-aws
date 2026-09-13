import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, decodeSession, errorMessage, expiryMillis } from './api';
import type { BackendState, DemoSession } from './api';

export const SESSION_KEY = 'hestia.demo-session.v1';
function readSession(): DemoSession | null {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    return stored ? decodeSession(JSON.parse(stored)) : null;
  } catch { return null; }
}
function saveSession(session: DemoSession | null): boolean {
  try {
    if (session) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(SESSION_KEY);
    return true;
  } catch { return false; }
}

export function useDemoSession() {
  const [session, setSession] = useState(readSession);
  const [state, setState] = useState<BackendState | null>(null);
  const [status, setStatus] = useState<'loading' | 'preview' | 'active' | 'expired' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(session);
  const revision = useRef(0);
  const operation = useRef(false);
  const retired = useRef(false);

  const expire = useCallback(() => {
    retired.current = true;
    revision.current += 1;
    sessionRef.current = null;
    setSession(null);
    saveSession(null);
    setStatus('expired');
    setError('Demo session expired or is no longer authorized. Explicitly restart the isolated demo; your previous action will not be replayed.');
  }, []);

  useEffect(() => {
    if (retired.current) return;
    const controller = new AbortController();
    const current = sessionRef.current;
    const generation = revision.current;
    if (current && expiryMillis(current.expires_at) <= Date.now()) { expire(); return; }
    api.state(current?.token, controller.signal).then(next => {
      if (controller.signal.aborted || revision.current !== generation) return;
      setState(next);
      setStatus(current ? 'active' : 'preview');
    }).catch(error => {
      if (controller.signal.aborted || revision.current !== generation) return;
      if (current && error instanceof ApiError && (error.status === 401 || error.status === 410)) expire();
      else { setStatus('error'); setError(errorMessage(error)); }
    });
    return () => controller.abort();
  }, [expire]);

  useEffect(() => {
    if (!session) return;
    const timeout = window.setTimeout(expire, Math.min(2147483647, Math.max(0, expiryMillis(session.expires_at) - Date.now())));
    return () => window.clearTimeout(timeout);
  }, [session, expire]);

  const requireSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current || expiryMillis(current.expires_at) <= Date.now()) {
      expire();
      throw new ApiError('Restart the isolated demo session explicitly before continuing.', 401);
    }
    return current;
  }, [expire]);

  const reportError = useCallback((error: unknown) => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 410)) expire();
    else {
      setError(errorMessage(error));
      // An interrupted write might have reached the server. Require a read before any further write.
      if (error instanceof ApiError && error.uncertain) setStatus('error');
    }
  }, [expire]);

  const begin = async (): Promise<boolean> => {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    try {
      const next = await api.begin();
      if (expiryMillis(next.expires_at) <= Date.now()) throw new ApiError('The server returned an expired session. Please restart explicitly.');
      revision.current += 1;
      retired.current = false;
      const credential: DemoSession = { token: next.token, expires_at: next.expires_at, mode: next.mode };
      sessionRef.current = credential;
      setSession(credential);
      setState(next.state);
      setStatus('active');
      setError(null);
      setStorageWarning(saveSession(credential) ? null : 'Browser session storage is unavailable. This demo works in memory; reloading may require a new isolated session.');
      return true;
    } catch (error) { reportError(error); return false; }
    finally { operation.current = false; setBusy(false); }
  };

  const refresh = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const current = sessionRef.current;
      if (current) requireSession();
      const generation = revision.current;
      const next = await api.state(current?.token);
      if (generation !== revision.current) return;
      setState(next);
      setStatus(current ? 'active' : 'preview');
      setError(null);
    } catch (error) {
      if (!retired.current) setStatus('error');
      reportError(error);
    }
    finally { operation.current = false; setBusy(false); }
  };

  const mutate = async <T,>(run: (token: string) => Promise<{ state: BackendState; value: T }>): Promise<T> => {
    if (operation.current || status !== 'active') throw new ApiError('Recover session state before taking another action.');
    const current = requireSession();
    const generation = revision.current;
    operation.current = true;
    setBusy(true);
    try {
      const result = await run(current.token);
      if (revision.current !== generation || sessionRef.current?.token !== current.token) throw new ApiError('Session changed. The previous request will not be replayed.');
      setState(result.state);
      setError(null);
      return result.value;
    } catch (error) { reportError(error); throw error; }
    finally { operation.current = false; setBusy(false); }
  };

  return { session, state, status, error, storageWarning, busy, begin, refresh, mutate, requireSession, reportError };
}
