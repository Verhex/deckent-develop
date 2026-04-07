// ─── Content Generators ───────────────────────────────────────────────────
// Built-in generators for auto section content. Each generator produces
// markdown content from sprint data.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, DEBT_FILE, SPRINTS_DIR } from '../../core/constants.js';
import { TaskEvaluation } from '../../core/types.js';
import type { DocUpdateContext } from '../doc-updaters/types.js';
import type { SectionGenerator } from './types.js';

// ─── Generator Registry ───────────────────────────────────────────────────

const generators: SectionGenerator[] = [];

function register(g: SectionGenerator): void {
  generators.push(g);
}

/**
 * Find a generator matching the given section title (case-insensitive fuzzy match).
 */
export function findGenerator(sectionTitle: string): SectionGenerator | null {
  const normalized = sectionTitle.toLowerCase().trim();
  for (const g of generators) {
    for (const pattern of g.patterns) {
      if (normalized === pattern.toLowerCase() || normalized.includes(pattern.toLowerCase())) {
        return g;
      }
    }
  }
  return null;
}

/**
 * Generate content for all auto sections.
 * Returns a map of sectionTitle → generated markdown content.
 */
export function generateAllSections(
  autoSections: string[],
  ctx: DocUpdateContext,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const title of autoSections) {
    const generator = findGenerator(title);
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
  patterns: ['sprint metrics', 'metrics', 'stats', 'sprint stats'],
  generate(ctx: DocUpdateContext): string {
    const { metrics } = ctx.sprintResult;
    const { sprint } = ctx.sprintResult;
    const durationMin = Math.floor(metrics.durationMs / 60000);
    const durationSec = Math.floor((metrics.durationMs % 60000) / 1000);
    return [
      `| Metrik | Değer |`,
      `|--------|-------|`,
      `| Sprint | ${sprint.id} |`,
      `| Toplam Task | ${metrics.totalTasks} |`,
      `| Tamamlanan | ${metrics.completedTasks} |`,
      `| Tech Debt | ${metrics.techDebtTasks} |`,
      `| No-Go | ${metrics.noGoTasks} |`,
      `| Süre | ${durationMin}dk ${durationSec}sn |`,
      `| Coverage | ${metrics.coveragePercent.toFixed(1)}% |`,
    ].join('\n');
  },
});

// ─── Active Debt ──────────────────────────────────────────────────────────

register({
  patterns: ['active debt', 'tech debt', 'debt', 'teknik borç'],
  generate(ctx: DocUpdateContext): string {
    const debtPath = join(ctx.projectRoot, BRAIN_DIR, DEBT_FILE);
    if (!existsSync(debtPath)) return '_Teknik borç kaydı yok._';
    const content = readFileSync(debtPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---'));
    const openLines = lines.filter(l => {
      const cells = l.split('|').map(c => c.trim());
      // Open column (index 6) should be "Yes" or similar
      return cells[6]?.toLowerCase() === 'yes' || cells[6]?.toLowerCase() === 'evet';
    });
    if (openLines.length === 0) return '_Açık teknik borç yok._';
    // Return header + open items
    const header = lines[0] ?? '';
    return [header, '|---|---|---|---|---|---|---|---|---|', ...openLines.slice(0, 10)].join('\n');
  },
});

// ─── Sprint History ───────────────────────────────────────────────────────

register({
  patterns: ['sprint history', 'history', 'progress', 'sprint progress'],
  generate(ctx: DocUpdateContext): string {
    const sprintsDir = join(ctx.projectRoot, BRAIN_DIR, SPRINTS_DIR);
    if (!existsSync(sprintsDir)) return '_Sprint geçmişi yok._';

    const files = readdirSync(sprintsDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .slice(-5); // last 5 sprints

    if (files.length === 0) return '_Sprint geçmişi yok._';

    const rows: string[] = ['| Sprint | Durum |', '|--------|-------|'];
    for (const file of files) {
      const name = file.replace('.md', '');
      const content = readFileSync(join(sprintsDir, file), 'utf-8');
      const taskMatch = content.match(/(\d+)\s*\/\s*(\d+)/);
      const status = taskMatch ? `${taskMatch[1]}/${taskMatch[2]} task` : 'tamamlandı';
      rows.push(`| ${name} | ${status} |`);
    }
    return rows.join('\n');
  },
});

// ─── Agent Performance ────────────────────────────────────────────────────

register({
  patterns: ['agent performance', 'agents', 'agent stats'],
  generate(ctx: DocUpdateContext): string {
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

    const rows: string[] = ['| Agent | Tasks | Done | Başarı |', '|-------|-------|------|--------|'];
    for (const [agent, stats] of agentMap) {
      const rate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
      rows.push(`| ${agent} | ${stats.total} | ${stats.done} | ${rate}% |`);
    }
    return rows.join('\n');
  },
});

// ─── Changelog / Recent Changes ───────────────────────────────────────────

register({
  patterns: ['changelog', 'recent changes', 'changes', 'son değişiklikler'],
  generate(ctx: DocUpdateContext): string {
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
    return lines.length > 0 ? lines.join('\n') : '_Bu sprintte değişiklik yok._';
  },
});

// ─── Test Coverage ────────────────────────────────────────────────────────

register({
  patterns: ['test coverage', 'coverage', 'test stats'],
  generate(ctx: DocUpdateContext): string {
    const { metrics } = ctx.sprintResult;
    return [
      `| Metrik | Değer |`,
      `|--------|-------|`,
      `| Coverage | ${metrics.coveragePercent.toFixed(1)}% |`,
      `| No-Go Rate | ${(metrics.noGoRate * 100).toFixed(1)}% |`,
    ].join('\n');
  },
});

// ─── Module Map ───────────────────────────────────────────────────────────

register({
  patterns: ['module map', 'modules', 'module list'],
  generate(ctx: DocUpdateContext): string {
    const srcDir = join(ctx.projectRoot, 'src');
    if (!existsSync(srcDir)) return '_src/ dizini bulunamadı._';

    const dirs = readdirSync(srcDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const rows: string[] = ['| Modül | Dosya Sayısı |', '|-------|-------------|'];
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
  patterns: ['dependencies', 'deps', 'bağımlılıklar'],
  generate(ctx: DocUpdateContext): string {
    const pkgPath = join(ctx.projectRoot, 'package.json');
    if (!existsSync(pkgPath)) return '_package.json bulunamadı._';

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
      return lines.join('\n\n') || '_Bağımlılık yok._';
    } catch {
      return '_package.json okunamadı._';
    }
  },
});
