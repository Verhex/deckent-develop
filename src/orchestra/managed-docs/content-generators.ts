// ─── Content Generators ───────────────────────────────────────────────────
// Built-in generators for auto section content. Each generator produces
// markdown content from sprint data.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation } from '../../core/types.js';
import { AgentPoolManager } from '../../core/agent-pool.js';
import { SkillPoolManager } from '../../core/skill-pool.js';
import { modelRegistry } from '../../core/model-registry.js';
import type { DocUpdateContext } from '../doc-updaters/types.js';
import type { SectionGenerator } from './types.js';
import type { MemoryEntryV2 } from '../../core/memory-types.js';
// Sprint 168 W2.5 — C0d wire: guarded sprint metrics (BUG-FF NaN%/-1dk fix)
import { computeSprintMetrics } from '../sprint-reporter.js';

// ─── i18n Strings ────────────────────────────────────────────────────────

interface I18nStrings {
  metric: string; value: string; sprint: string;
  totalTasks: string; completed: string; techDebt: string; noGo: string;
  duration: string; coverage: string;
  noDebtRecord: string; noDebt: string; noHistory: string; noChanges: string;
  srcNotFound: string; pkgNotFound: string; pkgReadError: string; noDeps: string;
  agent: string; tasks: string; done: string; success: string;
  status: string; module: string; fileCount: string;
  completed2: string; noGoRate: string;
}

const EN: I18nStrings = {
  metric: 'Metric', value: 'Value', sprint: 'Sprint',
  totalTasks: 'Total Tasks', completed: 'Completed',
  techDebt: 'Tech Debt', noGo: 'No-Go',
  duration: 'Duration', coverage: 'Coverage',
  noDebtRecord: '_No tech debt record._',
  noDebt: '_No open tech debt._',
  noHistory: '_No sprint history._',
  noChanges: '_No changes this sprint._',
  srcNotFound: '_src/ directory not found._',
  pkgNotFound: '_package.json not found._',
  pkgReadError: '_Could not read package.json._',
  noDeps: '_No dependencies._',
  agent: 'Agent', tasks: 'Tasks', done: 'Done', success: 'Success',
  status: 'Status', module: 'Module', fileCount: 'File Count',
  completed2: 'completed', noGoRate: 'No-Go Rate',
};

const TR: I18nStrings = {
  metric: 'Metrik', value: 'Değer', sprint: 'Sprint',
  totalTasks: 'Toplam Task', completed: 'Tamamlanan',
  techDebt: 'Tech Debt', noGo: 'No-Go',
  duration: 'Süre', coverage: 'Coverage',
  noDebtRecord: '_Teknik borç kaydı yok._',
  noDebt: '_Açık teknik borç yok._',
  noHistory: '_Sprint geçmişi yok._',
  noChanges: '_Bu sprintte değişiklik yok._',
  srcNotFound: '_src/ dizini bulunamadı._',
  pkgNotFound: '_package.json bulunamadı._',
  pkgReadError: '_package.json okunamadı._',
  noDeps: '_Bağımlılık yok._',
  agent: 'Agent', tasks: 'Tasks', done: 'Done', success: 'Başarı',
  status: 'Durum', module: 'Modül', fileCount: 'Dosya Sayısı',
  completed2: 'tamamlandı', noGoRate: 'No-Go Rate',
};

function i18n(ctx: DocUpdateContext): I18nStrings {
  return ctx.config?.language === 'tr' ? TR : EN;
}

// ─── Generator Registry ───────────────────────────────────────────────────

const generators: SectionGenerator[] = [];

function register(g: SectionGenerator): void {
  generators.push(g);
}

/**
 * Find a generator matching the given section title (case-insensitive fuzzy match).
 * Searches `patterns` and all entries in `patternsByLang` to support multi-language titles.
 */
export function findGenerator(sectionTitle: string, extraGenerators: SectionGenerator[] = []): SectionGenerator | null {
  const normalized = sectionTitle.toLowerCase().trim();
  // User-defined generators take precedence over built-ins
  const pool = [...extraGenerators, ...generators];
  for (const g of pool) {
    const allPatterns: string[] = [...g.patterns];
    if (g.patternsByLang) {
      for (const langPatterns of Object.values(g.patternsByLang)) {
        allPatterns.push(...langPatterns);
      }
    }
    for (const pattern of allPatterns) {
      const p = pattern.toLowerCase();
      if (normalized === p || normalized.includes(p) || p.includes(normalized)) {
        return g;
      }
    }
  }
  return null;
}

