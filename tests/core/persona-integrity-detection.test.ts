// Owner D-G(a) (sprint-523 task 5): broken persona is MACHINE-detectable as
// empty / undersized / digest-mismatch / unreadable; the floor is
// config-resolved (DEFAULT_PERSONA_INTEGRITY_MIN_BYTES is the single default
// source, `persona_integrity.min_bytes` the override key); the verdict is DATA
// in this slice — no routing behaviour changes (task 6 consumes it at spawn).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { classifyPersonaIntegrity, resolvePrompt } from '../../src/core/agent-pool.js';
import { DEFAULT_PERSONA_INTEGRITY_MIN_BYTES } from '../../src/core/config.js';

const FLOOR = DEFAULT_PERSONA_INTEGRITY_MIN_BYTES;

function sha256Of(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

describe('persona integrity classification (D-G(a))', () => {
  it('a real persona above the floor with no declared digest is intact', () => {
    expect(classifyPersonaIntegrity({
      availability: 'prompt-file',
      content: '# Persona\n'.padEnd(FLOOR + 10, 'x'),
      minBytes: FLOOR,
    })).toBe('intact');
  });

  it('empty content is `empty`, not undersized', () => {
    expect(classifyPersonaIntegrity({
      availability: 'prompt-file', content: '', minBytes: FLOOR,
    })).toBe('empty');
  });

  it('below the config-resolved floor is `undersized`', () => {
    expect(classifyPersonaIntegrity({
      availability: 'prompt-file', content: 'hi', minBytes: FLOOR,
    })).toBe('undersized');
  });

  it('declared digest disagreeing with the actual digest is `digest-mismatch`', () => {
    expect(classifyPersonaIntegrity({
      availability: 'prompt-file',
      content: 'x'.repeat(FLOOR + 1),
      minBytes: FLOOR,
      declaredDigest: 'sha256:' + 'a'.repeat(64),
      actualDigest: 'sha256:' + 'b'.repeat(64),
    })).toBe('digest-mismatch');
  });

  it('NO declared digest never fabricates a mismatch — intact', () => {
    expect(classifyPersonaIntegrity({
      availability: 'prompt-file',
      content: 'x'.repeat(FLOOR + 1),
      minBytes: FLOOR,
      declaredDigest: null,
      actualDigest: 'sha256:' + 'b'.repeat(64),
    })).toBe('intact');
  });

  it('availability none is `unreadable` regardless of content', () => {
    expect(classifyPersonaIntegrity({
      availability: 'none', content: 'whatever', minBytes: FLOOR,
    })).toBe('unreadable');
  });

  it('the floor default is a config export, not a literal at the call site', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/core/agent-pool.ts', 'utf-8'));
    expect(src).toContain('minBytes: number');
    // classifier body carries no numeric floor literal
    const body = src.slice(src.indexOf('export function classifyPersonaIntegrity'), src.indexOf('export interface ResolvedAgentPrompt'));
    expect(body).not.toMatch(/minBytes\s*[<>=]+\s*\d/);
  });
});

// ─── 524-012: manifest-declared digest, carried by the real resolver ─────────
//
// The classifier has always supported `digest-mismatch`, but nothing declared a digest and
// the resolver never carried one, so the class was unreachable from production. These tests
// exercise the actual `resolvePrompt()` resolution path (agent-pool.ts) against a real tmpdir
// `.deckent/agents/<id>/` manifest, and feed its `declaredDigest`/`actualDigest` straight into
// `classifyPersonaIntegrity` — proving the two are wired together, not just independently valid.

describe('persona integrity: manifest-declared digest reaches the resolver (524-012)', () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      const dir = roots.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeProject(agentId: string, promptContent: string, promptSha256?: string | null): string {
    const root = mkdtempSync(join(tmpdir(), 'deckent-persona-digest-'));
    roots.push(root);
    const agentDir = join(root, '.deckent', 'agents', agentId);
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'PROMPT.md'), promptContent, 'utf8');
    const manifest: Record<string, unknown> = { id: agentId, name: agentId };
    if (promptSha256 !== undefined) manifest['promptSha256'] = promptSha256;
    writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(manifest), 'utf8');
    return root;
  }

  it('resolvePrompt carries the declared digest, and a wrong one classifies as digest-mismatch', () => {
    const content = '# Persona\n'.padEnd(FLOOR + 10, 'x');
    const wrongDigest = 'sha256:' + 'a'.repeat(64);
    const root = makeProject('digest-agent', content, wrongDigest);

    const resolved = resolvePrompt('digest-agent', root);
    expect(resolved.declaredDigest).toBe(wrongDigest);
    expect(resolved.actualDigest).toBe(sha256Of(content));
    expect(resolved.actualDigest).not.toBe(resolved.declaredDigest);

    expect(classifyPersonaIntegrity({
      availability: resolved.availability,
      content: resolved.content,
      minBytes: FLOOR,
      declaredDigest: resolved.declaredDigest,
      actualDigest: resolved.actualDigest,
    })).toBe('digest-mismatch');
  });

  it('resolvePrompt carries a matching declared digest through as intact', () => {
    const content = '# Persona\n'.padEnd(FLOOR + 10, 'y');
    const root = makeProject('matching-digest-agent', content, sha256Of(content));

    const resolved = resolvePrompt('matching-digest-agent', root);
    expect(resolved.declaredDigest).toBe(resolved.actualDigest);

    expect(classifyPersonaIntegrity({
      availability: resolved.availability,
      content: resolved.content,
      minBytes: FLOOR,
      declaredDigest: resolved.declaredDigest,
      actualDigest: resolved.actualDigest,
    })).toBe('intact');
  });

  it('a manifest with no declared digest resolves declaredDigest null and never fabricates a mismatch', () => {
    const content = '# Persona\n'.padEnd(FLOOR + 10, 'z');
    const root = makeProject('no-digest-agent', content);

    const resolved = resolvePrompt('no-digest-agent', root);
    expect(resolved.declaredDigest).toBeNull();
    expect(resolved.actualDigest).toBe(sha256Of(content));

    expect(classifyPersonaIntegrity({
      availability: resolved.availability,
      content: resolved.content,
      minBytes: FLOOR,
      declaredDigest: resolved.declaredDigest,
      actualDigest: resolved.actualDigest,
    })).toBe('intact');
  });
});
