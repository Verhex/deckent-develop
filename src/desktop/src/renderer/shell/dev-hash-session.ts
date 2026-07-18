import type { DaemonSession } from '../../shared/desktop-api.js';

/**
 * Dev-only browser fallback: when the renderer runs in a plain browser (no
 * Electron bridge), a `#port=3179&token=…` hash — the same format the 589
 * prototype launcher prints — yields a loopback DaemonSession so the shell
 * can mount for the design eye-loop. The URL host is fixed to 127.0.0.1 by
 * construction; the token lives only in the returned object, never storage,
 * so a manual reload after the router rewrites the hash falls back to the
 * profile picker (the eye-loop always navigates with the full URL).
 * Callers must gate on the bridge being absent — with the bridge present the
 * hash is ignored entirely.
 */
export function parseDevHashSession(hash: string): DaemonSession | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw || raw.startsWith('/')) return null;
  const params = new URLSearchParams(raw);
  const portRaw = params.get('port');
  if (!portRaw || !/^\d+$/.test(portRaw)) return null;
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const token = params.get('token');
  const session: DaemonSession = {
    profileId: 'dev-hash',
    url: `http://127.0.0.1:${port}`,
  };
  if (token) session.apiToken = token;
  return session;
}
