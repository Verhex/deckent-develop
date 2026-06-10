// LoginPage.tsx — Dashboard login page (Sprint 277, ENT-5).
//
// Behaviour:
//  - If already authenticated → redirect to / immediately.
//  - If dashboard_oidc.enabled in config → show "Sign in with SSO" button which
//    initiates PKCE authorize-redirect via oidc-flow.ts (pure, no network).
//  - Always shows ManualTokenInput so developers/testers can paste a JWT.
//  - If dashboard_oidc is disabled or config fetch fails → only ManualTokenInput
//    (graceful degradation; localhost auto-inject still works as normal).
//
// Security:
//  - PKCE verifier, state, nonce are persisted to sessionStorage via
//    persistFlowSession() before the redirect; cleared by CallbackPage after use.
//  - Discovery fetch (issuer/.well-known/openid-configuration) is only performed
//    on button click — not on page load — to avoid unnecessary network calls.
//  - window.location.href redirect happens only after session is persisted.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { ManualTokenInput } from '../components/ManualTokenInput.js';
import {
  generatePkce,
  buildAuthorizeUrl,
  persistFlowSession,
  randomToken,
  type OidcAuthorizeConfig,
} from '../lib/oidc-flow.js';

// ─── Config shape (subset of API config) ────────────────────────────────────

interface DashboardOidcConfig {
  enabled: boolean;
  issuer: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
}

interface ApiConfigOidc {
  dashboard_oidc?: DashboardOidcConfig;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [oidcConfig, setOidcConfig] = useState<DashboardOidcConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState(false);

  // Redirect if already authenticated (e.g. bootstrap token injected on localhost).
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Fetch config to check if SSO is enabled. Failure is non-fatal — just show
  // ManualTokenInput only (graceful degradation).
  useEffect(() => {
    fetch('/api/config')
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<ApiConfigOidc>;
      })
      .then((cfg) => {
        if (cfg?.dashboard_oidc?.enabled) {
          setOidcConfig(cfg.dashboard_oidc);
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true));
  }, []);

  async function handleSsoClick() {
    if (!oidcConfig) return;
    setSsoError(null);
    setSsoLoading(true);

    try {
      // 1. Discover authorization endpoint via OIDC discovery document.
      const discoveryUrl = `${oidcConfig.issuer}/.well-known/openid-configuration`;
      const discovery = await fetch(discoveryUrl).then((r) => {
        if (!r.ok) throw new Error('discovery_failed');
        return r.json() as Promise<{ authorization_endpoint: string }>;
      });

      const authorizationEndpoint = discovery.authorization_endpoint;
      if (!authorizationEndpoint) throw new Error('discovery_failed');

      // 2. Generate PKCE pair + random state + nonce.
      const pkce = await generatePkce();
      const state = randomToken();
      const nonce = randomToken();

      // 3. Persist flow session so CallbackPage can retrieve verifier + state.
      persistFlowSession({ verifier: pkce.verifier, state, nonce });

      // 4. Build the authorize URL and redirect.
      const cfg: OidcAuthorizeConfig = {
        authorizationEndpoint,
        clientId: oidcConfig.client_id,
        redirectUri: oidcConfig.redirect_uri,
        scope: oidcConfig.scope,
      };
      const authorizeUrl = buildAuthorizeUrl(cfg, {
        state,
        nonce,
        challenge: pkce.challenge,
      });

      window.location.href = authorizeUrl;
    } catch {
      setSsoError('SSO unavailable. Please try again or use a token below.');
      setSsoLoading(false);
    }
  }

  return (
    <div
      data-testid="login-page"
      className="min-h-screen flex items-center justify-center bg-zinc-950"
    >
      <div className="w-full max-w-sm space-y-6 px-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">deckent</h1>
          <p className="text-sm text-zinc-400">Sign in to your workspace</p>
        </div>

        {/* SSO button — only shown when dashboard_oidc.enabled */}
        {configLoaded && oidcConfig && (
          <div className="space-y-3">
            <button
              data-testid="sso-login-button"
              onClick={() => void handleSsoClick()}
              disabled={ssoLoading}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              {ssoLoading ? 'Redirecting to SSO…' : 'Sign in with SSO'}
            </button>

            {ssoError && (
              <p className="text-sm text-red-400 text-center" role="alert" data-testid="sso-error">
                {ssoError}
              </p>
            )}

            <div className="relative flex items-center gap-3">
              <div className="flex-1 border-t border-zinc-800" />
              <span className="text-xs text-zinc-500">or</span>
              <div className="flex-1 border-t border-zinc-800" />
            </div>
          </div>
        )}

        {/* Manual token entry — always available */}
        <div>
          <button
            data-testid="manual-token-open-button"
            onClick={() => setTokenDialogOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            Sign in with Token
          </button>
        </div>

        {/* Localhost-inject info */}
        {configLoaded && !oidcConfig && (
          <p className="text-xs text-zinc-500 text-center">
            Running locally? The API token is auto-injected when the server is started.
          </p>
        )}

        <ManualTokenInput open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} />
      </div>
    </div>
  );
}
