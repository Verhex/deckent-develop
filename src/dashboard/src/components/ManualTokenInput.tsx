// ManualTokenInput.tsx — manual JWT token entry dialog (Sprint 277, ENT-5).
//
// api_oidc mode: no bootstrap token is injected, but auth is required.
// Developers/testers paste a JWT here to authenticate without a full OIDC redirect.
// Token is pre-validated against /api/auth/me before login() stores it, so an
// invalid token is never written to sessionStorage ("token yutulmaz").

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { useAuth } from '../hooks/useAuth.js';
import { useTranslation } from '../i18n/LanguageProvider.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManualTokenInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ManualTokenInput({ open, onOpenChange }: ManualTokenInputProps) {
  const { login } = useAuth();
  const { t } = useTranslation();

  const [tokenValue, setTokenValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function resetState() {
    setTokenValue('');
    setError(null);
    setIsLoading(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  }

  function handleCancel() {
    resetState();
    onOpenChange(false);
  }

  async function handleSubmit() {
    const trimmed = tokenValue.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // Pre-validate token against /api/auth/me before storing it.
      // This prevents an invalid token from being written to sessionStorage.
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${trimmed}` },
      });

      if (!res.ok) {
        setError('Invalid token — please check and try again.');
        return;
      }

      await login(trimmed);
      resetState();
      onOpenChange(false);
    } catch {
      setError('Unable to verify token. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in with Token</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Paste your JWT bearer token below. It is stored in sessionStorage
            for this browser tab only and never sent in logs.
          </p>

          <Input
            type="password"
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            placeholder="Bearer / JWT token"
            data-testid="manual-token-input"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit();
            }}
            autoComplete="off"
          />

          {error !== null && (
            <p
              className="text-sm text-red-400"
              role="alert"
              data-testid="manual-token-error"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleCancel}
            disabled={isLoading}
            data-testid="manual-token-cancel"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!tokenValue.trim() || isLoading}
            data-testid="manual-token-submit"
          >
            {isLoading ? 'Verifying...' : 'Sign In'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
