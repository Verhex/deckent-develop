import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildExecutionLandingProposalPromptSegment } from '../../src/core/execution-landing-proposal.js';

const ATTEMPT = '11111111-1111-4111-8111-111111111111';
const roots: string[] = [];

interface BashResult {
  code: number | null;
  stderr: string;
}

function runBash(args: string[], cwd: string, stdin?: string): Promise<BashResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', args, { cwd, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stderr }));
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
      const segment = buildExecutionLandingProposalPromptSegment(taskId, ATTEMPT);
      const command = bashBlock(segment);

      const parsed = await runBash(['-n'], root, command);
      expect(parsed, parsed.stderr).toMatchObject({ code: 0 });

      const executed = await runBash([], root, command);
      expect(executed, executed.stderr).toMatchObject({ code: 0 });
      const written = JSON.parse(readFileSync(join(root, `.tasks/task-${taskId}.landing-proposal.json`), 'utf8')) as {
        taskId: string;
        attemptId: string;
      };
      expect(written).toMatchObject({ taskId, attemptId: ATTEMPT });
    },
  );

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
