import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMessage, MESSAGE_KEYS } from '../../src/cli/helpers/messages.js';

// Row 450 (508-001) closed this drift class for `deckent doctor`: the CLI
// hardcoded ">=18 required" while package.json's engines.node said ">=24" —
// two floors, one lie. 522-019 is the same drift on the desktop surface:
// desktop.error.node_not_found hardcoded "Node.js 18+" in en+tr. This test
// reads the manifest's engines.node value LIVE (no local literal) and pins
// every node-floor message against it, so the desktop twin can never drift
// from the manifest again without this test failing.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as {
  engines?: { node?: string };
};
const requiredFloor = manifest.engines?.node;

// A bare version-like literal — e.g. "18", "18+", "24.0.0" — the kind of
// hardcoded number this task exists to remove. The {floor} placeholder
// itself is stripped first so a correctly-interpolated message never trips
// this pattern; only a literal digit run left in the catalog does.
const VERSION_LITERAL_PATTERN = /\d+(?:\.\d+){1,2}\+?|\b\d{1,3}\+/;

describe('desktop Node-floor message derives from engines (row 450 twin, 522-019)', () => {
  it('the manifest declares an engines.node floor', () => {
    expect(requiredFloor).toBeTruthy();
  });

  it('desktop.error.node_not_found (en) interpolates the live manifest floor', () => {
    const msg = getMessage('desktop.error.node_not_found', 'en');
    expect(msg).toContain(requiredFloor);
    expect(msg).not.toContain('18+');
  });

  it('desktop.error.node_not_found (tr) interpolates the live manifest floor', () => {
    const msg = getMessage('desktop.error.node_not_found', 'tr');
    expect(msg).toContain(requiredFloor);
    expect(msg).not.toContain('18+');
  });

  it('error.node_version_low (en) interpolates the live manifest floor, not a source literal', () => {
    // The manifest's current floor happens to equal the old hardcoded
    // string, so containment alone can't prove interpolation — a
    // caller-supplied override must actually take effect for that.
    expect(getMessage('error.node_version_low', 'en')).toContain(requiredFloor);
    expect(getMessage('error.node_version_low', 'en', { floor: '>=99.0.0' })).toContain('>=99.0.0');
  });

  it('error.node_version_low (tr) interpolates the live manifest floor, not a source literal', () => {
    expect(getMessage('error.node_version_low', 'tr')).toContain(requiredFloor);
    expect(getMessage('error.node_version_low', 'tr', { floor: '>=99.0.0' })).toContain('>=99.0.0');
  });

  it('a caller-supplied floor still overrides the manifest default', () => {
    const msg = getMessage('desktop.error.node_not_found', 'en', { floor: '>=99.0.0' });
    expect(msg).toContain('>=99.0.0');
  });

  it('no message key matching /node/i carries a hardcoded major-version literal', () => {
    // A live-derived {floor} legitimately renders as e.g. "24.0.0", which
    // would itself match a naive version-literal regex — that must NOT read
    // as a hardcoded offender. Substituting a non-numeric token in place of
    // {floor} isolates genuine source-literal digits from correct
    // interpolation: only a template that embeds its own digits regardless
    // of the supplied var can trip the pattern below.
    const offenders: string[] = [];
    for (const key of MESSAGE_KEYS) {
      if (!/node/i.test(key)) continue;
      for (const lang of ['en', 'tr']) {
        const resolved = getMessage(key, lang, { floor: 'FLOOR_TOKEN' });
        if (VERSION_LITERAL_PATTERN.test(resolved)) {
          offenders.push(`${key} (${lang}): "${resolved}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
