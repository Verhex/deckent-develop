#!/usr/bin/env node
// scripts/lint-rule-vocabulary.mjs
//
// Gate: scans every .deckent/agents/*/agent.json + .deckent/skills/*/manifest.json for
// `activation.rules`/`activation.exclude` conditions that check `domains.$contains <word>`
// (or `domains.$in [...]`), and flags any word that can NEVER fire — i.e. a word that is
// neither a real path-segment `detectDomains` (src/core/intent-classifier.ts) can emit, nor
// covered by `DOMAIN_ALIAS_GROUPS` (src/core/routing-engine.ts).
//
// Root cause (born-589, sprint-agent-skill-prompt-audit-2026-07-10.md §0/B/C): detectDomains
// emits path-SEGMENT names (orchestra, core, cli, dashboard, connectors, docker, mcp, …); a
// number of built-in agent/skill activation rules check a DIFFERENT vocabulary that never
// matches any segment detectDomains can emit — e.g. sh-portability's rule checks
// `orchestration`, but the real directory is `orchestra`.
//
// DOMAIN_ALIAS_GROUPS below MIRRORS the identically-named export in src/core/routing-engine.ts
// (this script does not import compiled TS output, matching every other scripts/lint-*.mjs in
// this repo) — update BOTH when either changes.
//
// A handful of pre-existing rules have NO real segment counterpart at all (the concept is a
// narrow sub-topic inside a broad, multi-purpose directory, or genuinely cross-cutting/VCS/
// tooling-level with no src/ home) — those are catalogued in KNOWN_ORPHAN_RULES with a reason;
// they are reported but do NOT fail the gate. Fixing them requires a manifest-CONTENT change
// (rewriting the rule condition itself), which is out of this script's scope — see the reason
// field on each entry. Any word NOT in the real-segment set, NOT in the alias groups, and NOT in
// this documented baseline is treated as NEW drift and fails the gate.
//
// Exits 1 when a NEW (non-baselined) dead word is found. Wired into `npm run lint` via
// lint:gates.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Alias groups (mirrors DOMAIN_ALIAS_GROUPS in src/core/routing-engine.ts) ───────────────

const DOMAIN_ALIAS_GROUPS = [
  ['orchestra', 'orchestration'],
  ['dashboard', 'frontend', 'accessibility', 'css'],
  ['docker', 'infrastructure'],
  ['mcp', 'rpc'],
];

// ── Known, pre-existing orphan rules (manifest-content fix, not a vocabulary fix) ──────────
//
// Each entry is keyed by the exact manifest file + the exact dead word so a DIFFERENT, new
// dead word in the SAME file (or a re-used word in a different file) is never silently masked.

const KNOWN_ORPHAN_RULES = [
  {
    file: '.deckent/agents/data-engineer/agent.json',
    word: 'database',
    reason: "deliberate cross-project reach (Yasa-#2): foreign projects with a real src/database|db|models " +
      "dir must keep firing; no in-repo segment exists BY DESIGN. Restored 2026-07-10 after the plain " +
      "rewrite left data-engineer universally dominated by migration-specialist (migration@6+3 < 10).",
  },
  {
    file: '.deckent/agents/data-engineer/agent.json',
    word: 'db',
    reason: 'same cross-project-reach family as the database entry above.',
  },
  {
    file: '.deckent/agents/data-engineer/agent.json',
    word: 'models',
    reason: 'same cross-project-reach family as the database entry above.',
  },
  {
    file: '.deckent/agents/data-engineer/agent.json',
    word: 'database',
    reason:
      "data-engineer's own triggerScopes (src/db/, src/models/, prisma/, drizzle/) don't exist " +
      'in this project; its real DB code lives in src/core/, which hosts many unrelated ' +
      "concerns too (config, memory, routing, types) — no single real segment narrowly means " +
      "'database'. Needs a manifest-content fix (rule rewrite), not a vocabulary alias.",
  },
  {
    file: '.deckent/skills/database-migration/manifest.json',
    word: 'database',
    reason: 'same root cause as data-engineer above.',
  },
  {
    file: '.deckent/agents/architecture-planner/agent.json',
    word: 'architecture',
    reason:
      "architecture-planning work is cross-cutting by nature (spans src/core/, src/orchestra/, " +
      "and beyond) — no real segment narrowly means 'architecture'.",
  },
  {
    file: '.deckent/skills/onboarding-ux/manifest.json',
    word: 'onboarding',
    reason:
      'onboarding wizard code is a narrow subset of the broad src/cli/ directory, not its ' +
      "whole purpose — aliasing 'onboarding'→'cli' would fire on every unrelated CLI task.",
  },
  {
    file: '.deckent/skills/provider-cli-matrix/manifest.json',
    word: 'provider-cli',
    reason:
      'provider-CLI arg-building is a narrow subset of the broad src/providers/ directory — ' +
      'aliasing would fire on every unrelated provider-adapter task.',
  },
  {
    file: '.deckent/skills/git-expert/manifest.json',
    word: 'git',
    reason:
      'git workflow is a cross-cutting VCS concern with no corresponding src/ directory in ' +
      'this project (the manifest already declares stackDetection.files/commands for this).',
  },
  {
    file: '.deckent/skills/monorepo-expert/manifest.json',
    word: 'monorepo',
    reason: "this project isn't a Turborepo/Nx monorepo — no real segment ever means 'monorepo' here.",
  },
  {
    file: '.deckent/skills/code-simplifier/manifest.json',
    word: 'simplification',
    reason:
      'cross-cutting code-quality concept, not a path segment; the skill\'s OTHER rule ' +
      '(intent.primary=refactor@8) already exceeds minScore(5) alone, so this is harmless ' +
      'dead weight, not a blocking gap.',
  },
  {
    file: '.deckent/skills/ink-tui/manifest.json',
    word: 'terminal-ui',
    reason: 'same root cause as terminal-ux-engineer above (would stack via the shared cli domain).',
  },
];

