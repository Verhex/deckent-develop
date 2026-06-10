// CallbackPage.tsx — OIDC redirect callback handler (Sprint 277, ENT-5).
//
// This page is the `redirect_uri` target after the IdP's authorize redirect.
// It:
//  1. Parses the `code` and `state` from the URL query string.
//  2. Validates the returned `state` against the value persisted before the redirect
//     (CSRF protection — validateState() from oidc-flow.ts).
//  3. Calls POST /api/auth/oidc/exchange with the code + PKCE code_verifier.
//  4. On success: stores the token via useAuth().login(), clears the flow session,
//     and navigates to /.
//  5. On any error: navigates to /login with an error query param.
//
// Security:
//  - state validation is the first check — any mismatch aborts immediately.
//  - The code_verifier is never logged or included in error messages.
//  - clearFlowSession() always runs after handling to remove PKCE/state from storage.

import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import {
  parseCallbackParams,
  validateState,
  loadFlowSession,
  clearFlowSession,
} from '../lib/oidc-flow.js';

// ─── Component ───────────────────────────────────────────────────────────────

export default function CallbackPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handledRef = useRef(false);

  useEffect(() => {
    // Guard against double-invoke in React StrictMode.
    if (handledRef.current) return;
    handledRef.current = true;

    void handleCallback();

    async function handleCallback() {
      // 1. Parse callback query params.
      const params = parseCallbackParams(location.search);

      if (!params.code) {
        clearFlowSession();
        const errCode = 'error' in params && typeof params.error === 'string'
          ? params.error
          : 'invalid_callback';
        navigate(`/login?error=${encodeURIComponent(errCode)}`, { replace: true });
        return;
      }

      const { code, state: returnedState } = params;

      // 2. Validate CSRF state.
      const { state: storedState, verifier } = loadFlowSession();
      if (!validateState(returnedState, storedState ?? null)) {
        clearFlowSession();
        navigate('/login?error=state_mismatch', { replace: true });
        return;
      }

      if (!verifier) {
        clearFlowSession();
        navigate('/login?error=missing_verifier', { replace: true });
        return;
      }

      // 3. Exchange code for token via backend.
      try {
        const res = await fetch('/api/auth/oidc/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, code_verifier: verifier }),
        });

        clearFlowSession();

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { code?: string };
          const errCode = body.code ?? 'exchange_failed';
          navigate(`/login?error=${encodeURIComponent(errCode)}`, { replace: true });
          return;
        }

        const data = await res.json() as { ok: boolean; token?: string; code?: string };

        if (!data.ok || !data.token) {
          const errCode = data.code ?? 'exchange_failed';
          navigate(`/login?error=${encodeURIComponent(errCode)}`, { replace: true });
          return;
        }

        // 4. Store token and navigate home.
        await login(data.token);
        navigate('/', { replace: true });
      } catch {
        clearFlowSession();
        navigate('/login?error=network_error', { replace: true });
      }
    }
  }, [location.search, login, navigate]);

  return (
    <div
      data-testid="callback-page"
      className="min-h-screen flex items-center justify-center bg-zinc-950"
    >
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-3">
          <img
            src="/decko-mascot.png"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 motion-safe:animate-pulse"
          />
          <span className="text-lg font-semibold tracking-tight text-zinc-100">deckent</span>
        </div>
        <p className="text-sm text-zinc-400">Completing sign in…</p>
      </div>
    </div>
  );
}
