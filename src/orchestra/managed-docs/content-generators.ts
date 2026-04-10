// ─── Content Generators ───────────────────────────────────────────────────
// Built-in generators for auto section content. Each generator produces
// markdown content from sprint data.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, DEBT_FILE, SPRINTS_DIR } from '../../core/constants.js';
import { TaskEvaluation } from '../../core/types.js';
import { AgentPoolManager } from '../../core/agent-pool.js';
import { SkillPoolManager } from '../../core/skill-pool.js';
import { modelRegistry } from '../../core/model-registry.js';
import type { DocUpdateContext } from '../doc-updaters/types.js';
import type { SectionGenerator } from './types.js';

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
    const durationMin = Math.floor(metrics.durationMs / 60000);
    const durationSec = Math.floor((metrics.durationMs % 60000) / 1000);
    return [
      `| ${s.metric} | ${s.value} |`,
      `|--------|-------|`,
      `| ${s.sprint} | ${sprint.id} |`,
      `| ${s.totalTasks} | ${metrics.totalTasks} |`,
      `| ${s.completed} | ${metrics.completedTasks} |`,
      `| ${s.techDebt} | ${metrics.techDebtTasks} |`,
      `| ${s.noGo} | ${metrics.noGoTasks} |`,
      `| ${s.duration} | ${durationMin}dk ${durationSec}sn |`,
      `| ${s.coverage} | ${metrics.coveragePercent.toFixed(1)}% |`,
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
    const debtPath = join(ctx.projectRoot, BRAIN_DIR, DEBT_FILE);
    if (!existsSync(debtPath)) return s.noDebtRecord;
    const content = readFileSync(debtPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---'));
    const openLines = lines.filter(l => {
      const cells = l.split('|').map(c => c.trim());
      // Open column (index 6) should be "Yes" or similar
      return cells[6]?.toLowerCase() === 'yes' || cells[6]?.toLowerCase() === 'evet';
    });
    if (openLines.length === 0) return s.noDebt;
    // Return header + open items
    const header = lines[0] ?? '';
    return [header, '|---|---|---|---|---|---|---|---|---|', ...openLines.slice(0, 10)].join('\n');
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
    const sprintsDir = join(ctx.projectRoot, BRAIN_DIR, SPRINTS_DIR);
    if (!existsSync(sprintsDir)) return s.noHistory;

    const files = readdirSync(sprintsDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .slice(-10); // last 10 sprints

    if (files.length === 0) return s.noHistory;

    const rows: string[] = [`| ${s.sprint} | ${s.status} |`, '|--------|-------|'];
    for (const file of files) {
      const name = file.replace('.md', '');
      const content = readFileSync(join(sprintsDir, file), 'utf-8');
      const taskMatch = content.match(/(\d+)\s*\/\s*(\d+)/);
      const status = taskMatch ? `${taskMatch[1]}/${taskMatch[2]} task` : s.completed2;
      rows.push(`| ${name} | ${status} |`);
    }
    return rows.join('\n');
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
