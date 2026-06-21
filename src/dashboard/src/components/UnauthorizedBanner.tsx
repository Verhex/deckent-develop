import { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageProvider.js';

/**
 * Top-level banner shown when an API call returns 401.
 *
 * The shared API client (`lib/api.ts` / `lib/api-client.ts`) dispatches a
 * `deckent:unauthorized` window event on every 401. Before this component
 * nothing listened for it, so a token expiry or missing-token request failed
 * silently — the page simply rendered empty with no signal to the operator.
 * Mounted once at the app root so the failure surfaces on every route.
 */
export function UnauthorizedBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onUnauthorized() {
      setVisible(true);
    }
    window.addEventListener('deckent:unauthorized', onUnauthorized);
    return () => window.removeEventListener('deckent:unauthorized', onUnauthorized);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-red-500/40 bg-red-950/90 px-4 py-2.5 text-sm text-red-100 shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
        <span>
          <span className="font-semibold">{t('auth.unauthorized.title')}</span>
          {' — '}
          {t('auth.unauthorized.message')}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={t('common.close')}
        className="shrink-0 rounded p-1 text-red-300 transition-colors hover:bg-red-900/60 hover:text-red-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