// ── Category-based structural exemption ────────────────────────────────────────────────────
//
// A skill with category 'language'/'framework' activates primarily via stackDetection/
// project-stack matching (selectBestSkills' stackBonus in routing-engine.ts) — its `domains`
// rule (if any) checks a language/framework NAME, which is never a path segment in ANY
// project by definition (e.g. 'typescript', 'python', 'react', 'graphql'). This is a
// structurally different, already-live activation path, not a vocabulary bug.

const EXEMPT_SKILL_CATEGORIES = new Set(['language', 'framework']);

// ── Real-segment discovery ─────────────────────────────────────────────────────────────────
//
// Mechanically derived from the actual repo tree (never hand-curated) so this stays honest as
// the codebase evolves: every top-level directory name under src/, tests/, test/, plus every
// non-hidden, non-build-artifact top-level directory at the repo root.

const IGNORED_ROOT_DIRS = new Set(['node_modules', 'dist', 'coverage']);

function listDirNames(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function computeRealSegments() {
  const segments = new Set();
  for (const name of listDirNames(join(ROOT, 'src'))) segments.add(name);
  for (const name of listDirNames(join(ROOT, 'tests'))) segments.add(name);
  for (const name of listDirNames(join(ROOT, 'test'))) segments.add(name);
  for (const name of listDirNames(ROOT)) {
    if (!name.startsWith('.') && !IGNORED_ROOT_DIRS.has(name)) segments.add(name);
  }
  return segments;
}

function buildAliasIndex(groups) {
  const index = new Map();
  for (const group of groups) {
    for (const word of group) {
      const siblings = index.get(word) ?? new Set();
      for (const sibling of group) {
        if (sibling !== word) siblings.add(sibling);
      }
      index.set(word, siblings);
    }
  }
  return index;
}

// ── Activation scanning ─────────────────────────────────────────────────────────────────────

/** Recursively walks an activation.rules/exclude tree and collects every
 *  `domains.$contains`/`domains.$in` literal word it finds (handles $and/$or nesting for free,
 *  since it recurses into every object value generically). */
function extractDomainWords(node, words = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) extractDomainWords(item, words);
    return words;
  }
  if (node && typeof node === 'object') {
    if (node.domains && typeof node.domains === 'object') {
      const d = node.domains;
      if (typeof d.$contains === 'string') words.add(d.$contains);
      if (Array.isArray(d.$in)) {
        for (const w of d.$in) if (typeof w === 'string') words.add(w);
      }
    }
    for (const key of Object.keys(node)) extractDomainWords(node[key], words);
  }
  return words;
}

