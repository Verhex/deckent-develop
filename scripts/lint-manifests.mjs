#!/usr/bin/env node
// scripts/lint-manifests.mjs
//
// born-641 class-fix, layer 2 (406-003 MANIFEST-SCHEMA-LINT). Layer 1
// (src/core/skill-pool.ts / agent-pool.ts) normalizes missing OPTIONAL manifest
// fields at pool-load time so routing/selector/gate never see `undefined`. This
// script is the complementary CI-facing gate: schema-checks every manifest across
// BOTH trees up front, so a genuinely malformed manifest (missing a hard-required
// field, or a wrong-typed optional one) is caught before it ever reaches a running
// sprint's pool-load fail-soft skip+warn path.
//
// The "two trees":
//   - skill tree: .deckent/skills/*/manifest.json + src/core/builtins/skills/*/manifest.json
//   - agent tree: .deckent/agents/*/agent.json     + src/core/builtins/agents/*/agent.json
//     (skips `archive/` and `temp-*/` subdirs — runtime/ephemeral, not catalog entries)
// `.tasks/agents/` (TEMP_AGENTS_DIR) is intentionally NOT scanned — it is
// gitignored, per-sprint runtime state, not a committed manifest catalog.
//
// Report-only — there is no --fix (passing it is a hard error, not a silent
// no-op, so "report-only" stays a contract rather than an accidental omission).
//
// Validation mirrors (does NOT import — this is a dependency-free .mjs script,
// and `npm run lint` never runs `npm run build` first, so a `dist/` build cannot
// be assumed available at lint time) the exact required/type rules already
// enforced by SkillPoolManager.validateSkillDefinition /
// AgentPoolManager.validateAgentDefinition (src/core/skill-pool.ts /
// agent-pool.ts): only `id`+`name` are hard-required; every other field is
// type-checked ONLY IF present. This keeps the lint gate's notion of "valid"
// identical to the runtime pool loader's — the gate never rejects a manifest the
// pool would happily load, and vice versa. Kept in sync by hand, same
// duplication rationale already documented in those two files (each pool
// manager is outside the other's write/read scope; this script is outside both
// trees' TS compile boundary).
//
// Known, deliberate scope limit: `model` (skill) / `preferredModel` (agent)
// enum-membership against ALL_MODELS is NOT checked here. ALL_MODELS
// (src/core/task-types.ts) is dynamically derived from
// `modelRegistry.getAllModelIds()`, not a static list — mirroring it here would
// either require importing compiled runtime code (unavailable at lint time) or
// hand-copying a list that silently drifts out of sync with the real registry.
// Presence is still type-checked (must be a non-empty string); real
// enum-membership enforcement already happens at pool-load time via the actual
// TS validators.
//
// Exit: 0 = clean, 1 = violations found, 2 = scan/usage error.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

if (process.argv.includes('--fix')) {
  console.error('[lint-manifests] --fix is not supported — this gate is report-only by design.');
  console.error('[lint-manifests] Fix the listed manifest(s) by hand and re-run.');
  process.exit(2);
}

// ── Constants (mirrors skill-types.ts / agent-types.ts) ─────────────────────

const VALID_SKILL_CATEGORIES = ['language', 'framework', 'tool', 'domain', 'workflow'];
const VALID_PROMPT_POSITIONS = ['prepend', 'append', 'section'];
const VALID_AGENT_SOURCES = ['builtin', 'user', 'learned'];

// Debt ledger (2026-08-26): 30 pre-existing skill manifests lack a canonical
// routing profile. This ceiling is decrease-only: migrations may lower it, but
// a new profileless manifest makes the gate fail instead of resetting the debt.
const PROFILELESS_SKILL_BASELINE = 30;
const VALID_WORK_TYPES = ['build', 'fix', 'refactor', 'document', 'review', 'configure', 'migrate', 'analyze'];
const VALID_PROFICIENCIES = ['primary', 'secondary', 'able'];
const VALID_DELIVERABLES = ['code-src', 'code-test', 'doc', 'config', 'workflow', 'migration', 'manifest'];

// ── Manifest tree discovery ──────────────────────────────────────────────────

/**
 * List `{ id, path }` entries for every `<dir>/<subdir>/<filename>` that exists.
 * Skips `archive` and `temp-*` subdirectories (runtime/ephemeral, not catalog
 * entries — mirrors AgentPoolManager._loadFromDir's own skip rules).
 * @param {string} dir
 * @param {string} filename
 * @returns {Array<{ id: string, path: string }>}
 */
