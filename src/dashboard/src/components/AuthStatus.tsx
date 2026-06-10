// AuthStatus — "who is logged in" indicator + logout (Sprint 277, ENT-5).
//
// Displays the current authenticated identity from useAuth(). Renders nothing
// when unauthenticated. Shows OIDC identity (name/email/sub) or "Local session"
// for static-token mode, plus a role badge and a logout button.
//
// Security: logout() clears sessionStorage but cannot remove a server-injected
// bootstrap token (window.__DECKENT_API_TOKEN__). A "session cleared" hint is
// shown in that case so the user understands the page reload is needed.

import { useState } from 'react';
import { User, LogOut, Shield } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { useAuth } from '../hooks/useAuth.js';
import { getBootstrapApiToken } from '../lib/api.js';
import { useTranslation } from '../i18n/LanguageProvider.js';

// ─── Component ────────────────────────────────────────────────────────────────

/** AuthStatus — compact identity chip for AppShell header. */
export function AuthStatus({ className }: { className?: string }) {
  const { identity, mode, logout } = useAuth();
  const { t } = useTranslation();
  const [sessionCleared, setSessionCleared] = useState(false);

  // Render nothing when not authenticated — no empty space in header.
  if (!identity) return null;

  const displayName =
    identity.mode === 'oidc'
      ? (identity.name ?? identity.preferredUsername ?? identity.email ?? identity.sub ?? '?')
      : null;

  const handleLogout = () => {
    logout();
    setSessionCleared(true);
  };

  return (
    <div
      data-testid="auth-status"
      className={cn(
        'flex items-center gap-2',
        'text-xs text-zinc-600 dark:text-zinc-400',
        className,
      )}
    >
      {/* Identity chip */}
      <div className="flex items-center gap-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-1">
        <User className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />

        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          {mode === 'oidc' && displayName
            ? t('auth.logged_in_as', { name: displayName })
            : t('auth.local_session')}
        </span>

        {/* Role badge — only shown when role is present */}
        {identity.role && (
          <span
            className={cn(
              'flex items-center gap-0.5 rounded px-1.5 py-0.5',
              'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
              'text-[10px] font-semibold uppercase tracking-wide',
            )}
          >
            <Shield className="h-2.5 w-2.5" aria-hidden />
            {t('auth.role', { role: identity.role })}
          </span>
        )}
      </div>

      {/* Session-cleared hint (shown only after logout when bootstrap token persists) */}
      {sessionCleared && getBootstrapApiToken() && (
        <span className="text-amber-600 dark:text-amber-400 text-[10px]">
          {t('auth.session_cleared')}
        </span>
      )}

      {/* Logout button */}
      <button
        data-testid="logout-button"
        onClick={handleLogout}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1',
          'text-zinc-500 dark:text-zinc-400',
          'hover:bg-zinc-200/70 dark:hover:bg-zinc-800/50',
          'hover:text-zinc-800 dark:hover:text-zinc-200',
          'transition-all duration-150',
        )}
        aria-label={t('auth.logout')}
        title={t('auth.logout')}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        <span>{t('auth.logout')}</span>
      </button>
    </div>
  );
}
