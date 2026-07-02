import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

// ─── Repo-wide hardcode ratchet (PKG-SSOT-REST, MASTER-PLAN #207) ────────
// Converting each call-site below to import PROVIDER_PACKAGES is out of
// this task's write scope (scope.filesWrite = provider-packages.ts + this
// file only) — see task-357-016 notes for the follow-up-task file list.
// Until that follow-up lands, this ratchet keeps the debt from growing:
// a listed file's occurrence count may only go DOWN (a site converting to
// the SSOT) or stay flat, never up, and no NEW file outside this list may
// start hardcoding a provider package literal.

const PROVIDER_LITERAL_PATTERN = /@anthropic-ai\/claude-code|@openai\/codex|@google\/gemini-cli/g;

// DISTINCT-FILE (write-protected by task-357-016 directive — never convert
// from this task) and write-scope-blocked (outside this task's
// scope.filesWrite) call sites, with their occurrence count observed at
// authoring time as the ratchet ceiling.
const KNOWN_HARDCODE_CEILING: Readonly<Record<string, number>> = Object.freeze({
  'src/cli/commands/chat.ts': 3,
  'src/cli/commands/onboard.ts': 1,
  'src/cli/commands/doctor.ts': 2, // DISTINCT-FILE protected
  'src/cli/helpers/wizard.ts': 1,
  'src/cli/helpers/messages.ts': 2, // DISTINCT-FILE protected
  'src/core/provisioner.ts': 3,
  'src/core/errors.ts': 2,
  'src/providers/claude.ts': 1,
  'src/providers/codex.ts': 1,
  'src/providers/gemini.ts': 1,
});

function countProviderLiterals(absPath: string): number {
  const content = readFileSync(absPath, 'utf8');
  return [...content.matchAll(PROVIDER_LITERAL_PATTERN)].length;
}

function listSrcTsFiles(): string[] {
  const srcDir = join(process.cwd(), 'src');
  return readdirSync(srcDir, { recursive: true })
    .map((entry) => entry.toString())
    .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
    .map((entry) => join(srcDir, entry));
}

describe('PROVIDER_PACKAGES: repo-wide hardcode ratchet', () => {
  it.each(Object.entries(KNOWN_HARDCODE_CEILING))(
    '%s hardcoded provider-package literals never exceed the recorded baseline (%d)',
    (relPath, ceiling) => {
      const count = countProviderLiterals(join(process.cwd(), relPath.split('/').join(sep)));
      expect(count).toBeLessThanOrEqual(ceiling);
    },
  );

  it('no file outside provider-packages.ts + the known-offender list hardcodes a provider-package literal', () => {
    const knownRelPaths = new Set([
      join('src', 'core', 'provider-packages.ts'),
      ...Object.keys(KNOWN_HARDCODE_CEILING).map((p) => p.split('/').join(sep)),
    ]);
    const offenders = listSrcTsFiles()
      .filter((absPath) => countProviderLiterals(absPath) > 0)
      .map((absPath) => relative(process.cwd(), absPath));

    const unexpected = offenders.filter((relPath) => !knownRelPaths.has(relPath));
    expect(unexpected).toEqual([]);
  });
});
