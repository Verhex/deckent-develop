// D-F(a) spawn-boundary persona gate (sprint-523 task 6) — pinned at the
// SHARED resolution choke point (resolveAgentPromptWithIntegrity in
// result-collector), the same single-choke-point pattern as the 522-011 skill
// switch. Pins: broken+enforce → typed PERSONA_INTEGRITY_HOLD refusal;
// broken+advisory (DEFAULT) → spawn proceeds with the persona and a warning;
// intact → byte-identical content; absent persona → D-D degrade untouched.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAgentPromptWithIntegrity } from '../../src/orchestra/result-collector.js';
import { DEFAULT_PERSONA_INTEGRITY_MIN_BYTES } from '../../src/core/config.js';
import type { Task } from '../../src/core/types.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-persona-gate-'));
  mkdirSync(join(root, '.deckent', 'agents'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), '{}', 'utf-8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function installPersona(agentId: string, prompt: string): void {
  const dir = join(root, '.deckent', 'agents', agentId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'PROMPT.md'), prompt, 'utf-8');
}

function task(agentId?: string): Task {
  return { id: 't1', assignedAgent: agentId } as unknown as Task;
}

const GOOD = '# Persona\n' + 'content '.repeat(DEFAULT_PERSONA_INTEGRITY_MIN_BYTES);

describe('persona spawn gate (D-F(a))', () => {
  it('intact persona → byte-identical content, no refusal', () => {
    installPersona('good-agent', GOOD);
    const v = resolveAgentPromptWithIntegrity(root, task('good-agent'));
    expect(v.integrity).toBe('intact');
    expect(v.content).toBe(GOOD);
    expect(v.refusal).toBeNull();
  });

  it('broken (undersized) + ADVISORY DEFAULT → spawn proceeds with the persona, no refusal', () => {
    installPersona('tiny-agent', 'x');
    const v = resolveAgentPromptWithIntegrity(root, task('tiny-agent'));
    expect(v.integrity).toBe('undersized');
    expect(v.content).toBe('x');
    expect(v.refusal).toBeNull();
  });

  it('broken + enforce → typed PERSONA_INTEGRITY_HOLD refusal, no silent personaless spawn', () => {
    installPersona('tiny-agent', 'x');
    const v = resolveAgentPromptWithIntegrity(root, task('tiny-agent'), { enforce: true });
    expect(v.refusal).toEqual({ reasonCode: 'PERSONA_INTEGRITY_HOLD', verdict: 'undersized' });
    expect(v.content).toBeUndefined();
  });

  it('D-D untouched: an ABSENT persona degrades — never classified broken, never refused', () => {
    const v = resolveAgentPromptWithIntegrity(root, task('no-such-agent'), { enforce: true });
    expect(v.integrity).toBe('absent');
    expect(v.refusal).toBeNull();
    expect(v.content).toBeUndefined();
  });

  it('generic/agentless task is out of scope entirely', () => {
    const v = resolveAgentPromptWithIntegrity(root, task(undefined), { enforce: true });
    expect(v.integrity).toBe('absent');
    expect(v.refusal).toBeNull();
  });

  it('the floor is config-resolved through options, defaulting to the single config export', () => {
    installPersona('edge-agent', 'y'.repeat(DEFAULT_PERSONA_INTEGRITY_MIN_BYTES));
    expect(resolveAgentPromptWithIntegrity(root, task('edge-agent')).integrity).toBe('intact');
    expect(
      resolveAgentPromptWithIntegrity(root, task('edge-agent'), { minBytes: 10_000, enforce: true }).refusal?.verdict,
    ).toBe('undersized');
  });
});
