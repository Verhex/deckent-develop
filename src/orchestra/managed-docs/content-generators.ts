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
import {
  renderBootSequenceSection,
  renderCliCommandsSection,
  renderManualRecoverySection,
  renderMcpToolsSection,
  renderWorkerContractSection,
} from '../workspace-artifacts.js';

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
 * Count .ts module files in a directory (non-recursive).
 * Returns 0 if the directory does not exist.
 */
export function countModules(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f => f.endsWith('.ts')).length;
}

/**
 * Count MCP tools from the TOOL_CATALOG SSOT (src/mcp/tools/index.ts) —
 * CLAUDE.md: MCP tool counter SSOT is TOOL_CATALOG; server.ts only mirrors it
 * in prose (and drifted to 37 vs the registered 46, which is exactly why this
 * counter no longer scans server.ts). Falls back to the legacy server.ts scan
 * only when the catalog file is absent (older target projects).
 */
export function mcpToolCount(projectRoot: string): number {
  const catalogPath = join(projectRoot, 'src', 'mcp', 'tools', 'index.ts');
  if (existsSync(catalogPath)) {
    const src = readFileSync(catalogPath, 'utf-8');
    const entries = src.match(/name:\s*'deckent_[a-z_]+'/g) ?? [];
    if (entries.length > 0) return new Set(entries).size;
  }
  const serverPath = join(projectRoot, 'src', 'mcp', 'server.ts');
  if (!existsSync(serverPath)) return 0;
  const src = readFileSync(serverPath, 'utf-8');
  const matches = src.match(/deckent_[a-z_]+/g) ?? [];
  return new Set(matches).size;
}

/**
 * Count CLI commands registered in src/cli/index.ts by counting register[A-Z] imports.
 * Each import line corresponds to one registered top-level CLI command.
 */
export function cliCommandCount(projectRoot: string): number {
  const indexPath = join(projectRoot, 'src', 'cli', 'index.ts');
  if (!existsSync(indexPath)) return 0;
  const src = readFileSync(indexPath, 'utf-8');
  return (src.match(/^import \{ register[A-Z]/gm) ?? []).length;
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
    return renderMcpToolsSection(ctx.config?.language ?? 'en');
  },
});

// ─── CLI Commands ─────────────────────────────────────────────────────────

register({
  id: 'cli-commands',
  patterns: ['cli commands', 'commands list', 'command list', 'cli command list'],
  generate(ctx: DocUpdateContext): string {
    return renderCliCommandsSection(ctx.config?.language ?? 'en');
  },
});

// ─── Boot Sequence ────────────────────────────────────────────────────────

register({
  id: 'boot-sequence',
  patterns: ['boot sequence', 'startup sequence', 'boot steps'],
  generate(ctx: DocUpdateContext): string {
    return renderBootSequenceSection(ctx.config?.language ?? 'en');
  },
});

// ─── Manual Recovery Chain ────────────────────────────────────────────────

register({
  id: 'manual-recovery',
  patterns: ['manual recovery chain', 'manual recovery', 'recovery chain', 'recovery steps'],
  generate(ctx: DocUpdateContext): string {
    return renderManualRecoverySection(ctx.config?.language ?? 'en');
  },
});

// ─── Worker Anti-Patterns ─────────────────────────────────────────────────

register({
  id: 'worker-anti-patterns',
  patterns: ['worker contract', 'anti-patterns', 'worker anti-patterns', 'forbidden patterns', 'antipatterns'],
  generate(ctx: DocUpdateContext): string {
    return renderWorkerContractSection(ctx.config?.language ?? 'en');
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

    // MCP tools — derived from server.ts registered deckent_ names (canonical count)
    const mcpTools = mcpToolCount(ctx.projectRoot);

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

    // CLI commands — derived from cli/index.ts register* imports (canonical count)
    const cliCmds = cliCommandCount(ctx.projectRoot);

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

// ─── Architecture Map ─────────────────────────────────────────────────────

register({
  id: 'architecture-map',
  patterns: ['architecture', 'architecture map', 'module counts', 'architecture overview'],
  patternsByLang: {
    tr: ['mimari', 'mimari haritası', 'modül sayıları'],
    de: ['architektur', 'architekturübersicht'],
    es: ['arquitectura', 'mapa de arquitectura'],
  },
  generate(ctx: DocUpdateContext): string {
    const s = i18n(ctx);
    const srcDir = join(ctx.projectRoot, 'src');
    if (!existsSync(srcDir)) return s.srcNotFound;

    const KEY_DIRS = [
      'core', 'orchestra', 'agents', 'nervous', 'monitor',
      'connectors', 'providers', 'api', 'mcp', 'cli',
    ];

    const rows: string[] = [`| ${s.module} | ${s.fileCount} |`, '|-------|-------------|'];
    for (const dir of KEY_DIRS) {
      const moduleCount = countModules(join(srcDir, dir));
      if (moduleCount > 0) {
        rows.push(`| ${dir}/ | ${moduleCount} |`);
      }
    }
    return rows.join('\n');
  },
});