/** Exposed for tests and plugin loaders. */
export function getAllGenerators(): SectionGenerator[] {
  return [...generators];
}

/**
 * Generate content for all auto sections.
 * Returns a map of sectionTitle → generated markdown content.
 * Optional `extraGenerators` are searched before built-ins (user overrides).
 */
export function generateAllSections(
  autoSections: string[],
  ctx: DocUpdateContext,
  extraGenerators: SectionGenerator[] = [],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const title of autoSections) {
    const generator = findGenerator(title, extraGenerators);
    if (generator) {
      try {
        result.set(title, generator.generate(ctx));
      } catch {
        // Non-fatal: skip this section
      }
    }
  }
  return result;
}

// ═══ Built-in Generators ══════════════════════════════════════════════════

// ─── Sprint Metrics ───────────────────────────────────────────────────────

register({
  id: 'sprint-metrics',
  patterns: ['sprint metrics', 'metrics', 'stats', 'sprint stats'],
  patternsByLang: {
    tr: ['sprint metrikleri', 'metrikler', 'sprint istatistikleri', 'istatistikler'],
    de: ['sprint-metriken', 'metriken'],
    es: ['métricas', 'estadísticas del sprint'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);
    const { metrics } = ctx.sprintResult;
    const { sprint } = ctx.sprintResult;
    // Sprint 168 W2.5 — C0d wire (BUG-FF closure):
    // Use computeSprintMetrics to guard durationMs against negative drift
    // (returns Math.max(0, …)). Coverage guard: render "N/A" sentinel when
    // metrics.coveragePercent is not finite (NaN/Infinity from upstream
    // division edge cases — e.g. read-only audit sprints with 0 results).
    const guarded = computeSprintMetrics({
      startMs: 0,
      endMs: metrics.durationMs,
      totalLines: 0,
      coveredLines: 0,
    });
    const safeDurationMs = guarded.durationMs;
    const durationMin = Math.floor(safeDurationMs / 60000);
    const durationSec = Math.floor((safeDurationMs % 60000) / 1000);
    const coverageDisplay = Number.isFinite(metrics.coveragePercent)
      ? `${metrics.coveragePercent.toFixed(1)}%`
      : 'N/A';
    return [
      `| ${s.metric} | ${s.value} |`,
      `|--------|-------|`,
      `| ${s.sprint} | ${sprint.id} |`,
      `| ${s.totalTasks} | ${metrics.totalTasks} |`,
      `| ${s.completed} | ${metrics.completedTasks} |`,
      `| ${s.techDebt} | ${metrics.techDebtTasks} |`,
      `| ${s.noGo} | ${metrics.noGoTasks} |`,
      `| ${s.duration} | ${durationMin}dk ${durationSec}sn |`,
      `| ${s.coverage} | ${coverageDisplay} |`,
    ].join('\n');
  },
});

// ─── Active Debt ──────────────────────────────────────────────────────────

register({
  id: 'active-debt',
  patterns: ['active debt', 'tech debt', 'debt'],
  patternsByLang: {
    tr: ['teknik borç', 'aktif borç', 'açık borç'],
    de: ['technische schulden'],
    es: ['deuda técnica'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);

    // DB-first: read debt entries from MemoryStore (V2: DB is single source of truth)
    if (!ctx.store) return s.noDebtRecord;

    try {
      const debtEntries = ctx.store.getByType('debt');
      const openEntries = debtEntries.filter((e: MemoryEntryV2) =>
        e.status === 'active' || e.status === 'accepted',
      );
      if (openEntries.length === 0) return s.noDebt;
      return openEntries.slice(0, 10).map((e: MemoryEntryV2) => `- **${e.title}**: ${e.summary ?? e.content.slice(0, 100)}`).join('\n');
    } catch {
      return s.noDebt;
    }
  },
});

// ─── Sprint History ───────────────────────────────────────────────────────

