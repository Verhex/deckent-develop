#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const legacyId = `ADR-${'037'}`;
const canonicalId = 'ADR-G-020';
const immutableHistory = new Set([
  'docs/adr/adr-g-020-authority-roles-flow-enforcement.md',
  'docs/adr/adr-g-023-agent-skill-taxonomy.md',
  'docs/MASTER-PLAN.md',
  'docs/SPRINT-LOG.md',
]);
const roots = [
  'src',
  'tests',
  '.deckent/workspace/WORKER-GUIDE.md',
  '.deckent/settings/features-manifest.json',
  'GEMINI.md',
  'SECURITY.md',
  ...immutableHistory,
  'docs/adr/adr-g-023-agent-skill-taxonomy.md',
  'docs/MASTER-PLAN.md',
  'docs/SPRINT-LOG.md',
];

function collect(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => collect(join(path, entry.name)));
}

const failures = [];
let historyLines = 0;
for (const path of roots.flatMap((entry) => collect(join(root, entry)))) {
  const projectPath = relative(root, path).split('\\').join('/');
  const lines = readFileSync(path, 'utf8').split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (!line.includes(legacyId)) return;
    if (immutableHistory.has(projectPath)) {
      historyLines += 1;
      return;
    }
    failures.push(`${projectPath}:${index + 1}: ${legacyId} is stale; use ${canonicalId}`);
  });
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`stale ADR gate clean (${historyLines} immutable crosswalk/history lines)`);
}
