/**
 * CI D5 — the aggregate required-check ("Shards Green").
 *
 * Incident class (2026-08-11): PR #120 merged with red shards because the branch
 * ruleset required only Type Check plus the three Validator legs. The D5 shape is
 * one aggregate job that fans in every test shard, so the ruleset needs exactly
 * ONE new required context and never breaks when the matrix changes.
 *
 * This test is the mechanical half of that contract. It pins the aggregate's
 * existence, its fan-in width against the LIVE shard inventory, and — by executing
 * the gate's own script against fixtures — that the gate cannot report green when
 * a shard failed, was cancelled, skipped, or was silently dropped from `needs`.
 *
 * No YAML library resolves in this workspace and adding one is out of scope, so
 * the workflow is parsed with a small indentation-based reader below. It is
 * deliberately narrow: top-level `jobs:` mapping, 2-space job ids, 4-space job
 * keys, 6-space sequence items, 10-space step env keys — exactly the shape
 * .github/workflows/ci.yml is written in.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CI_WORKFLOW_PATH = resolve('.github/workflows/ci.yml');
const AGGREGATE_JOB_ID = 'shards-green';
const AGGREGATE_JOB_NAME = 'Shards Green';
/** Every test shard is named `Tests — …` in ci.yml; that prefix is the inventory key. */
const SHARD_NAME_PREFIX = 'Tests —';

interface WorkflowJob {
  id: string;
  name: string | null;
  ifExpression: string | null;
  needs: string[];
  continueOnError: boolean;
  body: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted =
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'));
  return quoted && trimmed.length >= 2 ? trimmed.slice(1, -1) : trimmed;
}

/** Reads a 4-space-indented scalar key from a job body. */
function jobScalar(body: string, key: string): string | null {
  const match = new RegExp(`^ {4}${key}:[ \\t]*(.*)$`, 'm').exec(body);
  return match ? unquote(match[1]) : null;
}

/** Reads a 10-space-indented `env:` entry from inside a step. */
function stepEnv(body: string, key: string): string | null {
  const match = new RegExp(`^ {10}${key}:[ \\t]*(.*)$`, 'm').exec(body);
  return match ? unquote(match[1]) : null;
}

/** Supports both `needs: a`, `needs: [a, b]` and the block-sequence form. */
function parseNeeds(body: string): string[] {
  const lines = body.split('\n');
  const index = lines.findIndex((line) => /^ {4}needs:/.test(line));
  if (index === -1) return [];

  const inline = lines[index].slice(lines[index].indexOf(':') + 1).trim();
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((entry) => unquote(entry))
      .filter((entry) => entry.length > 0);
  }
  if (inline.length > 0) return [unquote(inline)];

  const items: string[] = [];
  for (let i = index + 1; i < lines.length; i++) {
    const item = /^ {6}- (.+)$/.exec(lines[i]);
    if (!item) break;
    items.push(unquote(item[1]));
  }
  return items;
}

function parseJobs(content: string): WorkflowJob[] {
  const lines = content.split('\n');
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIndex === -1) throw new Error('ci.yml has no top-level `jobs:` mapping');

  const jobs: WorkflowJob[] = [];
  let currentId: string | null = null;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentId === null) return;
    const body = currentLines.join('\n');
    jobs.push({
      id: currentId,
      name: jobScalar(body, 'name'),
      ifExpression: jobScalar(body, 'if'),
      needs: parseNeeds(body),
      continueOnError: jobScalar(body, 'continue-on-error') === 'true',
      body,
    });
  };

  for (let i = jobsIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      flush();
      currentId = header[1];
      currentLines = [];
      continue;
    }
    // A non-indented, non-empty line closes the `jobs:` mapping.
    if (/^\S/.test(line)) break;
    if (currentId !== null) currentLines.push(line);
  }
  flush();
  return jobs;
}

/**
 * Pulls the gate body out of the `node -e '…'` block so the test can execute the
 * exact script CI runs, rather than a re-implementation of it.
 */