function discoverManifests(dir, filename) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive' || entry.name.startsWith('temp-')) continue;
    const manifestPath = join(dir, entry.name, filename);
    if (existsSync(manifestPath)) found.push({ id: entry.name, path: manifestPath });
  }
  return found;
}

const skillTreeDirs = [
  join(REPO_ROOT, '.deckent', 'skills'),
  join(REPO_ROOT, 'src', 'core', 'builtins', 'skills'),
];
const agentTreeDirs = [
  join(REPO_ROOT, '.deckent', 'agents'),
  join(REPO_ROOT, 'src', 'core', 'builtins', 'agents'),
];

const skillManifests = skillTreeDirs.flatMap((d) => discoverManifests(d, 'manifest.json'));
const agentManifests = agentTreeDirs.flatMap((d) => discoverManifests(d, 'agent.json'));

// ── Shared helpers ───────────────────────────────────────────────────────────

/** @param {unknown} v @returns {v is string[]} */
function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Mirrors validateActivationField (skill-pool.ts / agent-pool.ts) structurally
 * — same shape as ActivationConfig, checked without zod (no new runtime
 * dependency needed for a plain shape check).
 * @param {unknown} activation
 * @param {string[]} errors
 */
function validateActivation(activation, errors) {
  if (activation === undefined) return;
  if (!activation || typeof activation !== 'object' || Array.isArray(activation)) {
    errors.push('"activation" must be an object');
    return;
  }
  const a = /** @type {Record<string, unknown>} */ (activation);
  if (!Array.isArray(a.rules)) {
    errors.push('"activation.rules" must be an array');
  } else {
    a.rules.forEach((rule, i) => {
      const r = /** @type {Record<string, unknown>} */ (rule ?? {});
      if (!rule || typeof rule !== 'object' || typeof r.when !== 'object' || r.when === null || Array.isArray(r.when)) {
        errors.push(`"activation.rules[${i}].when" must be an object`);
      }
      if (typeof r.score !== 'number') {
        errors.push(`"activation.rules[${i}].score" must be a number`);
      }
    });
  }
  if (!Array.isArray(a.exclude)) {
    errors.push('"activation.exclude" must be an array');
  } else {
    a.exclude.forEach((rule, i) => {
      const r = /** @type {Record<string, unknown>} */ (rule ?? {});
      if (!rule || typeof rule !== 'object' || typeof r.when !== 'object' || r.when === null || Array.isArray(r.when)) {
        errors.push(`"activation.exclude[${i}].when" must be an object`);
      }
    });
  }
  if (typeof a.minScore !== 'number') {
    errors.push('"activation.minScore" must be a number');
  }
}

/**
 * @param {unknown} stats
 * @param {string[]} errors
 */
function validateStats(stats, errors) {
  if (stats === undefined) return;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    errors.push('"stats" must be an object');
    return;
  }
  const s = /** @type {Record<string, unknown>} */ (stats);
  if (s.totalUses !== undefined && typeof s.totalUses !== 'number') errors.push('"stats.totalUses" must be a number');
  if (s.successRate !== undefined && typeof s.successRate !== 'number') errors.push('"stats.successRate" must be a number');
  if (s.avgCoverage !== undefined && typeof s.avgCoverage !== 'number') errors.push('"stats.avgCoverage" must be a number');
  if (s.lastUsedInSprint !== undefined && typeof s.lastUsedInSprint !== 'string') errors.push('"stats.lastUsedInSprint" must be a string');
}

// ── Skill manifest validation (mirrors SkillPoolManager.validateSkillDefinition) ──

/**
 * @param {unknown} obj
 * @returns {string[]}
 */
