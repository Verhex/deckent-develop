// @deckent/exec-authority-native loader (W3-PR-A).
//
// FAIL-CLOSED CONTRACT: when the compiled binding is absent or unloadable this
// module returns a typed `{ available: false, reason }` — it never substitutes
// path-based I/O and consumers must treat absence exactly like today's
// `secure-open-unsupported` boundary (D3, owner-approved 2026-08-05).

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

const BINDING_CANDIDATES = [
  join(HERE, 'build', 'Release', 'exec_authority.node'),
  join(HERE, 'build', 'Debug', 'exec_authority.node'),
];

/**
 * Load the native capability surface.
 * @returns {{ available: true, binding: object } | { available: false, reason: string }}
 */
export function loadExecAuthorityNative() {
  for (const candidate of BINDING_CANDIDATES) {
    try {
      const binding = require(candidate);
      return { available: true, binding };
    } catch (error) {
      if ((/** @type {NodeJS.ErrnoException} */ (error)).code === 'MODULE_NOT_FOUND') continue;
      return {
        available: false,
        reason: `binding-load-failed:${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return { available: false, reason: 'binding-not-built' };
}