function extractGateScript(body: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^\s*node -e '$/.test(line));
  if (start === -1) {
    throw new Error("aggregate job has no `node -e '` gate script to execute");
  }
  const end = lines.findIndex((line, index) => index > start && /^\s*'\s*$/.test(line));
  if (end === -1) {
    throw new Error('aggregate gate script is not terminated by a closing quote line');
  }
  return lines.slice(start + 1, end).join('\n');
}

interface GateOutcome {
  exitCode: number;
  output: string;
}

async function runGate(
  script: string,
  env: { NEEDS_JSON: string; MINIMUM_SHARDS: string; GITHUB_EVENT_NAME: string }
): Promise<GateOutcome> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['-e', script], {
      env: { ...process.env, ...env },
    });
    return { exitCode: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

function needsFixture(ids: string[], results: Record<string, string> = {}): string {
  return JSON.stringify(
    Object.fromEntries(ids.map((id) => [id, { result: results[id] ?? 'success', outputs: {} }]))
  );
}

const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf-8');
const jobs = parseJobs(workflow);
const jobById = new Map(jobs.map((job) => [job.id, job]));
const shardJobs = jobs.filter((job) => job.name?.startsWith(SHARD_NAME_PREFIX));
const aggregate = jobById.get(AGGREGATE_JOB_ID);

describe('CI aggregate required check — Shards Green (D5)', () => {
  it('parses ci.yml into jobs with names and needs (parser sanity)', () => {
    expect(jobs.length).toBeGreaterThan(1);
    expect(jobById.get('typecheck')?.name).toBe('Type Check');
    // `build` uses the inline-list needs form; the shards use a scalar.
    expect(jobById.get('build')?.needs).toContain('test-core');
    expect(jobById.get('test-core')?.needs).toEqual(['typecheck']);
    expect(shardJobs.length).toBeGreaterThan(0);
  });

  it('defines the aggregate job under the single required-check context name', () => {
    expect(aggregate, `ci.yml has no \`${AGGREGATE_JOB_ID}\` job`).toBeDefined();
    expect(aggregate?.name).toBe(AGGREGATE_JOB_NAME);
  });

  it('fans in every `Tests —` shard job, with no shard left out', () => {
    const shardIds = shardJobs.map((job) => job.id).sort();
    expect(shardIds).toEqual([
      'test-cli',
      'test-core',
      'test-dashboard',
      'test-docs-scripts',
      'test-orchestra',
      'test-remaining',
      'test-windows',
    ]);
    expect([...(aggregate?.needs ?? [])].sort()).toEqual(shardIds);
  });

  it('declares a minimum fan-in count equal to the live shard inventory', () => {
    const declared = stepEnv(aggregate?.body ?? '', 'MINIMUM_SHARDS');
    expect(declared).not.toBeNull();
    expect(Number(declared)).toBe(shardJobs.length);
    expect(Number(declared)).toBe(aggregate?.needs.length);
  });

  it('runs on pull_request/push but never in the merge queue (row 535 preserved)', () => {
    expect(aggregate?.ifExpression).toBe("always() && github.event_name != 'merge_group'");
  });

  it('reads shard verdicts from the needs context rather than re-running anything', () => {
    expect(stepEnv(aggregate?.body ?? '', 'NEEDS_JSON')).toBe('${{ toJSON(needs) }}');
    const body = aggregate?.body ?? '';
    expect(body).not.toContain('vitest');
    expect(body).not.toContain('npm ci');
    expect(body).not.toContain('actions/checkout');
  });

  it('leaves every shard untouched — 535 guard, typecheck dependency, advisory state', () => {
    for (const shard of shardJobs) {
      expect(shard.ifExpression, `${shard.id} lost its merge_group guard`).toBe(
        "github.event_name != 'merge_group'"
      );
      expect(shard.needs, `${shard.id} lost its typecheck dependency`).toEqual(['typecheck']);
    }
    // The Docs+Scripts shard joins the aggregate ONLY through its current
    // continue-on-error state — GitHub reports a continue-on-error job as
    // `result: success` in the needs context, so it cannot red the gate until
    // its hard status is decided separately.
    expect(jobById.get('test-docs-scripts')?.continueOnError).toBe(true);
    expect(jobById.get('test-windows')?.continueOnError).toBe(true);
  });
});

describe('Shards Green gate script — executed against fixtures', () => {
  const script = extractGateScript(aggregate?.body ?? '');
  const shardIds = shardJobs.map((job) => job.id);
  const minimum = String(shardJobs.length);

  it('passes when every shard concluded green', async () => {
    const result = await runGate(script, {
      NEEDS_JSON: needsFixture(shardIds),
      MINIMUM_SHARDS: minimum,
      GITHUB_EVENT_NAME: 'pull_request',
    });
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain('shards concluded green');
  });

  it('fails when a shard failed', async () => {
    const result = await runGate(script, {
      NEEDS_JSON: needsFixture(shardIds, { 'test-orchestra': 'failure' }),
      MINIMUM_SHARDS: minimum,
      GITHUB_EVENT_NAME: 'pull_request',
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('test-orchestra=failure');
  });

  it('fails when a shard was cancelled', async () => {
    const result = await runGate(script, {
      NEEDS_JSON: needsFixture(shardIds, { 'test-cli': 'cancelled' }),
      MINIMUM_SHARDS: minimum,
      GITHUB_EVENT_NAME: 'pull_request',
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('test-cli=cancelled');
  });

  it('fails when a shard skipped outside the merge queue (upstream never ran it)', async () => {
    const result = await runGate(script, {
      NEEDS_JSON: needsFixture(shardIds, { 'test-core': 'skipped' }),
      MINIMUM_SHARDS: minimum,
      GITHUB_EVENT_NAME: 'pull_request',
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('test-core=skipped');
  });

  it('fails when a shard is silently dropped from the fan-in, even if the rest are green', async () => {
    const dropped = shardIds.filter((id) => id !== 'test-remaining');
    const result = await runGate(script, {
      NEEDS_JSON: needsFixture(dropped),
      MINIMUM_SHARDS: minimum,
      GITHUB_EVENT_NAME: 'pull_request',
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('dropped from the needs list');
  });

  it('tolerates skipped shards only when the event itself is merge_group', async () => {
    const allSkipped = Object.fromEntries(shardIds.map((id) => [id, 'skipped']));
    const result = await runGate(script, {
      NEEDS_JSON: needsFixture(shardIds, allSkipped),
      MINIMUM_SHARDS: minimum,
      GITHUB_EVENT_NAME: 'merge_group',
    });
    expect(result.exitCode, result.output).toBe(0);
  });

  it('still fails a merge_group run when a shard actually failed', async () => {
    const result = await runGate(script, {
      NEEDS_JSON: needsFixture(shardIds, { 'test-dashboard': 'failure' }),
      MINIMUM_SHARDS: minimum,
      GITHUB_EVENT_NAME: 'merge_group',
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('test-dashboard=failure');
  });

  it('fails closed when the declared minimum is not a positive integer', async () => {
    const result = await runGate(script, {
      NEEDS_JSON: needsFixture(shardIds),
      MINIMUM_SHARDS: '',
      GITHUB_EVENT_NAME: 'pull_request',
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('MINIMUM_SHARDS');
  });
});
