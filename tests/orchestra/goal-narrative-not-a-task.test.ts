// ═══ KN4 (GR-2026-08-08-DOGFOOD-KN4-01) — Goal narrative is context, not work ═
// Measured in the re-smoke: the last-resort line splitter turned the narrative
// under `# Goal` into a SCOPELESS task, which died at execution-landing
// admission ("landing scope must contain at least one path") and killed SPAWN.
// These pins run the REAL planSprint (structured mode, hermetic tmpdir, no
// provider) against the smoke's exact DIRECTIVES shape.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Notifications reach out-of-process surfaces — silence them for hermeticity.
vi.mock('../../src/orchestra/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyAsync: vi.fn(),
  bootstrapNotifyDispatcher: vi.fn(),
}));

import { planSprint, readContext } from '../../src/orchestra/sprint-planner.js';
import { mergeConfigs } from '../../src/core/config.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const SMOKE_DIRECTIVES = `# Goal
Add an uppercase variant to the greeting module.

## Tasks
- Add \`greetLoud(name)\` to src/greet.js returning the uppercase greeting.
- Add a smoke test file tests/greet.test.js covering both functions.
`;

function makeConfig(): ResolvedConfig {
  // Real default-resolved config (no file/network IO) — only the planning mode
  // is pinned to structured so no provider is ever consulted.
  const cfg = mergeConfigs(null, null) as unknown as ResolvedConfig & { brain_planning?: string };
  cfg.brain_planning = 'structured';
  return cfg as ResolvedConfig;
}

let root = '/unset';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kn4-goal-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, 'DIRECTIVES.md'), SMOKE_DIRECTIVES);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('KN4 — goal narrative is never a task (line-splitter fallback)', () => {
  it('plans exactly the two bullet tasks; the Goal narrative produces none', async () => {
    const context = { ...readContext(root), directives: SMOKE_DIRECTIVES };
    const sprint = await planSprint(root, makeConfig(), context as never, {
      size: 'full', maxWorkers: 3, modelConstraint: null, reason: 'test',
    } as never, { dryRun: true });

    expect(sprint.tasks).toHaveLength(2);
    const titles = sprint.tasks.map((t) => t.title);
    expect(titles.some((t) => t.includes('greetLoud'))).toBe(true);
    expect(titles.some((t) => t.includes('greet.test.js'))).toBe(true);
    // The narrative line must not survive as a task in any form.
    expect(titles.some((t) => t.startsWith('Add an uppercase variant'))).toBe(false);
    // And every planned task carries a real file scope — the landing-admission
    // precondition the scopeless goal-task violated.
    for (const t of sprint.tasks) {
      const scope = t.scope ?? { filesWrite: [], filesRead: [], directories: [] };
      expect((scope.filesWrite?.length ?? 0) + (scope.filesRead?.length ?? 0) + (scope.directories?.length ?? 0))
        .toBeGreaterThan(0);
    }
  });

  it('a Goal section BULLET is still work — only prose is excluded', async () => {
    const directives = `# Goal
Ship the greeting feature.
- Add \`shout(name)\` to src/greet.js as part of the goal statement.
`;
    writeFileSync(join(root, 'DIRECTIVES.md'), directives);
    const context = { ...readContext(root), directives };
    const sprint = await planSprint(root, makeConfig(), context as never, {
      size: 'full', maxWorkers: 3, modelConstraint: null, reason: 'test',
    } as never, { dryRun: true });

    expect(sprint.tasks).toHaveLength(1);
    expect(sprint.tasks[0]!.title).toContain('shout');
  });
});
