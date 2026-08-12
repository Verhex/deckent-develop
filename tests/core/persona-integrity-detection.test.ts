// Owner D-G(a) (sprint-523 task 5): broken persona is MACHINE-detectable as
// empty / undersized / digest-mismatch / unreadable; the floor is
// config-resolved (DEFAULT_PERSONA_INTEGRITY_MIN_BYTES is the single default
// source, `persona_integrity.min_bytes` the override key); the verdict is DATA
// in this slice — no routing behaviour changes (task 6 consumes it at spawn).

import { describe, it, expect } from 'vitest';
import { classifyPersonaIntegrity } from '../../src/core/agent-pool.js';
import { DEFAULT_PERSONA_INTEGRITY_MIN_BYTES } from '../../src/core/config.js';

const FLOOR = DEFAULT_PERSONA_INTEGRITY_MIN_BYTES;

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
