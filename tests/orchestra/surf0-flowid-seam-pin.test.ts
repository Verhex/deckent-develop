/**
 * SURF-0 flowId seam pin (born-689, sprint-432 + CC cross-task fix).
 *
 * Sprint-432 delivered the SURF-0 correlation chain as micro-tasks:
 *   432-001 RunSprintOptions.flowId/commandId (contract) →
 *   432-002 start.ts --flow-id → runSprint options (ingress) →
 *   432-004 runRetroPhase(flowId) → finalizeSprint (phases hop) →
 *   432-003 completionRecord.flowId (receipt).
 * The MIDDLE hop — runSprint's own call into runRetroPhase forwarding
 * `opts?.flowId` — belonged to none of those single-file tasks and was
 * silently dropped (disk-verify caught it: sprint-controller.ts:1890 called
 * runRetroPhase without the id, so a real `do --run --yes` would still
 * produce a flowId-less completion record while every unit test passed).
 *
 * This file pins the seam with source-asserts (prompt-gate-start-path.test.ts
 * / calltool-exec-wire.test.ts precedent) so a refactor cannot re-drop a hop
 * without failing loudly. The end-to-end runtime receipt lives in
 * term-flow-composition.test.ts (432-005) and the real-binary run evidence
 * (MASTER-PLAN 566 SURF-0 kanıt-kriteri).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const controllerSrc = readFileSync(join(REPO, 'src/orchestra/sprint-controller.ts'), 'utf-8');
const phasesSrc = readFileSync(join(REPO, 'src/orchestra/sprint-phases.ts'), 'utf-8');
const startSrc = readFileSync(join(REPO, 'src/cli/commands/start.ts'), 'utf-8');
const flowBranchStart = startSrc.indexOf('const flowId = opts.flowId!');
const flowBranchEnd = startSrc.indexOf('// ─── Provider Bootstrap', flowBranchStart);
const flowBranchSrc = startSrc.slice(flowBranchStart, flowBranchEnd);

describe('SURF-0 flowId correlation chain — every hop stays wired', () => {
  it('RunSprintOptions carries the additive correlation fields (432-001)', () => {
    expect(controllerSrc).toMatch(/flowId\?: string;/);
    expect(controllerSrc).toMatch(/commandId\?: string;/);
  });

  it('start.ts forwards --flow-id into the runSprint options object (432-002)', () => {
    expect(flowBranchStart).toBeGreaterThanOrEqual(0);
    expect(flowBranchEnd).toBeGreaterThan(flowBranchStart);
    // Exact-plan two-phase start (B3): the approved snapshot is admitted via
    // startApprovedRun() into `exactSprint` before runSprint — the pin follows
    // that admission seam while still requiring the same `flowId` forwarding.
    expect(flowBranchSrc).toMatch(
      /runSprint\([\s\S]*?preplannedSprint: exactSprint,[\s\S]*?flowId,[\s\S]*?\}\);/,
    );
  });

  it('runSprint forwards opts?.flowId into runRetroPhase — the middle hop (CC seam fix)', () => {
    // Call-site is now multiline and carries trailing args after flowId —
    // the pin only requires the positional chain up to opts?.flowId intact.
    expect(controllerSrc).toMatch(
      /runRetroPhase\(\s*projectRoot,\s*sprint,\s*evaluations,\s*results,\s*config,\s*opts\?\.testMode,\s*opts\?\.flowId,/,
    );
  });

  it('runRetroPhase accepts flowId and forwards it to finalizeSprint (432-004)', () => {
    expect(phasesSrc).toMatch(/runRetroPhase\([\s\S]{0,600}?flowId\?: string,/);
    // finalizeSprint options object inside runRetroPhase carries the id
    expect(phasesSrc).toMatch(/finalizeSprint\(projectRoot, sprint, evaluations, results, \{[\s\S]{0,300}?flowId,/);
  });
});
