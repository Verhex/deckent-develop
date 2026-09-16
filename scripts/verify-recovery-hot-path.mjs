import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const checks = [
  {
    file: 'src/orchestra/sprint-spawner.ts',
    forbidden: [
      'sprint-recovery-operation',
      'execution-recovery-service',
      'readCanonicalRunStatus',
      'ApprovalBroker',
    ],
  },
  {
    file: 'src/agents/worker.ts',
    forbidden: [
      'sprint-recovery-operation',
      'execution-recovery-service',
    ],
  },
];

const violations = [];
for (const check of checks) {
  const source = await readFile(resolve(check.file), 'utf8');
  for (const token of check.forbidden) {
    if (source.includes(token)) violations.push(`${check.file}:${token}`);
  }
}

process.stdout.write(`${JSON.stringify({
  ok: violations.length === 0,
  checkedFiles: checks.map(check => check.file),
  violations,
})}\n`);
if (violations.length > 0) process.exitCode = 1;
