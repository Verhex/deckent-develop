#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, 'docs', 'design', 'skills', 'manifest.json'), 'utf8'),
);
const suite = new Set(manifest.skills);
const corpus = JSON.parse(
  readFileSync(join(root, 'docs', 'design', 'skill-evals', 'cases.json'), 'utf8'),
);
const errors = [];
const ids = new Set();
const primaryCoverage = new Set();

if (corpus.schemaVersion !== 1) errors.push('Unsupported eval schema');
if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) errors.push('No eval cases');

for (const entry of corpus.cases ?? []) {
  if (!entry.id || ids.has(entry.id)) errors.push('Missing or duplicate case id: ' + entry.id);
  ids.add(entry.id);
  if (!entry.prompt || entry.prompt.length < 20) errors.push(entry.id + ': prompt is too weak');
  if (!Array.isArray(entry.invariants) || entry.invariants.length === 0) {
    errors.push(entry.id + ': no observable invariants');
  }

  const primary = entry.expected?.primary;
  const secondary = entry.expected?.secondary ?? [];
  const forbidden = entry.expected?.forbidden ?? [];
  if (primary !== null && !suite.has(primary)) errors.push(entry.id + ': unknown primary ' + primary);
  if (primary) primaryCoverage.add(primary);
  for (const name of [...secondary, ...forbidden]) {
    if (!suite.has(name)) errors.push(entry.id + ': unknown skill ' + name);
  }
  if (primary && forbidden.includes(primary)) errors.push(entry.id + ': primary is forbidden');
  for (const name of secondary) {
    if (forbidden.includes(name)) errors.push(entry.id + ': secondary is forbidden: ' + name);
  }
}

for (const name of manifest.skills) {
  if (name === 'deckent-design-dna') continue;
  if (!primaryCoverage.has(name)) errors.push('No positive primary routing case for ' + name);
}

if (errors.length > 0) {
  for (const error of errors) console.error('ERROR ' + error);
  process.exit(1);
}

console.log(
  'Design skill eval corpus valid: ' + corpus.cases.length +
  ' cases, ' + primaryCoverage.size + ' primary skills covered.',
);
console.log('Note: this validates the corpus contract, not model behavior; run cases independently.');
