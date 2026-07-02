#!/usr/bin/env node
/**
 * Feature Manifest Sync — Sprint 150 Task 029
 *
 * Scans src/ tree and categorizes Deckent features by activity level:
 *   active      — exported + imported by 2+ files
 *   lightly_used — exported + imported by 1 file
 *   dormant     — file exists but zero external imports
 *   dead        — marked @deprecated or file deleted from manifest
 *
 * Outputs: .deckent/settings/features-manifest.json (auto-generated, runtime-consumable)
 *
 * Usage:
 *   node scripts/sync-manifest.mjs [--root <path>] [--dry-run] [--json]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve, relative, basename, extname } from 'node:path';

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const outputJson = args.includes('--json');
const rootIdx = args.indexOf('--root');
const projectRoot = rootIdx !== -1 && args[rootIdx + 1]
  ? resolve(args[rootIdx + 1])
  : process.cwd();

// ─── Feature definitions ───────────────────────────────────────────────────
// Each feature maps to one or more source files and has categorization hints.
const FEATURE_DEFINITIONS = [
  // Core orchestration
  { id: 'sprint-controller', label: 'Sprint Controller — Core Orchestrator', files: ['src/orchestra/sprint-controller.ts', 'src/orchestra/sprint-phases.ts', 'src/orchestra/sprint-lifecycle.ts'], description: 'Central orchestrator for PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP lifecycle.' },
  { id: 'task-builder', label: 'Task Builder — Worker Prompt Builder + Directive Parser', files: ['src/orchestra/task-builder.ts'], description: 'Builds worker prompts, parses DIRECTIVES scope/model/effort/skills/agent overrides.' },
  { id: 'result-evaluator', label: 'Result Evaluator — GO/NO-GO/TECH_DEBT Decision Engine', files: ['src/orchestra/result-evaluator.ts'], description: 'Evaluates task results with rubric scoring, CODE_VERIFIED_DONE logic, and TECH_DEBT downgrade.' },
  { id: 'auditor', label: 'Auditor — 30s Scan Loop + 3-Pipeline Verification', files: ['src/monitor/auditor.ts'], description: 'In-process auditor: scans heartbeats, git diff boundary violations, stale locks, authority matrix enforcement.' },
  { id: 'event-stream', label: 'Event Stream — ADR-035 Structured Event Log', files: ['src/orchestra/event-stream.ts'], description: 'Append-only sprint-NNN-events.jsonl event log. Protocol V1.0 with 15 channel codes.' },
  { id: 'sprint-checkpoint', label: 'Sprint Checkpoint — Resume Capability', files: ['src/orchestra/sprint-checkpoint.ts', 'src/cli/commands/resume.ts'], description: 'Writes checkpoint every N tasks. Resume command restores sprint state.' },
  { id: 'routing-engine-v2', label: 'Routing Engine V2 — Intent-Based Task Router', files: ['src/core/routing-engine.ts', 'src/core/intent-classifier.ts', 'src/core/activation-engine.ts'], description: 'V2 intent-based routing: routeTaskV2(), confidence scoring, agent/skill/provider assignment.' },
  { id: 'sprint-retro-reporter', label: 'Sprint Retrospective + Reporter', files: ['src/orchestra/sprint-reporter.ts', 'src/orchestra/sprint-retro-writer.ts', 'src/orchestra/sprint-metrics.ts'], description: 'Writes RETRO.md, sprint learnings, 7-section rich sprint output, token usage section.' },
  { id: 'authority-enforcer', label: 'Authority Enforcer — ADR-037 RBAC Runtime Enforcement', files: ['src/orchestra/authority-enforcer.ts'], description: 'Runtime RBAC authority matrix enforcement. Checks file-system path and event-stream channel permissions per role.' },
  { id: 'model-registry', label: 'Model Registry — 13 Models, 3 Providers, Tier Routing', files: ['src/core/model-registry.ts', 'src/core/model-equivalence.ts', 'src/core/mode-presets.ts'], description: 'Single source of truth for model tiers. Provider-agnostic routing.' },
  { id: 'tmux-backend', label: 'Tmux Backend — Worker Spawn via tmux Sessions', files: ['src/orchestra/tmux.ts'], description: 'Default worker spawn backend using tmux sessions.' },
  { id: 'docker-backend', label: 'Docker Backend — Container-Based Worker Isolation', files: ['src/orchestra/spawn-backend-docker.ts'], description: 'Docker container-based worker spawn backend with graceful shutdown.' },
  { id: 'subprocess-backend', label: 'Subprocess Backend — Direct Process Worker Spawn', files: ['src/orchestra/spawn-backend.ts'], description: 'Non-tmux subprocess backend for environments without tmux.' },
  { id: 'fix-phase', label: 'Brain FIX Phase — Failed Task Retry Orchestration', files: ['src/orchestra/sprint-phases.ts', 'src/orchestra/sprint-spawner.ts'], description: 'Retries NO_GO tasks in FIX phase with cross-dependency priority.' },
  { id: 'dependency-scheduler', label: 'Dependency Scheduler — Topological Wave Ordering', files: ['src/orchestra/dependency-scheduler.ts'], description: 'DependencyGraph with Kahn\'s algorithm for sprint task wave ordering.' },
  { id: 'nervous-system', label: 'Nervous System — Proactive Meta-Orchestrator (ADR-040)', files: ['src/nervous/observer.ts', 'src/nervous/detector-registry.ts', 'src/nervous/executor.ts'], description: 'ADR-040 proactive meta-orchestrator with 5+ detectors, cron/event triggers, suggest/act modes.', blockedBy: 'nervous observer not imported by sprint-controller — CLI-driven activation only' },
  { id: 'memory-v2', label: 'Memory V2 — SQLite FTS5 DB-First Architecture', files: ['src/core/memory-store.ts', 'src/core/memory-query.ts', 'src/core/memory-normalize.ts', 'src/core/memory-export.ts'], description: 'SQLite DB-first memory with FTS5 dual-layer Turkish normalize, 96% context reduction.' },
  { id: 'self-modifying-detector', label: 'Self-Modifying Task Detection (ADR-039)', files: ['src/orchestra/self-modifying-detector.ts'], description: 'Deckent dogfood vs user project discrimination. Sprint 139 catastrophic lesson architectural guard.', blockedBy: 'detection active but enforcement is opt-in via config' },

  // Lightly used
  { id: 'archive-debt', label: 'Archive Debt — CLI Debt Rotation Command', files: ['src/cli/commands/archive-debt.ts'], description: 'CLI-only command. Rotates resolved DEBT.md entries to archive.', parityGap: 'CLI-only, no MCP tool' },
  { id: 'skill-marketplace', label: 'Skill Marketplace — Skill Discovery + Installation', files: ['src/cli/commands/skill-marketplace.ts'], description: 'Sub-command of deckent skill. Lists/installs skills from marketplace.', parityGap: 'CLI-only, no MCP tool' },
  { id: 'managed-docs', label: 'Managed Docs — Sprint Lifecycle Doc Auto-Update', files: ['src/orchestra/managed-docs/'], description: 'ADR-029 template-based doc generation. Updates user-configured markdown docs after each sprint.', parityGap: 'opt-in, many projects never configure it', blockedBy: 'requires .deckent/docs.json configuration — opt-in' },
  { id: 'promotion-pipeline', label: 'Agent/Skill Evolution Pipeline — Promotion/Demotion', files: ['src/orchestra/promotion-pipeline.ts', 'src/orchestra/temp-skill-generator.ts'], description: 'Evaluates temp agents/skills for promotion to permanent pool.' },
  { id: 'rollback', label: 'Rollback — Sprint Rollback on All-NO_GO', files: ['src/orchestra/rollback.ts'], description: 'Triggered only when all sprint tasks are NO_GO and rollback_policy is configured.' },

  // Dormant
  { id: 'heartbeat-daemon', label: 'Heartbeat Daemon — Background Proactive Tasks', files: ['src/orchestra/heartbeat-daemon.ts', 'src/cli/commands/heartbeat.ts'], description: 'CLI command runs HEARTBEAT.md tasks on interval. NOT wired into sprint-controller.', blockedBy: 'no sprint-controller auto-wiring' },
  { id: 'shared-memory', label: 'Shared Memory — Cross-Worker In-Memory Context', files: ['src/orchestra/shared-memory.ts'], description: 'SharedMemory class for cross-worker data sharing. Zero external imports.', blockedBy: 'no integration point in worker prompt or spawn' },
  { id: 'handoff-protocol', label: 'Handoff Protocol — Worker State Handoff', files: ['src/orchestra/handoff-protocol.ts'], description: 'Worker state handoff protocol for task transfer between workers.', blockedBy: 'no integration point' },
  { id: 'multi-agent-pipeline', label: 'Multi-Agent Pipeline — Collaborative Task Execution', files: ['src/orchestra/multi-agent.ts'], description: 'MultiAgentPipeline class for coordinated multi-agent task execution.', blockedBy: 'no sprint integration' },
  { id: 'ecosystem-intelligence', label: 'Ecosystem Intelligence — Skill Activation Persistence', files: ['src/orchestra/ecosystem-intelligence.ts'], description: 'analyzeNewSkill + persistSkillActivation called from CLI skill add workflow.', blockedBy: 'analysis output not consumed by routing-engine-v2' },
  { id: 'human-checkpoint-cli', label: 'Human Checkpoint — Sprint Pause for Human Approval', files: ['src/cli/commands/checkpoint.ts', 'src/orchestra/sprint-lifecycle.ts'], description: 'Sprint checkpoint approval system. Requires CHECKPOINT_INTERVAL config.', blockedBy: 'opt-in config, rarely set' },

  // Active — live wired features that import-count heuristic under-counts
  { id: 'autonomous-runtime', label: 'Autonomous Execution Engine — F3-009 backlog-driven authority-bounded loop', files: ['src/orchestra/autonomous-runtime.ts', 'src/orchestra/autonomous/runtime-loop.ts', 'src/orchestra/autonomous/backlog.ts', 'src/orchestra/autonomous/backlog-types.ts', 'src/orchestra/autonomous/policy-gate.ts', 'src/orchestra/autonomous/execute-dispatcher.ts', 'src/orchestra/autonomous/backlog-trigger.ts', 'src/orchestra/autonomous/execution-pool.ts', 'src/orchestra/autonomous/action-adapter.ts', 'src/orchestra/autonomous/approval-adapter.ts', 'src/orchestra/autonomous/audit-adapter.ts', 'src/orchestra/autonomous/authority-adapter.ts', 'src/orchestra/autonomous/trigger-adapter.ts', 'src/orchestra/autonomous/reactive/reactive-types.ts', 'src/orchestra/autonomous/reactive/reactive-map.ts', 'src/orchestra/autonomous/reactive/reactive-ingester.ts', 'src/orchestra/autonomous/reactive/nervous-reactive-source.ts', 'src/cli/commands/autonomous.ts'], description: 'F3-009 backlog-driven autonomous engine (sub-projects 1+2, 2026-06-07). Durable backlog (recurring+one-off+reactive entries; per-entry policy/provider/kind; atomic writeback + crash recovery) → 3-gate governance (RBAC authority ADR-037 → per-task policy auto|approval-required → EffectClass risk ADR-055) → execute-dispatcher (task→runTaskMode | sprint→runSprint) → audit. Hybrid trigger (backlog∪scheduled-flow∪reactive), concurrency-ready ExecutionPool, composition root buildEngineRuntime, flag-gated config.autonomous (default enabled:false). Live `deckent autonomous start` drives the engine end-to-end (flag-gated config.autonomous.enabled, default-off; buildEngineRuntime + real runTaskMode/runSprint runners + crash recovery; smoke-proven) plus `backlog add/list/remove` + status. Sub-project 2: nervous-detector reactive bridge (detection→declarative reactive-map→durable backlog entry via an ingester; dedup; flag-gated config.autonomous.reactive default-off) — built + unit-tested + wired into start (attach-only). AS-6 / ADR-037 / ADR-040.', forceCategory: 'active', parityGap: 'CLI-only — no MCP tool for autonomous start/backlog/status yet. Reactive bridge is ATTACH-ONLY: the nervous observer is not driven in `start` (and built-in detectors are EXECUTE-phase-gated), so live detections do not yet flow — observer-driving + webhook/repo-watch sources remain (sub-project 2 continuation). Concurrent ExecutionPool also remains.' },

  { id: 'approval-runtime', label: 'Approval Runtime — Runtime-Wide ApprovalBroker Chain (APR pillar)', files: ['src/core/approval-contract.ts', 'src/core/approval-broker.ts', 'src/core/approval-policy.ts', 'src/core/approval-store.ts', 'src/core/approval-relay.ts', 'src/core/approval-eventstream.ts', 'src/core/approval-worker-gate.ts', 'src/core/approval-fallback.ts', 'src/core/approval-masking.ts', 'src/core/approval-rules-load.ts', 'src/core/approval-expiry-driver.ts'], description: 'Runtime-wide live-approval chain (sprints 350-356, strategic-pivot P0 APR): contract (zod, 7 scopes × 5 risks × 4 policies) → broker (submit/decide/awaitDecision) → policy engine (rules from .deckent/approvals-rules.json) → file-backed store (.deckent/approvals/, restart-survivable) → relay (channel fan-out: telegram/terminal/nervous) → eventstream → WorkerApprovalGate (guard() before risky actions, fail-closed timeout fallback) → arg-masking + expiry driver. Surfaces: Ink approval-card (repl_surface.approvals), GET /api/approvals + dashboard ApprovalsPanel (watch-only), decide-API flag-gated (approval.api_decide). Worker-side enforcement gate flag: approval_gate (default-off). Docs: docs/features/approval-runtime.md.', forceCategory: 'active' },
  { id: 'tool-surface', label: 'Tool Surface — Progressive-Disclosure Meta-Tools (TOOL pillar)', files: ['src/core/tool-registry.ts', 'src/core/tool-search.ts', 'src/core/tool-core.ts', 'src/core/tool-dispatch.ts', 'src/core/tool-scope-gate.ts', 'src/cli/repl/native-tool-registry.ts'], description: 'Hermes-model progressive tool disclosure (354-002 + tool family): registry (MCP-seeded catalog) → core-7 eager set + deferred index → deckent_search_tools / deckent_describe_tool / deckent_call_tool meta-tools in the native REPL → dispatch bridge with risk threshold + scope gate. Config: tool_surface.enabled (default-off; ON in dogfood 2026-07-02), tool_surface.riskThreshold. Docs: docs/features/tool-surface.md.', forceCategory: 'active' },
  { id: 'repl-surface', label: 'REPL Surface — Mode-Indicator + Live-Footer + Approval-Card (TERM pillar)', files: ['src/cli/repl/app.tsx', 'src/cli/helpers/live-footer.ts', 'src/cli/helpers/run-state-feed.ts', 'src/cli/helpers/health-snapshot.ts', 'src/cli/helpers/progress-reader.ts', 'src/cli/repl/approval-card.tsx', 'src/cli/repl/dual-stream.ts', 'src/cli/repl/approval-terminal-channel.ts', 'src/cli/repl/chat-turn-queue.ts'], description: 'Native-REPL management surface (354-001 / 355-011, strategic-pivot "terminal = ana yönetim yüzeyi"): mode-indicator + live-footer (run-state feed + health snapshot + progress reader) and the approval-card + dual-stream + terminal approval channel. Config: repl_surface.enabled + repl_surface.approvals (independent flags, default-off; both ON in dogfood 2026-07-02), repl_surface.bg_turns reserved. Flag-off render byte-identical. Docs: docs/features/repl-surface.md.', forceCategory: 'active' },
  { id: 'npm-advisory', label: 'NPM Advisory — Dependency-Mutation Escalation via Worker→Brain Channel (born-454)', files: ['src/orchestra/prompt-god-template.ts', 'src/orchestra/ipc-registry.ts'], description: 'Advisory-style (CC-advisory-like, non-blocking) guard against workers running npm/yarn/pnpm install in the mounted workspace (sprint-356 live incident: native-binding destruction). God-prompt NPM_ADVISORY_BLOCK (static T0) instructs escalation via the file-based question channel (.tasks/task-<id>.question, [NPM-ADVISORY] marker); Brain answers deterministically fail-closed (continue + explicit not-approved message, suggestedAction never honored) and notifies the operator once per advisory. Design decided by Alperen 2026-07-02: channel-advisory instead of a physical PATH-shim/RO-mount block. Docs: docs/features/npm-advisory.md.', forceCategory: 'active' },

  // Dead — (decision-orchestrator-v1 removed: V1 routing fully deleted by ROUTE-V1-PURGE / ADR-G-006)
  { id: 'parallel-pipeline-manager-standalone', label: 'ParallelPipelineManager — Legacy Wave Builder (Superseded)', files: ['src/orchestra/parallel-pipeline.ts'], description: 'Original topological wave builder. Primary execution path superseded by dependency-scheduler.', supersededBy: 'dependency-scheduler' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Count how many src/ files import from a given module path.
 * @param {string} modulePath - relative from project root (e.g. 'src/orchestra/event-stream.ts')
 * @returns {number}
 */