register({
  id: 'sprint-history',
  patterns: ['sprint history', 'history', 'progress', 'sprint progress'],
  patternsByLang: {
    tr: ['sprint geçmişi', 'geçmiş', 'sprint tarihçesi', 'ilerleme'],
    de: ['sprint-verlauf', 'verlauf'],
    es: ['historial de sprint', 'historial'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);

    // DB-first: read sprint entries from MemoryStore (V2: DB is single source of truth)
    if (!ctx.store) return s.noHistory;

    try {
      const sprintEntries = ctx.store.getByType('sprint');
      if (sprintEntries.length === 0) return s.noHistory;
      // Sort by sprint_num ascending, take last 10
      const sorted = [...sprintEntries].sort((a, b) => a.sprint_num - b.sprint_num).slice(-10);
      const rows: string[] = [`| ${s.sprint} | ${s.status} |`, '|--------|-------|'];
      for (const entry of sorted) {
        const taskMatch = entry.content.match(/(\d+)\s*\/\s*(\d+)/);
        const status = taskMatch ? `${taskMatch[1]}/${taskMatch[2]} task` : s.completed2;
        rows.push(`| ${entry.sprint_id ?? entry.id} | ${status} |`);
      }
      return rows.join('\n');
    } catch {
      return s.noHistory;
    }
  },
});

// ─── Agent Performance ────────────────────────────────────────────────────

register({
  id: 'agent-performance',
  patterns: ['agent performance', 'agents', 'agent stats'],
  patternsByLang: {
    tr: ['agent performansı', 'ajan performansı', 'agent istatistikleri'],
    de: ['agent-leistung'],
    es: ['rendimiento de agentes'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);
    const { sprint, evaluations } = ctx.sprintResult;
    const agentMap = new Map<string, { total: number; done: number }>();

    for (const task of sprint.tasks) {
      const agent = task.assignedAgent ?? 'generic';
      const stats = agentMap.get(agent) ?? { total: 0, done: 0 };
      stats.total++;
      const ev = evaluations.get(task.id);
      if (ev === TaskEvaluation.DONE || ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
        stats.done++;
      }
      agentMap.set(agent, stats);
    }

    const rows: string[] = [`| ${s.agent} | ${s.tasks} | ${s.done} | ${s.success} |`, '|-------|-------|------|--------|'];
    for (const [agent, stats] of agentMap) {
      const rate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
      rows.push(`| ${agent} | ${stats.total} | ${stats.done} | ${rate}% |`);
    }
    return rows.join('\n');
  },
});

// ─── Changelog / Recent Changes ───────────────────────────────────────────

register({
  id: 'changelog',
  patterns: ['changelog', 'recent changes', 'changes'],
  patternsByLang: {
    tr: ['son değişiklikler', 'değişiklik günlüğü', 'değişiklikler'],
    de: ['änderungsprotokoll', 'änderungen'],
    es: ['registro de cambios', 'cambios'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);
    const { sprint, evaluations } = ctx.sprintResult;
    const lines: string[] = [];
    for (const task of sprint.tasks) {
      const ev = evaluations.get(task.id);
      if (ev === TaskEvaluation.DONE) {
        lines.push(`- ✅ ${task.title}`);
      } else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
        lines.push(`- ⚠️ ${task.title} (tech debt)`);
      } else if (ev === TaskEvaluation.NO_GO) {
        lines.push(`- ❌ ${task.title} (no-go)`);
      }
    }
    return lines.length > 0 ? lines.join('\n') : s.noChanges;
  },
});

// ─── Test Coverage ────────────────────────────────────────────────────────

register({
  id: 'test-coverage',
  patterns: ['test coverage', 'coverage', 'test stats'],
  patternsByLang: {
    tr: ['test kapsamı', 'kapsam', 'test istatistikleri'],
    de: ['testabdeckung', 'abdeckung'],
    es: ['cobertura de pruebas', 'cobertura'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);
    const { metrics } = ctx.sprintResult;
    return [
      `| ${s.metric} | ${s.value} |`,
      `|--------|-------|`,
      `| ${s.coverage} | ${metrics.coveragePercent.toFixed(1)}% |`,
      `| ${s.noGoRate} | ${(metrics.noGoRate * 100).toFixed(1)}% |`,
    ].join('\n');
  },
});

// ─── Module Map ───────────────────────────────────────────────────────────