function validateSkillManifest(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return ['manifest must be a non-null object'];
  }
  const o = /** @type {Record<string, unknown>} */ (obj);
  const errors = [];

  for (const field of ['id', 'name']) {
    if (typeof o[field] !== 'string' || !String(o[field]).trim()) {
      errors.push(`"${field}" must be a non-empty string`);
    }
  }

  for (const field of ['version', 'description', 'entrypoint']) {
    if (o[field] !== undefined && typeof o[field] !== 'string') {
      errors.push(`"${field}" must be a string`);
    }
  }

  if (o.category !== undefined && !VALID_SKILL_CATEGORIES.includes(o.category)) {
    errors.push(`"category" must be one of: ${VALID_SKILL_CATEGORIES.join(', ')}`);
  }

  // See file header: model enum-membership intentionally not checked (dynamic registry).
  if (o.model !== undefined && (typeof o.model !== 'string' || !o.model.trim())) {
    errors.push('"model" must be a non-empty string');
  }

  if (o.priority !== undefined && typeof o.priority !== 'number') {
    errors.push('"priority" must be a number');
  }

  if (o.enabled !== undefined && typeof o.enabled !== 'boolean') {
    errors.push('"enabled" must be a boolean');
  }

  for (const field of ['triggers', 'composableWith']) {
    if (o[field] !== undefined && !isStringArray(o[field])) {
      errors.push(`"${field}" must be an array of strings`);
    }
  }

  if (o.stackDetection !== undefined) {
    if (!o.stackDetection || typeof o.stackDetection !== 'object' || Array.isArray(o.stackDetection)) {
      errors.push('"stackDetection" must be an object');
    } else {
      const sd = /** @type {Record<string, unknown>} */ (o.stackDetection);
      for (const field of ['files', 'dependencies', 'commands']) {
        if (sd[field] !== undefined && !Array.isArray(sd[field])) {
          errors.push(`"stackDetection.${field}" must be an array`);
        }
      }
    }
  }

  if (o.promptInjection !== undefined) {
    if (!o.promptInjection || typeof o.promptInjection !== 'object' || Array.isArray(o.promptInjection)) {
      errors.push('"promptInjection" must be an object');
    } else {
      const pi = /** @type {Record<string, unknown>} */ (o.promptInjection);
      if (pi.position !== undefined && !VALID_PROMPT_POSITIONS.includes(pi.position)) {
        errors.push(`"promptInjection.position" must be one of: ${VALID_PROMPT_POSITIONS.join(', ')}`);
      }
      if (pi.maxTokens !== undefined && typeof pi.maxTokens !== 'number') {
        errors.push('"promptInjection.maxTokens" must be a number');
      }
    }
  }

  validateStats(o.stats, errors);
  validateActivation(o.activation, errors);

  if (o.profile !== undefined && o.profile !== null) {
    validateRoutingProfile(o.profile, errors);
  }

  return errors;
}

/**
 * Dependency-free mirror of the canonical V3 profile's fail-closed shape.
 * @param {unknown} profile
 * @param {string[]} errors
 */
function validateRoutingProfile(profile, errors) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    errors.push('"profile" must be a canonical V3 routing profile object');
    return;
  }
  const p = /** @type {Record<string, unknown>} */ (profile);
  if (p.profileVersion !== 3) errors.push('"profile.profileVersion" must be 3');
  for (const field of ['workTypes', 'domains', 'expertise', 'deliverables']) {
    if (!Array.isArray(p[field])) errors.push(`"profile.${field}" must be an array`);
  }
  if (Array.isArray(p.workTypes) && p.workTypes.length === 0) {
    errors.push('"profile.workTypes" must not be empty');
  }
  if (Array.isArray(p.workTypes)) {
    p.workTypes.forEach((entry, index) => {
      const item = /** @type {Record<string, unknown>} */ (entry ?? {});
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || !VALID_WORK_TYPES.includes(item.type)
        || !VALID_PROFICIENCIES.includes(item.proficiency)) {
        errors.push(`"profile.workTypes[${index}]" must contain a valid type and proficiency`);
      }
    });
  }
  if (Array.isArray(p.domains)) {
    p.domains.forEach((entry, index) => {
      const item = /** @type {Record<string, unknown>} */ (entry ?? {});
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || typeof item.id !== 'string' || item.id.trim() === ''
        || !VALID_PROFICIENCIES.includes(item.proficiency)) {
        errors.push(`"profile.domains[${index}]" must contain a non-empty id and valid proficiency`);
      }
    });
  }
  if (Array.isArray(p.expertise) && (p.expertise.length === 0 || !isStringArray(p.expertise))) {
    errors.push('"profile.expertise" must be a non-empty array of strings');
  }
  if (Array.isArray(p.deliverables) && (p.deliverables.length === 0 || !isStringArray(p.deliverables))) {
    errors.push('"profile.deliverables" must be a non-empty array of strings');
  }
  if (Array.isArray(p.deliverables) && p.deliverables.some((item) => !VALID_DELIVERABLES.includes(item))) {
    errors.push('"profile.deliverables" contains an unsupported deliverable');
  }
}

// ── Agent manifest validation (mirrors AgentPoolManager.validateAgentDefinition) ──

/**
 * @param {unknown} obj
 * @returns {string[]}
 */