function countImporters(modulePath) {
  const moduleBase = modulePath.replace(/\.ts$/, '.js').replace(/^src\//, '');
  const moduleNoExt = modulePath.replace(/\.ts$/, '').replace(/^src\//, '');

  // Search for import patterns: from './event-stream.js' or from '../orchestra/event-stream.js'
  const result = spawnSync('grep', [
    '-rl', '--include=*.ts',
    '-E', `from\\s+['"].*${basename(moduleNoExt)}(\\.js)?['"]`,
    join(projectRoot, 'src'),
  ], { encoding: 'utf-8', timeout: 10000 });

  if (result.status !== 0 && result.status !== 1) return 0;

  const files = (result.stdout || '').trim().split('\n').filter(Boolean);
  // Exclude self-imports
  const selfPath = join(projectRoot, modulePath);
  return files.filter(f => resolve(f) !== resolve(selfPath)).length;
}

/**
 * Check if a file is wholly deprecated (file-level @deprecated in first JSDoc block).
 * Individual function-level @deprecated does NOT count — the module is still active.
 * @param {string} filePath
 * @returns {boolean}
 */
function hasFileDeprecatedAnnotation(filePath) {
  const fullPath = join(projectRoot, filePath);
  if (!existsSync(fullPath)) return false;
  try {
    const content = readFileSync(fullPath, 'utf-8');
    // Check first JSDoc block (file-level comment, typically in first 20 lines)
    const firstLines = content.split('\n').slice(0, 20).join('\n');
    // File-level: @deprecated in the opening comment block before any code
    const fileDocMatch = firstLines.match(/^\/\*\*[\s\S]*?@deprecated[\s\S]*?\*\//);
    return !!fileDocMatch;
  } catch {
    return false;
  }
}

/**
 * Check if feature files exist on disk.
 * @param {string[]} files
 * @returns {{ exists: string[], missing: string[] }}
 */
function checkFilesExist(files) {
  const exists = [];
  const missing = [];
  for (const f of files) {
    const fullPath = join(projectRoot, f);
    // Handle directory entries (ending with /)
    if (f.endsWith('/')) {
      (existsSync(fullPath) ? exists : missing).push(f);
    } else {
      (existsSync(fullPath) ? exists : missing).push(f);
    }
  }
  return { exists, missing };
}

/**
 * Categorize a feature based on import count + file existence + annotations.
 * @param {object} feature
 * @returns {'active' | 'lightly_used' | 'dormant' | 'dead'}
 */
function categorizeFeature(feature) {
  // Explicit dead markers
  if (feature.deprecatedSince || feature.supersededBy) return 'dead';

  // Explicit category override — for live features where heuristic under-counts imports
  if (feature.forceCategory) return feature.forceCategory;

  // Check file existence
  const { exists, missing } = checkFilesExist(feature.files);
  if (exists.length === 0) return 'dead';

  // Check for file-level @deprecated in source (not individual function @deprecated)
  const allDeprecated = exists.every(f => !f.endsWith('/') && hasFileDeprecatedAnnotation(f));
  if (allDeprecated && exists.length > 0) return 'dead';

  // Count importers for primary file
  const primaryFile = exists.find(f => !f.endsWith('/')) || exists[0];
  const importerCount = primaryFile ? countImporters(primaryFile) : 0;

  // Explicit dormant markers
  if (feature.blockedBy) return 'dormant';

  if (importerCount >= 2) return 'active';
  if (importerCount === 1) return 'lightly_used';

  // Zero imports but file exists → dormant
  return 'dormant';
}

// ─── Main ──────────────────────────────────────────────────────────────────

function generateManifest() {
  const categories = { active: [], lightly_used: [], dormant: [], dead: [] };

  for (const feature of FEATURE_DEFINITIONS) {
    const category = categorizeFeature(feature);
    const { exists, missing } = checkFilesExist(feature.files);

    const entry = {
      id: feature.id,
      label: feature.label,
      files: feature.files,
      description: feature.description,
    };

    if (category === 'active') {
      entry.importCount = 'high';
    }

    if (feature.deprecatedSince) entry.deprecatedSince = feature.deprecatedSince;
    if (feature.supersededBy) entry.supersededBy = feature.supersededBy;
    if (feature.adrRef) entry.adrRef = feature.adrRef;
    if (feature.blockedBy) entry.blockedBy = feature.blockedBy;
    if (feature.parityGap) entry.parityGap = feature.parityGap;
    if (missing.length > 0) entry.missingFiles = missing;

    categories[category].push(entry);
  }

  const manifest = {
    _meta: {
      version: '2.0',
      generatedAt: new Date().toISOString(),
      generatedBy: 'scripts/sync-manifest.mjs',
      sprintId: detectCurrentSprint(),
      description: 'Feature usage manifest — curated feature catalog (FEATURE_DEFINITIONS in scripts/sync-manifest.mjs) bucketed by an import-count heuristic plus manual lifecycle annotations. NOT a full import-graph analysis. Categories: active, lightly_used, dormant, dead.',
      usageWindow: 'last-10-sprints',
      sourceAnalysis: {
        sprintsChecked: getRecentSprints(),
        methodology: 'curated catalog + grep-based import count (basename match) + @deprecated detection + manual blockedBy/deprecatedSince/supersededBy annotations',
      },
    },
    ...categories,
  };

  return manifest;
}

/**
 * Detect current sprint ID from .deckent/config.json or .tasks/ files.
 */
function detectCurrentSprint() {
  try {
    const configPath = join(projectRoot, '.deckent', 'config.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.last_sprint_id) return config.last_sprint_id;
    }
  } catch { /* ignore */ }

  // Fallback: check .tasks/ for highest sprint number
  try {
    const tasksDir = join(projectRoot, '.tasks');
    if (existsSync(tasksDir)) {
      const files = readdirSync(tasksDir);
      const sprintNums = files
        .map(f => f.match(/task-(\d+)-/)?.[1])
        .filter(Boolean)
        .map(Number);
      if (sprintNums.length > 0) return `sprint-${Math.max(...sprintNums)}`;
    }
  } catch { /* ignore */ }

  return 'unknown';
}

/**
 * Get list of recent sprint IDs for sourceAnalysis metadata.
 */
function getRecentSprints() {
  try {
    const configPath = join(projectRoot, '.deckent', 'config.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const lastNum = parseInt(config.last_sprint_id?.replace('sprint-', '') || '0', 10);
      if (lastNum > 0) {
        const start = Math.max(1, lastNum - 9);
        return Array.from({ length: lastNum - start + 1 }, (_, i) => `sprint-${start + i}`);
      }
    }
  } catch { /* ignore */ }
  return ['unknown'];
}

// ─── Execute ───────────────────────────────────────────────────────────────

const manifest = generateManifest();

const totalFeatures =
  manifest.active.length +
  manifest.lightly_used.length +
  manifest.dormant.length +
  manifest.dead.length;

if (dryRun || outputJson) {
  if (outputJson) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log(`Features Manifest Sync — Dry Run`);
    console.log(`Root: ${projectRoot}`);
    console.log(`Sprint: ${manifest._meta.sprintId}`);
    console.log(`─────────────────────────────────`);
    console.log(`Active:       ${manifest.active.length}`);
    console.log(`Lightly Used: ${manifest.lightly_used.length}`);
    console.log(`Dormant:      ${manifest.dormant.length}`);
    console.log(`Dead:         ${manifest.dead.length}`);
    console.log(`Total:        ${totalFeatures}`);
    console.log(`─────────────────────────────────`);
    for (const cat of ['active', 'lightly_used', 'dormant', 'dead']) {
      if (manifest[cat].length > 0) {
        console.log(`\n[${cat.toUpperCase()}]`);
        for (const f of manifest[cat]) {
          console.log(`  ${f.id}: ${f.label}`);
        }
      }
    }
  }
} else {
  // Write manifest
  const manifestPath = join(projectRoot, '.deckent', 'settings', 'features-manifest.json');
  mkdirSync(join(projectRoot, '.deckent', 'settings'), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`✓ Features manifest written: ${manifestPath} (${totalFeatures} features)`);
}