register({
  id: 'module-map',
  patterns: ['module map', 'modules', 'module list'],
  patternsByLang: {
    tr: ['modüller', 'modül haritası', 'modül listesi'],
    de: ['modulübersicht', 'module'],
    es: ['mapa de módulos', 'módulos'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);
    const srcDir = join(ctx.projectRoot, 'src');
    if (!existsSync(srcDir)) return s.srcNotFound;

    const dirs = readdirSync(srcDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const rows: string[] = [`| ${s.module} | ${s.fileCount} |`, '|-------|-------------|'];
    for (const dir of dirs.slice(0, 15)) {
      const dirPath = join(srcDir, dir);
      const fileCount = readdirSync(dirPath).filter(f => f.endsWith('.ts')).length;
      rows.push(`| ${dir}/ | ${fileCount} |`);
    }
    return rows.join('\n');
  },
});

// ─── MCP Tools ───────────────────────────────────────────────────────────

register({
  id: 'mcp-tools',
  patterns: ['mcp tools', 'tools list', 'mcp tool list', 'mcp tool reference'],
  generate(ctx: DocUpdateContext): string {
    const srcDir = join(ctx.projectRoot, 'src');
    const toolsDir = join(srcDir, 'mcp', 'tools');
    const EXCLUDED = new Set(['index.ts', 'job-runner.ts']);

    if (!existsSync(toolsDir)) return '_MCP tools directory not found._';

    const tools = readdirSync(toolsDir)
      .filter(f => f.endsWith('.ts') && !EXCLUDED.has(f))
      .map(f => f.replace(/\.ts$/, ''))
      .sort();

    const lines: string[] = [
      `| Tool | MCP Name |`,
      `|------|---------|`,
    ];
    for (const tool of tools) {
      const mcpName = `deckent_${tool.replace(/-/g, '_')}`;
      lines.push(`| ${tool} | \`${mcpName}\` |`);
    }
    lines.push('');
    lines.push(`_Total: ${tools.length} MCP tools_`);
    lines.push('');
    lines.push('**Key operational tools:** `deckent_audit`, `deckent_nervous`, `deckent_watch`, `deckent_recover`, `deckent_status`, `deckent_memory_query`');
    return lines.join('\n');
  },
});

// ─── CLI Commands ─────────────────────────────────────────────────────────

register({
  id: 'cli-commands',
  patterns: ['cli commands', 'commands list', 'command list', 'cli command list'],
  generate(ctx: DocUpdateContext): string {
    const srcDir = join(ctx.projectRoot, 'src');
    const cliDir = join(srcDir, 'cli', 'commands');
    const EXCLUDED = new Set(['index.ts']);

    if (!existsSync(cliDir)) return '_CLI commands directory not found._';

    const commands = readdirSync(cliDir, { withFileTypes: true })
      .filter(d => d.isFile() && d.name.endsWith('.ts') && !EXCLUDED.has(d.name))
      .map(d => d.name.replace(/\.ts$/, ''))
      .sort();

    const lines: string[] = [
      `| Command Module | Description |`,
      `|---------------|-------------|`,
    ];
    for (const cmd of commands) {
      lines.push(`| \`${cmd}\` | deckent ${cmd} |`);
    }
    lines.push('');
    lines.push(`_Total: ${commands.length} CLI command modules_`);
    return lines.join('\n');
  },
});

// ─── Boot Sequence ────────────────────────────────────────────────────────

register({
  id: 'boot-sequence',
  patterns: ['boot sequence', 'startup sequence', 'boot steps'],
  generate(_ctx: DocUpdateContext): string {
    return [
      '1. Brain reads `DIRECTIVES.md`',
      '2. Brain checks context (MEMORY, RETRO, DEBT, PATTERNS from `.brain/memory.db`)',
      '3. Brain plans sprint — AI mode (`deckent_plan mode:ai`) with Zod validation',
      '4. Workers spawned via configured backend (tmux/subprocess/Docker), auditor scan loop starts (in-process)',
      '5. Workers execute tasks, write heartbeats (`.hb` files), update progress',
      '6. Brain waits for `.result` files, evaluates GO / NO_GO / GO_WITH_TECH_DEBT',
      '7. Retrospective written to DB → memory update → decay → sprint complete',
    ].join('\n');
  },
});

// ─── Manual Recovery Chain ────────────────────────────────────────────────

register({
  id: 'manual-recovery',
  patterns: ['manual recovery chain', 'manual recovery', 'recovery chain', 'recovery steps'],
  generate(_ctx: DocUpdateContext): string {
    return [
      'If a sprint stalls, follow this chain in order:',
      '',
      '```bash',
      '# Step 1: Kill active workers',
      'deckent kill --all',
      '',
      '# Step 2: Cleanup task files',
      'deckent cleanup',
      '',
      '# Step 3: Recover orphan state (re-evaluates partial results)',
      'deckent recover',
      '',
      '# Step 4: Re-run specific task manually',
      'deckent run <task-id>',
      '',
      '# Step 5: Spawn remaining tasks (auto-approve)',
      'deckent spawn --auto-approve',
      '```',
      '',
      '**MCP equivalent:**',
      '```',
      'deckent_kill    → { target: "all" }',
      'deckent_cleanup → { root: "." }',
      'deckent_recover → { root: "." }',
      'deckent_run     → { taskId: "<task-id>" }',
      '```',
    ].join('\n');
  },
});

// ─── Worker Anti-Patterns ─────────────────────────────────────────────────

register({
  id: 'worker-anti-patterns',
  patterns: ['anti-patterns', 'worker anti-patterns', 'forbidden patterns', 'antipatterns'],
  generate(_ctx: DocUpdateContext): string {
    return [
      '## verify-ran Marker',
      '',
      'Every task MUST write a `.tasks/task-{id}.result` file before exiting.',
      'The verify-ran marker ensures Brain can evaluate your work:',
      '',
      '- **Missing result** → Sprint stalls, task evaluated as NO_GO',
      '- **Partial result** (missing `tokenUsage.provider`) → generates warnings',
      '- **Atomic write** — write to `.tmp` first, then `renameSync` to final path (Bug K fix)',
      '',
      '## Honest-Result Gate',
      '',
      'The honest-result gate requires that before writing `selfAssessment: "DONE"`, you verify:',
      '',
      '1. **Baseline:** what was the test/code state BEFORE your work?',
      '2. **End state:** what is it NOW?',
      '3. **Delta:** how much of the task did you ACTUALLY complete?',
      '',
      'Thresholds:',
      '- ≥80% complete → `"DONE"`',
      '- 50–79% complete → `"GO_WITH_TECH_DEBT"` with specific gap in notes',
      '- <50% complete → `"NO_GO"` with explanation',
      '',
      '"Code written" ≠ "DONE". Functional outcome must match task spec.',
      '',
      '## processQueue Stall Awareness',
      '',
      'If your task depends on another task\'s output and it has not arrived:',
      '',
      '- Check `.tasks/task-{dep-id}.result` exists before proceeding',
      '- Do NOT busy-wait — write `NO_GO` result explaining the dependency',
      '- Brain will reschedule via mid-sprint-adapter',
      '',
      '## RBAC — ADR-037 Authority Matrix',
      '',
      '| Role | Write Source Code | Write Docs | Write `.tasks/` | Write `.brain/` |',
      '|------|:-----------------:|:----------:|:---------------:|:---------------:|',
      '| Brain | ❌ | ✅ | ✅ | ✅ |',
      '| Worker | ✅ (scope only) | ✅ (scope only) | ✅ (own files) | ❌ |',
      '| Auditor | ❌ | ❌ | ❌ | ✅ (patterns) |',
      '',
      'Workers MAY ONLY write files listed in `scope.filesWrite`. Auditor detects violations via `git diff --stat`.',
      '',
      '## Forbidden Anti-Patterns',
      '',
      '| Anti-Pattern | Status | Reason |',
      '|-------------|--------|--------|',
      '| `it.skip(...)` without justification comment | YASAK | Hides failing tests — must fix or document why |',
      '| `stub()` / empty function returning hardcoded value | YASAK | Produces false GO results — implement real logic |',
      '| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |',
      '| Writing outside `scope.filesWrite` | YASAK | ADR-037 RBAC violation — auditor will flag |',
      '| `selfAssessment: "DONE"` without verify-ran marker | YASAK | Sprint evaluator rejects, task → NO_GO |',
      '| Hardcoded timestamps in `.hb` files | YASAK | Use `new Date().toISOString()` always |',
      '| Ignoring ADR constraints | YASAK | Violation requires NO_GO + ADR amendment proposal |',
    ].join('\n');
  },
});

// ─── Dependencies ─────────────────────────────────────────────────────────

register({
  id: 'dependencies',
  patterns: ['dependencies', 'deps'],
  patternsByLang: {
    tr: ['bağımlılıklar', 'paketler', 'kütüphaneler'],
    de: ['abhängigkeiten'],
    es: ['dependencias'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);
    const pkgPath = join(ctx.projectRoot, 'package.json');
    if (!existsSync(pkgPath)) return s.pkgNotFound;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const deps = Object.keys(pkg.dependencies ?? {});
      const devDeps = Object.keys(pkg.devDependencies ?? {});

      const lines: string[] = [];
      if (deps.length > 0) {
        lines.push(`**Dependencies (${deps.length}):** ${deps.slice(0, 10).join(', ')}${deps.length > 10 ? '...' : ''}`);
      }
      if (devDeps.length > 0) {
        lines.push(`**DevDependencies (${devDeps.length}):** ${devDeps.slice(0, 10).join(', ')}${devDeps.length > 10 ? '...' : ''}`);
      }
      return lines.join('\n\n') || s.noDeps;
    } catch {
      return s.pkgReadError;
    }
  },
});

