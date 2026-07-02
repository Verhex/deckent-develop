import { describe, it, expect } from 'vitest';

import {
  PROVIDER_PACKAGES,
  isCliProviderId,
  getProviderPackage,
  type CliProviderId,
  type ProviderPackageInfo,
} from '../../src/core/provider-packages.js';

// ─── PROVIDER_PACKAGES — SSOT shape + regression guard ───────────────────
// These values MUST match the literals currently hardcoded across
// src/providers/{claude,codex,gemini}.ts, src/core/{errors,provisioner}.ts,
// and src/cli/{helpers/messages,helpers/wizard,commands/doctor,commands/onboard,
// commands/chat}.ts — a mismatch here means either this SSOT or a call-site
// literal has drifted (this file is the one place that should ever change).

describe('PROVIDER_PACKAGES', () => {
  it('covers exactly claude, codex, gemini', () => {
    expect(Object.keys(PROVIDER_PACKAGES).sort()).toEqual(['claude', 'codex', 'gemini']);
  });

  it('is deeply frozen (SSOT cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(PROVIDER_PACKAGES)).toBe(true);
    for (const info of Object.values(PROVIDER_PACKAGES)) {
      expect(Object.isFrozen(info)).toBe(true);
    }
  });

  it('claude maps to the published @anthropic-ai/claude-code package + claude binary', () => {
    expect(PROVIDER_PACKAGES.claude).toMatchObject<Partial<ProviderPackageInfo>>({
      npmPkg: '@anthropic-ai/claude-code',
      binName: 'claude',
    });
  });

  it('codex maps to the published @openai/codex package + codex binary', () => {
    expect(PROVIDER_PACKAGES.codex).toMatchObject<Partial<ProviderPackageInfo>>({
      npmPkg: '@openai/codex',
      binName: 'codex',
    });
  });

  it('gemini maps to the published @google/gemini-cli package + gemini binary', () => {
    expect(PROVIDER_PACKAGES.gemini).toMatchObject<Partial<ProviderPackageInfo>>({
      npmPkg: '@google/gemini-cli',
      binName: 'gemini',
    });
  });

  it('derives installHint as `npm install -g <npmPkg>` for every provider (no separate literal)', () => {
    for (const info of Object.values(PROVIDER_PACKAGES)) {
      expect(info.installHint).toBe(`npm install -g ${info.npmPkg}`);
    }
  });
});

// ─── isCliProviderId — type guard ─────────────────────────────────────────

describe('isCliProviderId', () => {
  it.each(['claude', 'codex', 'gemini'] as const)('returns true for %s', (id) => {
    expect(isCliProviderId(id)).toBe(true);
  });

  it.each(['tmux', 'node', 'docker', 'ollama', '', 'Claude', 'claude-code'])(
    'returns false for non-CLI-provider value %j',
    (value) => {
      expect(isCliProviderId(value)).toBe(false);
    },
  );
});

// ─── getProviderPackage — accessor ────────────────────────────────────────

describe('getProviderPackage', () => {
  it('returns the exact frozen PROVIDER_PACKAGES entry for each known id', () => {
    const ids: CliProviderId[] = ['claude', 'codex', 'gemini'];
    for (const id of ids) {
      expect(getProviderPackage(id)).toBe(PROVIDER_PACKAGES[id]);
    }
  });
});
