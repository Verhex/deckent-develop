// tests/cli/dpp-provision.test.ts
//
// DPP (sprint-352-005, row 208, re-run of never-dispatched 351-015): disk-verified
// 0-caller regression guard for the pre-consent-gate docker-build helpers flagged
// DEAD-CODE by ADR-G-030 — `maybeProvisionDockerImage` (init-steps.ts) and
// `reprovisionWorkerImageAfterUpgrade` (upgrade.ts). Neither has a live production
// call-site: `deckent init` wires the consent-gated `maybeOfferWorkerImageBuild`
// (init.ts) instead. This test pins that fact as a durable, CI-enforced invariant —
// so a future silent re-wire (auto-build without consent, violating ADR-G-030) fails
// the build instead of shipping quietly ("silent-build impossible").
//
// Full removal (ADR-D-006 Remove tier, born DEAD-PROVISION-PURGE) is a follow-up:
// this task's write scope excludes upgrade.ts and tests/cli/img2-init-fold.test.ts
// (the dedicated hermetic unit tests that import + directly exercise both
// functions) — deleting either function here would orphan that file's imports.
// See task-352-005.result notes for the coordinated-removal follow-up.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..', '..');
const SRC_ROOT = join(projectRoot, 'src');

// Lines that are known, non-call mentions of the dead helpers — documentation only.
// Anything else that mentions either identifier is treated as a new call-site.
const ALLOWED_MENTIONS = new Set([
  'src/cli/commands/init.ts',
]);

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dashboard') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      listSourceFiles(full, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

interface Mention {
  file: string;
  line: number;
  text: string;
}

/**
 * Every line under src/ mentioning `name`, excluding that function's own
 * `export async function <name>(` declaration line.
 */
function findNonDeclarationMentions(name: string): Mention[] {
  const hits: Mention[] = [];
  for (const absFile of listSourceFiles(SRC_ROOT)) {
    const relFile = relative(projectRoot, absFile).split('\\').join('/');
    const text = readFileSync(absFile, 'utf-8');
    if (!text.includes(name)) continue;
    text.split('\n').forEach((line, idx) => {
      if (!line.includes(name)) return;
      if (line.includes(`function ${name}(`)) return; // its own declaration
      hits.push({ file: relFile, line: idx + 1, text: line.trim() });
    });
  }
  return hits;
}

function unexpectedMentions(name: string): Mention[] {
  return findNonDeclarationMentions(name).filter((hit) => !ALLOWED_MENTIONS.has(hit.file));
}

describe('DPP — dead provision-helper 0-caller regression guard (ADR-G-030)', () => {
  it('maybeProvisionDockerImage has no production call-site under src/', () => {
    const unexpected = unexpectedMentions('maybeProvisionDockerImage');
    expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([]);
  });

  it('reprovisionWorkerImageAfterUpgrade has no production call-site under src/', () => {
    const unexpected = unexpectedMentions('reprovisionWorkerImageAfterUpgrade');
    expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([]);
  });

  it('the only doc-comment mention of either helper lives in init.ts, describing them as unwired siblings', () => {
    const provisionMentions = findNonDeclarationMentions('maybeProvisionDockerImage')
      .filter((hit) => ALLOWED_MENTIONS.has(hit.file));
    const reprovisionMentions = findNonDeclarationMentions('reprovisionWorkerImageAfterUpgrade')
      .filter((hit) => ALLOWED_MENTIONS.has(hit.file));
    expect(provisionMentions.length).toBeGreaterThan(0);
    expect(reprovisionMentions.length).toBeGreaterThan(0);
    for (const hit of [...provisionMentions, ...reprovisionMentions]) {
      expect(hit.text.startsWith('*')).toBe(true);
    }
  });

  it('maybeProvisionDockerImage carries a disk-verified deprecation marker recording the 0-caller evidence', () => {
    const text = readFileSync(
      join(SRC_ROOT, 'cli', 'commands', 'init-steps.ts'),
      'utf-8',
    );
    expect(text).toContain('@deprecated');
    expect(text).toContain('DEAD-PROVISION-PURGE');
  });
});