// ─── Project Status ───────────────────────────────────────────────────────

register({
  id: 'project-status',
  patterns: ['project status', 'current status', 'live metrics', 'deckent by the numbers'],
  patternsByLang: {
    tr: ['mevcut durum', 'proje durumu', 'sayılarla deckent', 'canlı metrikler'],
    de: ['projektstatus', 'aktueller status'],
    es: ['estado del proyecto', 'estado actual'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);
    const srcDir = join(ctx.projectRoot, 'src');

    // MCP tools (exclude index.ts and job-runner.ts helper)
    const mcpDir = join(srcDir, 'mcp', 'tools');
    const mcpTools = existsSync(mcpDir)
      ? readdirSync(mcpDir).filter(f => f.endsWith('.ts') && f !== 'index.ts' && f !== 'job-runner.ts').length
      : 0;

    // MCP resources (exclude index.ts)
    const resDir = join(srcDir, 'mcp', 'resources');
    const mcpResources = existsSync(resDir)
      ? readdirSync(resDir).filter(f => f.endsWith('.ts') && f !== 'index.ts').length
      : 0;

    // Dashboard pages
    const pagesDir = join(srcDir, 'dashboard', 'src', 'pages');
    const dashPages = existsSync(pagesDir)
      ? readdirSync(pagesDir).filter(f => f.endsWith('.tsx')).length
      : 0;

    // CLI commands (exclude index.ts)
    const cliDir = join(srcDir, 'cli', 'commands');
    const cliCmds = existsSync(cliDir)
      ? readdirSync(cliDir).filter(f => f.endsWith('.ts') && f !== 'index.ts').length
      : 0;

    // Version from package.json
    const pkgPath = join(ctx.projectRoot, 'package.json');
    let version = 'unknown';
    if (existsSync(pkgPath)) {
      try {
        version = JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? 'unknown';
      } catch { /* non-fatal */ }
    }

    // Sprint id
    const sprintId = ctx.sprintResult.sprint.id;

    // Dynamic agent count
    let agentLabel = 'unknown';
    try {
      const agentPool = new AgentPoolManager(ctx.projectRoot);
      const allAgents = agentPool.listAgents();
      const builtinCount = allAgents.filter(a => a.source === 'builtin').length;
      const customCount = allAgents.length - builtinCount;
      agentLabel = customCount > 0
        ? `${builtinCount} built-in + ${customCount} custom`
        : `${builtinCount} built-in`;
    } catch { /* non-fatal */ }

    // Dynamic skill count
    let skillLabel = 'unknown';
    try {
      const skillPool = new SkillPoolManager(ctx.projectRoot);
      skillLabel = `${skillPool.listSkills().length} built-in`;
    } catch { /* non-fatal */ }

    // Dynamic provider list
    let providerLabel = 'unknown';
    try {
      const providers = modelRegistry.getAllProviders();
      const names = providers.map(p => p.charAt(0).toUpperCase() + p.slice(1));
      providerLabel = `${providers.length} (${names.join(', ')})`;
    } catch { /* non-fatal */ }

    return [
      `| ${s.metric} | ${s.value} |`,
      `|--------|-------|`,
      `| Version | ${version} |`,
      `| ${s.sprint} | ${sprintId} |`,
      `| MCP Tools | ${mcpTools} |`,
      `| MCP Resources | ${mcpResources} |`,
      `| CLI Commands | ${cliCmds}+ |`,
      `| Dashboard Pages | ${dashPages} |`,
      `| Agents | ${agentLabel} |`,
      `| Skills | ${skillLabel} |`,
      `| Providers | ${providerLabel} |`,
    ].join('\n');
  },
});
