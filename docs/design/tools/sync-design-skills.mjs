#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MANIFEST_PATH = join(REPO_ROOT, 'docs', 'design', 'skills', 'manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const mode = process.argv[2] ?? '--check';

if (!['--check', '--write'].includes(mode)) {
  console.error('Usage: node docs/design/tools/sync-design-skills.mjs [--check|--write]');
  process.exit(2);
}

if (manifest.schemaVersion !== 1) {
  throw new Error('Unsupported design skill manifest schema: ' + manifest.schemaVersion);
}

const sourceRoot = join(REPO_ROOT, manifest.source);
const errors = [];
const events = [];
const allowedTargets = new Set(['.claude/skills', '.codex/skills']);

if (manifest.source !== 'docs/design/skills') {
  errors.push('Manifest source must remain docs/design/skills');
}
if (!Array.isArray(manifest.skills) || !Array.isArray(manifest.targets) || !Array.isArray(manifest.retired)) {
  errors.push('Manifest skills, targets and retired values must be arrays');
}
for (const name of [...(manifest.skills ?? []), ...(manifest.retired ?? [])]) {
  if (!/^[a-z0-9-]+$/.test(name)) errors.push('Unsafe skill name: ' + String(name));
}
for (const target of manifest.targets ?? []) {
  if (!allowedTargets.has(target)) errors.push('Unapproved projection target: ' + String(target));
}
if (new Set(manifest.skills).size !== manifest.skills.length) errors.push('Duplicate active skill');
if (new Set(manifest.retired).size !== manifest.retired.length) errors.push('Duplicate retired skill');
for (const name of manifest.retired) {
  if (manifest.skills.includes(name)) errors.push('Skill is both active and retired: ' + name);
}

function failIfErrors() {
  if (errors.length === 0) return;
  for (const error of errors) console.error('ERROR ' + error);
  process.exit(1);
}

failIfErrors();

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

function validateCanonicalSkill(name) {
  const skillRoot = join(sourceRoot, name);
  const skillFile = join(skillRoot, 'SKILL.md');
  if (!existsSync(skillFile)) {
    errors.push('Canonical skill is missing SKILL.md: ' + name);
    return;
  }
  const body = readFileSync(skillFile, 'utf8');
  const declaredName = body.match(/^---\nname:\s*([^\n]+)\n/m)?.[1]?.trim();
  if (declaredName !== name) {
    errors.push('Canonical skill name mismatch: ' + name + ' declares ' + String(declaredName));
  }
  const openAiYaml = join(skillRoot, 'agents', 'openai.yaml');
  if (!existsSync(openAiYaml)) {
    errors.push('Canonical skill is missing agents/openai.yaml: ' + name);
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
    if (!targetSet.has(file)) {
      errors.push(label + ': missing ' + file);
    } else if (digest(join(source, file)) !== digest(join(target, file))) {
      errors.push(label + ': content drift in ' + file);
    }
  }
  for (const file of targetFiles) {
    if (!sourceSet.has(file)) errors.push(label + ': unmanaged extra file ' + file);
  }
}

for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !manifest.skills.includes(entry.name)) {
    errors.push('Unmanaged canonical skill directory: ' + entry.name);
  }
}
for (const name of manifest.skills) validateCanonicalSkill(name);
failIfErrors();

for (const target of manifest.targets) {
  const targetRoot = join(REPO_ROOT, target);
  if (mode === '--write') mkdirSync(targetRoot, { recursive: true });

  for (const name of manifest.skills) {
    const source = join(sourceRoot, name);
    const destination = join(targetRoot, name);
    if (mode === '--write') {
      rmSync(destination, { recursive: true, force: true });
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(source, destination, { recursive: true });
      events.push('projected ' + name + ' -> ' + target);
    } else {
      compareTrees(source, destination, target + '/' + name);
    }
  }

  for (const name of manifest.retired) {
    const retiredPath = join(targetRoot, name);
    if (mode === '--write' && existsSync(retiredPath)) {
      rmSync(retiredPath, { recursive: true, force: true });
      events.push('removed retired ' + target + '/' + name);
    } else if (mode === '--check' && existsSync(retiredPath)) {
      errors.push('Retired skill still exists: ' + target + '/' + name);
    }
  }
}

failIfErrors();

if (mode === '--write') {
  for (const event of events) console.log(event);
}
console.log(
  'Design skill projection ' + mode.slice(2) + ' passed: ' +
  manifest.skills.length + ' skills, ' + manifest.targets.length + ' hosts.',
);
