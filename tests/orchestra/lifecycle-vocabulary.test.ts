/**
 * tests/orchestra/lifecycle-vocabulary.test.ts
 *
 * Row 3305 (CODE-DOC-DIFF ARCH-01): pins the single canonical `SprintPhase`
 * lifecycle vocabulary so the enum, the transitions sprint-controller.ts
 * actually emits, and its own comments can never silently drift apart again.
 *
 * Direction chosen (see sprint-controller.ts `runSprint` docstring + the
 * "Terminal Handoff Authority" section): CLEANUP is NOT a `SprintPhase`
 * member. It is non-phase post-terminal maintenance (clear scan interval,
 * remove task/lock files) that runs inline between the emitted DECAY and
 * COMPLETE transitions, gated by the terminal receipt authority. It never
 * mutates `sprint.phase` and is never itself an emitted phase transition.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SprintPhase } from '../../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTROLLER_PATH = resolve(__dirname, '..', '..', 'src', 'orchestra', 'sprint-controller.ts');
const controllerSource = readFileSync(CONTROLLER_PATH, 'utf-8');

const CANONICAL_PHASES = [
  'DIRECTIVE', 'PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE',
  'FIX', 'RETRO', 'DECAY', 'TRANSITION', 'COMPLETE',
];

describe('lifecycle phase vocabulary (row 3305)', () => {
  it('SprintPhase enum is exactly the canonical ten-member vocabulary — no CLEANUP', () => {
    expect(Object.values(SprintPhase).sort()).toEqual([...CANONICAL_PHASES].sort());
    expect(Object.prototype.hasOwnProperty.call(SprintPhase, 'CLEANUP')).toBe(false);
  });

  it('every emitPhaseChange call in sprint-controller.ts references a real SprintPhase member', () => {
    const callRegex = /emitPhaseChange\(\s*([A-Za-z.]+)\s*,\s*([A-Za-z.]+)\s*,/g;
    const enumValues = new Set<string>(Object.values(SprintPhase) as string[]);
    const calls: Array<{ from: string; to: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = callRegex.exec(controllerSource)) !== null) {
      calls.push({ from: match[1], to: match[2] });
    }

    // Exactly the seven documented lifecycle transitions — a new/removed call
    // site here means this test (and the docstring above it) must be updated
    // deliberately, not silently.
    expect(calls).toHaveLength(7);

    for (const call of calls) {
      for (const ref of [call.from, call.to]) {
        expect(ref.startsWith('SprintPhase.')).toBe(true);
        const member = ref.slice('SprintPhase.'.length);
        expect(enumValues.has(member)).toBe(true);
        expect(member).not.toBe('CLEANUP');
      }
    }
  });

  it('the emitted transition chain forms one contiguous PLAN→…→COMPLETE path with no CLEANUP hop', () => {
    const callRegex = /emitPhaseChange\(\s*SprintPhase\.(\w+)\s*,\s*SprintPhase\.(\w+)\s*,/g;
    const chain: Array<[string, string]> = [];
    let match: RegExpExecArray | null;
    while ((match = callRegex.exec(controllerSource)) !== null) {
      chain.push([match[1], match[2]]);
    }

    expect(chain).toEqual([
      ['PLAN', 'SPAWN'],
      ['SPAWN', 'EXECUTE'],
      ['EXECUTE', 'EVALUATE'],
      ['EVALUATE', 'FIX'],
      ['FIX', 'RETRO'],
      ['RETRO', 'DECAY'],
      ['DECAY', 'COMPLETE'],
    ]);

    for (let i = 1; i < chain.length; i++) {
      expect(chain[i][0]).toBe(chain[i - 1][1]);
    }
  });

  it('sprint.phase is only ever assigned real, non-CLEANUP SprintPhase members', () => {
    const assignRegex = /sprint\.phase\s*=\s*SprintPhase\.(\w+)/g;
    const enumValues = new Set<string>(Object.values(SprintPhase) as string[]);
    let match: RegExpExecArray | null;
    let assignmentCount = 0;
    while ((match = assignRegex.exec(controllerSource)) !== null) {
      assignmentCount += 1;
      expect(enumValues.has(match[1])).toBe(true);
      expect(match[1]).not.toBe('CLEANUP');
    }
    expect(assignmentCount).toBeGreaterThan(0);
  });

  it('no comment claims a CLEANUP phase-transition arrow (the CODE-DOC-DIFF this task closes)', () => {
    expect(controllerSource).not.toMatch(/RETRO\s*→\s*CLEANUP/);
    expect(controllerSource).not.toMatch(/CLEANUP\s*→\s*COMPLETE/);
    expect(controllerSource).not.toMatch(/→\s*CLEANUP\s*→/);
  });

  it('runCleanupPhase maintenance is documented as non-phase, not a numbered SprintPhase', () => {
    expect(controllerSource).toMatch(/CLEANUP is NOT a `SprintPhase` member/);
    expect(controllerSource).toMatch(/non-phase/);
    expect(controllerSource).not.toMatch(/Phase 8: CLEANUP/);
  });
});
