/**
 * 523-004 — Docs+Scripts flake canary wiring.
 *
 * The onTaskUpdate flake canary itself (fileParallelism + dot reporter gated on
 * `VITEST_DOCS_SCRIPTS_SERIAL`) already lives in vitest.config.ts. This task's
 * job is narrower: put that env var onto the `test-docs-scripts` job's existing
 * step in ci.yml, without adding a retry and without touching
 * continue-on-error (the flake RCA rejected bounded retry, and
 * continue-on-error stays until the RCA's acceptance series is met).
 *
 * This file pins the wiring itself — separate from the general job-shape pins
 * in tests/github/ci-workflow.test.ts — and additionally cross-checks that the
 * env var name in ci.yml is byte-identical to the one vitest.config.ts reads,
 * so a rename on either side can't silently desync the two.
 *
 * No YAML library resolves in this workspace (see tests/scripts/ci-aggregate-
 * gate.test.ts) — this reader is a narrow, self-contained slice scoped to just
 * the one job/step it cares about, in the same string-slicing style already
 * used by tests/github/ci-workflow.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CI_WORKFLOW_PATH = resolve('.github/workflows/ci.yml');
const VITEST_CONFIG_PATH = resolve('vitest.config.ts');
const CANARY_ENV_VAR = 'VITEST_DOCS_SCRIPTS_SERIAL';
const STEP_NAME = 'Run docs and scripts tests';

const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf-8');
const vitestConfig = readFileSync(VITEST_CONFIG_PATH, 'utf-8');

function extractJobSection(content: string, jobId: string): string {
  const start = content.indexOf(`\n  ${jobId}:`);
  if (start === -1) throw new Error(`ci.yml has no top-level \`${jobId}:\` job`);
  const next = content.indexOf('\n\n  ', start + 1);
  return next === -1 ? content.slice(start) : content.slice(start, next);
}

function extractStepBlock(jobSection: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const start = jobSection.indexOf(marker);
  if (start === -1) {
    throw new Error(`job section has no \`${marker}\` step`);
  }
  // A step block ends at the next `- ` sequence item at the same (6-space)
  // indentation, or at the end of the job section.
  const rest = jobSection.slice(start + marker.length);
  const nextStep = rest.search(/\n {6}- /);
  return nextStep === -1 ? jobSection.slice(start) : jobSection.slice(start, start + marker.length + nextStep);
}

describe('Docs+Scripts flake canary — CI wiring (523-004)', () => {
  const docsSection = extractJobSection(workflow, 'test-docs-scripts');
  const step = extractStepBlock(docsSection, STEP_NAME);

  it('parses the test-docs-scripts job and its test step (parser sanity)', () => {
    expect(docsSection).toContain('test-docs-scripts:');
    expect(step).toContain(`- name: ${STEP_NAME}`);
  });

  it('runs the canary env on the existing step, not a new/duplicate step', () => {
    const stepCount = (docsSection.match(new RegExp(`- name: ${STEP_NAME}`, 'g')) ?? []).length;
    expect(stepCount).toBe(1);
    expect(step).toContain(`env:\n          ${CANARY_ENV_VAR}: '1'`);
  });

  it('leaves the test command itself untouched — no shard scope change', () => {
    expect(step).toContain('run: npx vitest run tests/docs/ tests/scripts/ --pool=forks');
  });

  it('leaves the timeout untouched', () => {
    expect(step).toContain('timeout-minutes: 15');
  });

  it('keeps job-level continue-on-error until the RCA acceptance series is met', () => {
    expect(docsSection).toContain('continue-on-error: true');
  });

  it('adds no bounded retry — the RCA rejected retry as a fix', () => {
    // Checks for actual retry constructs, not the word "retry" — this job's
    // own explanatory comment legitimately says "no retry".
    expect(step).not.toContain('nick-fields/retry');
    expect(step).not.toMatch(/^\s*retry:/m);
    expect(step).not.toMatch(/for\s+\w+\s+in\s+.*do\b/);
    expect((step.match(/run:/g) ?? []).length).toBe(1);
  });

  it('does not add a second job or step to run the canary in parallel', () => {
    // Only ever one env block on the docs-scripts job — a second env: block
    // would mean the canary was wired onto a duplicate/new step instead of
    // the existing one.
    const envBlockCount = (docsSection.match(/\n {8}env:\n/g) ?? []).length;
    expect(envBlockCount).toBe(1);
  });

  it('matches the exact env var name vitest.config.ts reads — no drift between the two files', () => {
    expect(vitestConfig).toContain(`process.env['${CANARY_ENV_VAR}']`);
  });
});