// born-601 $or-collapse deseni (advisor 2026-07-10): builtin manifest'ler yabancı
// projelere gider — bu-repo'da ölü bir kelime, gerçek `src/messaging/` dizini olan
// bir projede BUGÜN ateşler. Bu yüzden collapse ölü-kelimeyi SİLMEZ, gerçek-kardeşli
// tek `$or` kuralında tutar. Böyle bir kelime borç değil, SANCTIONED cross-project
// reach'tir: aynı `$or` içinde en az bir kardeş-dal gerçek-segment/alias'la
// çözülüyorsa, kalan dalların kelimeleri bu kümeye düşer.
function extractCrossReachWords(node, isResolvable, crossReach = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) extractCrossReachWords(item, isResolvable, crossReach);
    return crossReach;
  }
  if (node && typeof node === 'object') {
    if (Array.isArray(node.$or)) {
      const branchWords = node.$or.map((branch) => [...extractDomainWords(branch)]);
      const hasResolvableBranch = branchWords.some((ws) => ws.some((w) => isResolvable(w)));
      if (hasResolvableBranch) {
        for (const ws of branchWords) for (const w of ws) if (!isResolvable(w)) crossReach.add(w);
      }
    }
    for (const key of Object.keys(node)) extractCrossReachWords(node[key], isResolvable, crossReach);
  }
  return crossReach;
}

function scanManifests() {
  const realSegments = computeRealSegments();
  const aliasIndex = buildAliasIndex(DOMAIN_ALIAS_GROUPS);
  const orphanKey = (file, word) => `${file}::${word}`;
  const orphansByKey = new Map(KNOWN_ORPHAN_RULES.map((o) => [orphanKey(o.file, o.word), o]));

  const revived = [];
  const crossReach = [];
  const knownDebt = [];
  const failures = [];

  function checkManifest(relPath, data) {
    const activation = data.activation;
    if (!activation) return;
    const words = extractDomainWords(activation.rules ?? []);
    extractDomainWords(activation.exclude ?? [], words);
    const isResolvable = (w) => realSegments.has(w)
      || [...(aliasIndex.get(w) ?? [])].some((s) => realSegments.has(s));
    const crossReachWords = extractCrossReachWords(activation.rules ?? [], isResolvable);

    for (const word of words) {
      if (realSegments.has(word)) continue;

      const siblings = aliasIndex.get(word);
      if (siblings && [...siblings].some((s) => realSegments.has(s))) {
        revived.push({ file: relPath, word });
        continue;
      }

      if (crossReachWords.has(word)) {
        crossReach.push({ file: relPath, word });
        continue;
      }

      const orphan = orphansByKey.get(orphanKey(relPath, word));
      if (orphan) {
        knownDebt.push({ file: relPath, word, reason: orphan.reason });
        continue;
      }

      failures.push({ file: relPath, word });
    }
  }

  const agentsDir = join(ROOT, '.deckent', 'agents');
  for (const id of listDirNames(agentsDir)) {
    const file = join(agentsDir, id, 'agent.json');
    if (!existsSync(file)) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue; // malformed manifest — a different lint's problem (schema validation)
    }
    checkManifest(`.deckent/agents/${id}/agent.json`, data);
  }

  const skillsDir = join(ROOT, '.deckent', 'skills');
  for (const id of listDirNames(skillsDir)) {
    const file = join(skillsDir, id, 'manifest.json');
    if (!existsSync(file)) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (EXEMPT_SKILL_CATEGORIES.has(data.category)) continue;
    checkManifest(`.deckent/skills/${id}/manifest.json`, data);
  }

  return { revived, crossReach, knownDebt, failures };
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────

const { revived, crossReach, knownDebt, failures } = scanManifests();

console.log('Domain-vocabulary rule lint (born-589)');
console.log(`  Revived via alias  : ${revived.length}`);
for (const r of revived) console.log(`    - ${r.file} :: '${r.word}'`);
console.log(`  Cross-reach (sanctioned $or, born-601): ${crossReach.length}`);
for (const c of crossReach) console.log(`    - ${c.file} :: '${c.word}'`);
console.log(`  Known debt (Task 4): ${knownDebt.length}`);
for (const d of knownDebt) console.log(`    - ${d.file} :: '${d.word}' — ${d.reason}`);

if (failures.length > 0) {
  console.error(`  NEW dead domain word(s): ${failures.length}`);
  for (const f of failures) {
    console.error(`    - ${f.file} :: '${f.word}' — not a real segment, not aliased, not in the known-orphan baseline`);
  }
  console.error(
    '  Fix: add a DOMAIN_ALIAS_GROUPS entry (src/core/routing-engine.ts + mirror here) if this ' +
      'word has a genuine, precise real-segment counterpart, or a KNOWN_ORPHAN_RULES entry here ' +
      'with a reason if it needs a manifest-content fix instead.',
  );
  process.exit(1);
}

console.log('  0 new dead domain words. OK.');
process.exit(0);