function validateAgentManifest(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return ['manifest must be a non-null object'];
  }
  const o = /** @type {Record<string, unknown>} */ (obj);
  const errors = [];

  for (const field of ['id', 'name']) {
    if (typeof o[field] !== 'string' || !String(o[field]).trim()) {
      errors.push(`"${field}" must be a non-empty string`);
    }
  }

  for (const field of ['description', 'systemPrompt']) {
    if (o[field] !== undefined && typeof o[field] !== 'string') {
      errors.push(`"${field}" must be a string`);
    }
  }

  // See file header: preferredModel enum-membership intentionally not checked (dynamic registry).
  if (o.preferredModel !== undefined && (typeof o.preferredModel !== 'string' || !o.preferredModel.trim())) {
    errors.push('"preferredModel" must be a non-empty string');
  }

  if (o.source !== undefined && !VALID_AGENT_SOURCES.includes(o.source)) {
    errors.push(`"source" must be one of: ${VALID_AGENT_SOURCES.join(', ')}`);
  }

  if (o.effortMultiplier !== undefined) {
    if (typeof o.effortMultiplier !== 'number') {
      errors.push('"effortMultiplier" must be a number');
    } else if (o.effortMultiplier < 0.1 || o.effortMultiplier > 3.0) {
      errors.push('"effortMultiplier" must be between 0.1 and 3.0');
    }
  }

  for (const field of ['persistent', 'enabled']) {
    if (o[field] !== undefined && typeof o[field] !== 'boolean') {
      errors.push(`"${field}" must be a boolean`);
    }
  }

  for (const field of ['expertise', 'allowedTools', 'deniedTools', 'triggerKeywords', 'triggerScopes', 'triggerFilePatterns']) {
    if (o[field] !== undefined && !isStringArray(o[field])) {
      errors.push(`"${field}" must be an array of strings`);
    }
  }

  validateStats(o.stats, errors);
  validateActivation(o.activation, errors);

  return errors;
}

// ── Scan ──────────────────────────────────────────────────────────────────────

/** @type {Array<{ tree: string, id: string, path: string, errors: string[] }>} */
const violations = [];
let profilelessSkillCount = 0;

/**
 * @param {Array<{ id: string, path: string }>} manifests
 * @param {(obj: unknown) => string[]} validator
 * @param {string} treeLabel
 */
function scanTree(manifests, validator, treeLabel) {
  for (const { id, path } of manifests) {
    const relPath = relative(REPO_ROOT, path);
    let raw;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      violations.push({ tree: treeLabel, id, path: relPath, errors: [`invalid JSON: ${err.message}`] });
      continue;
    }
    const errors = validator(raw);
    if (treeLabel === 'skill' && raw && typeof raw === 'object'
      && !Array.isArray(raw) && (raw.profile === undefined || raw.profile === null)) {
      profilelessSkillCount += 1;
    }
    if (errors.length > 0) {
      violations.push({ tree: treeLabel, id, path: relPath, errors });
    }
  }
}

scanTree(skillManifests, validateSkillManifest, 'skill');
scanTree(agentManifests, validateAgentManifest, 'agent');

if (profilelessSkillCount > PROFILELESS_SKILL_BASELINE) {
  violations.push({
    tree: 'skill',
    id: 'profileless-baseline',
    path: '(skill manifest catalog)',
    errors: [
      `${profilelessSkillCount} profileless manifests exceed the decrease-only baseline of ${PROFILELESS_SKILL_BASELINE}`,
    ],
  });
}

// ── Report ────────────────────────────────────────────────────────────────────

const W = 72;
const line = '─'.repeat(W);

console.log('');
console.log('┌' + '─'.repeat(W) + '┐');
console.log('│' + ' Manifest Schema Lint (gate)'.padEnd(W) + '│');
console.log('└' + '─'.repeat(W) + '┘');
console.log('');
console.log(`  Skill manifests scanned : ${skillManifests.length}`);
console.log(`  Agent manifests scanned : ${agentManifests.length}`);
console.log(`  Profileless skill debt  : ${profilelessSkillCount}/${PROFILELESS_SKILL_BASELINE} maximum`);
console.log(`  Violations              : ${violations.length}`);
console.log('');
console.log(line);

if (violations.length === 0) {
  console.log('  ✓ No schema violations found across either tree.');
} else {
  console.log(`  Schema violations — ${violations.length} manifest(s):\n`);
  for (const v of violations) {
    console.log(`  [${v.tree}] ${v.path} (id: ${v.id})`);
    for (const err of v.errors) {
      console.log(`    - ${err}`);
    }
    console.log('');
  }
}

console.log(line);
if (violations.length > 0) {
  console.log('  ✗ GATE FAIL — fix the listed manifest(s) by hand (no --fix).');
} else {
  console.log('  ✓ Manifest schema gate clean.');
}
console.log(line);
console.log('');

process.exit(violations.length > 0 ? 1 : 0);
