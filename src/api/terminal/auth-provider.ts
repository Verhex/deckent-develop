import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Pluggable auth for the embedded terminal WebSocket gateway.
 *
 * V1 ships a single implementation (LocalTokenAuthProvider). Future enterprise
 * impls (OIDC, SSO, mTLS) plug in behind the same interface — see spec §1d.
 */
export interface AuthProvider {
  /** @returns true iff the presented credential is valid. */
  verify(presented: string | undefined): boolean;
}

function sha256(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

/**
 * Local single-token provider.
 *
 * Security invariant (spec §1c.2, aligns with Sprint-171 B-022 hardening):
 * this provider DELIBERATELY ignores `DECKENT_API_AUTH_DISABLED`. The global
 * read-only-dashboard dev bypass must never silently open a remote shell.
 * A terminal session ALWAYS requires the correct token — even when the rest
 * of the HTTP API has its bearer middleware disabled for local development.
 *
 * Comparison is constant-time via `timingSafeEqual` over fixed-length SHA-256
 * digests, which also avoids a timing/length oracle on the raw token bytes.
 */
export class LocalTokenAuthProvider implements AuthProvider {
  private readonly expected: Buffer;

  constructor(token: string) {
    if (!token) {
      throw new Error('LocalTokenAuthProvider requires a non-empty token');
    }
    this.expected = sha256(token);
  }

  verify(presented: string | undefined): boolean {
    if (!presented) return false;
    const actual = sha256(presented);
    return timingSafeEqual(actual, this.expected);
  }
}
