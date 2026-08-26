import { spawn } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildExecutionLandingProposalPromptSegment } from '../../src/core/execution-landing-proposal.js';

const ATTEMPT = 'fceb6d16-8bff-4b7b-b862-e6de39085bf8';
const roots: string[] = [];

interface BashResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runBash(args: string[], cwd: string, stdin?: string): Promise<BashResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', args, {
      cwd,
      env: {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        DECKENT_ATTEMPT_ID: ATTEMPT,
        DECKENT_TASK_ID: '691-003',
        DECKENT_PROJECT_ROOT: cwd,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

function bashBlock(segment: string): string {
  const match = segment.match(/```bash\n([\s\S]*?)\n```/u);
  if (!match?.[1]) throw new Error('checkpoint protocol Bash block is absent');
  return match[1];
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('budget landing checkpoint quote safety', () => {
  it.each(['single\'quote', 'double"quote', 'back`tick', 'line\nbreak', 'dollar$(printf injected)'])(
    'parses and atomically writes a task identity containing %s',
    async taskId => {
      const root = mkdtempSync(join(tmpdir(), 'deckent-budget-landing-'));
      roots.push(root);
      mkdirSync(join(root, '.tasks'));
      cpSync(join(process.cwd(), 'dist'), join(root, 'dist'), { recursive: true });
      cpSync(join(process.cwd(), 'package.json'), join(root, 'package.json'));
      symlinkSync(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      const segment = buildExecutionLandingProposalPromptSegment(taskId, ATTEMPT);
      const command = bashBlock(segment).replace(
        '"best-effort current ISO-8601 timestamp"',
        '"2026-08-26T00:00:00.000Z"',
      );

      const parsed = await runBash(['-n'], root, command);
      expect(parsed, parsed.stderr).toMatchObject({ code: 0 });

      const executed = await runBash([], root, command);
      expect(executed, `${executed.stderr}\n${executed.stdout}`).toMatchObject({ code: 0 });
      const written = JSON.parse(readFileSync(
        join(root, `.tasks/task-${taskId}.landing-proposal.json`),
        'utf8',
      )) as { taskId: string; attemptId: string };
      expect(written).toMatchObject({ taskId, attemptId: ATTEMPT });
    },
  );

  it('atomically writes a valid task identity', async () => {
    const taskId = '691-003';
    const root = mkdtempSync(join(tmpdir(), 'deckent-budget-landing-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'));
    cpSync(join(process.cwd(), 'dist'), join(root, 'dist'), { recursive: true });
    cpSync(join(process.cwd(), 'package.json'), join(root, 'package.json'));
    symlinkSync(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
    const command = bashBlock(
      buildExecutionLandingProposalPromptSegment(taskId, ATTEMPT),
    ).replace(
      '"best-effort current ISO-8601 timestamp"',
      '"2026-08-26T00:00:00.000Z"',
    );

    const executed = await runBash([], root, command);
    expect(executed, `${executed.stderr}\n${executed.stdout}`).toMatchObject({ code: 0 });
    const written = JSON.parse(readFileSync(
      join(root, `.tasks/task-${taskId}.landing-proposal.json`),
      'utf8',
    )) as {
        taskId: string;
        attemptId: string;
      };
    expect(written).toMatchObject({ taskId, attemptId: ATTEMPT });
  });

  it('reproduces the legacy raw single-quoted JSON EOF failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-budget-landing-legacy-'));
    roots.push(root);
    const payload = JSON.stringify({ taskId: "single'quote" });
    const legacy = `proposal_json='${payload}\nprintf '%s' "$proposal_json"`;

    const parsed = await runBash(['-n'], root, legacy);
    expect(parsed.code).not.toBe(0);
    expect(parsed.stderr).toMatch(/unexpected EOF|unmatched|unterminated/iu);
  });
});
