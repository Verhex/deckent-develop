// session.ts — sessionStorage token persistence for dashboard auth (Sprint 277, ENT-5).
//
// Security: sessionStorage is scoped to the browser tab and is not accessible from
// other origins (XSS surface narrower than localStorage which survives tab close).

export const SESSION_TOKEN_KEY = 'DECKENT_SESSION_TOKEN';

/** Read the session token from sessionStorage, or undefined if absent/unavailable. */
export function getSessionToken(): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? undefined;
}

/** Persist a session token to sessionStorage. */
export function setSessionToken(token: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

/** Remove the session token from sessionStorage. */
export function clearSessionToken(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}
