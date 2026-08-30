#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MANIFEST_PATH = join(REPO_ROOT, 'docs', 'operations', 'skills', 'manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const mode = process.argv[2] ?? '--check';
const expectedSkills = [
  'deckent-authority-bootstrap',
  'deckent-readonly-audit',
  'deckent-outcome-ordering',
  'deckent-outcome-plan',
  'deckent-parallel-execution',
  'deckent-observe',
  'deckent-recovery',
  'deckent-closure',
  'deckent-versioned-handoff',
];
const expectedTargets = ['.claude/skills', '.codex/skills'];

if (!['--check', '--write'].includes(mode)) {
  console.error('Usage: node docs/operations/tools/sync-operational-skills.mjs [--check|--write]');
  process.exit(2);
}

const errors = [];
const events = [];

if (manifest.schemaVersion !== 1) errors.push('Unsupported operational skill manifest schema');
if (manifest.realm !== 'deckent-dev-host-operator') errors.push('Unexpected skill realm');
if (manifest.source !== 'docs/operations/skills') errors.push('Unexpected canonical source');
if (JSON.stringify(manifest.skills) !== JSON.stringify(expectedSkills)) {
  errors.push('Manifest skill allowlist or order changed');
}
if (JSON.stringify(manifest.targets) !== JSON.stringify(expectedTargets)) {
  errors.push('Manifest projection targets changed');
}

function failIfErrors() {
  if (errors.length === 0) return;
  for (const error of errors) console.error('ERROR ' + error);
  process.exit(1);
}

function listFiles(root) {
  const files = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
      else errors.push('Unsupported non-file entry: ' + path);
    }
  }
  visit(root);
  return files.sort();
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function validateCanonicalSkill(sourceRoot, name) {
  const root = join(sourceRoot, name);
  const skillPath = join(root, 'SKILL.md');
  const openAiPath = join(root, 'agents', 'openai.yaml');
  if (!existsSync(skillPath)) {
    errors.push('Canonical skill is missing SKILL.md: ' + name);
    return;
  }
  const body = readFileSync(skillPath, 'utf8');
  const declaredName = body.match(/^---\nname:\s*([^\n]+)\n/m)?.[1]?.trim();
  if (declaredName !== name) errors.push('Canonical skill name mismatch: ' + name);
  if (!existsSync(openAiPath)) {
    errors.push('Canonical skill is missing agents/openai.yaml: ' + name);
    return;
  }
  const openAiBody = readFileSync(openAiPath, 'utf8');
  if (!openAiBody.includes('$' + name)) {
    errors.push('agents/openai.yaml default prompt does not name the skill: ' + name);
  }
  if (!openAiBody.includes('allow_implicit_invocation: true')) {
    errors.push('Unexpected invocation policy for operational skill: ' + name);
  }
}

function compareTrees(source, target, label) {
  if (!existsSync(target)) {
    errors.push(label + ': target is missing');
    return;
  }
  const sourceFiles = listFiles(source);
  const targetFiles = listFiles(target);
  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(targetFiles);
  for (const file of sourceFiles) {
    if (!targetSet.has(file)) errors.push(label + ': missing ' + file);
    else if (digest(join(source, file)) !== digest(join(target, file))) {
      errors.push(label + ': content drift in ' + file);
    }
  }
  for (const file of targetFiles) {
    if (!sourceSet.has(file)) errors.push(label + ': unmanaged extra file ' + file);
  }
}

function stageProjection(source, destination, targetRoot, name, target) {
  const stagingRoot = mkdtempSync(join(targetRoot, '.' + name + '-projection-'));
  const staged = join(stagingRoot, 'staged');
  const previous = join(stagingRoot, 'previous');
  cpSync(source, staged, { recursive: true, errorOnExist: true });
  compareTrees(source, staged, 'staged/' + target + '/' + name);
  return {
    destination,
    movedPrevious: false,
    installed: false,
    name,
    previous,
    staged,
    stagingRoot,
    target,
  };
}

function cleanupStaging(records) {
  for (const record of records) {
    rmSync(record.stagingRoot, { recursive: true, force: true });
  }
}

function commitProjectionTransaction(records) {
  try {
    for (const record of records) {
      if (existsSync(record.destination)) {
        renameSync(record.destination, record.previous);
        record.movedPrevious = true;
      }
      renameSync(record.staged, record.destination);
      record.installed = true;
    }
  } catch (error) {
    for (const record of [...records].reverse()) {
      if (record.installed && existsSync(record.destination)) {
        rmSync(record.destination, { recursive: true, force: true });
      }
      if (record.movedPrevious && existsSync(record.previous)) {
        renameSync(record.previous, record.destination);
      }
    }
    throw error;
  }
}

failIfErrors();

const sourceRoot = join(REPO_ROOT, manifest.source);
for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !expectedSkills.includes(entry.name)) {
    errors.push('Unmanaged canonical skill directory: ' + entry.name);
  }
}
for (const name of expectedSkills) validateCanonicalSkill(sourceRoot, name);
failIfErrors();

const stagedRecords = [];
try {
  for (const target of expectedTargets) {
    const targetRoot = join(REPO_ROOT, target);
    if (mode === '--write') mkdirSync(targetRoot, { recursive: true });
    for (const name of expectedSkills) {
      const source = join(sourceRoot, name);
      const destination = join(targetRoot, name);
      if (mode === '--write') {
        mkdirSync(dirname(destination), { recursive: true });
        stagedRecords.push(stageProjection(source, destination, targetRoot, name, target));
      } else {
        compareTrees(source, destination, target + '/' + name);
      }
    }
  }

  if (errors.length === 0 && mode === '--write') {
    commitProjectionTransaction(stagedRecords);
    for (const record of stagedRecords) {
      events.push('projected ' + record.name + ' -> ' + record.target);
    }
  }
} finally {
  cleanupStaging(stagedRecords);
}

failIfErrors();

for (const event of events) console.log(event);
console.log(
  'Operational skill projection ' + mode.slice(2) + ' passed: ' +
    expectedSkills.length + ' skills, ' + expectedTargets.length + ' hosts.',
);
