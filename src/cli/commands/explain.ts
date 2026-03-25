import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLangFromConfig } from '../helpers/config-reader.js';

/** Parsed sprint log data */
export interface SprintSummary {
  sprintNumber: number;
  totalTasks: number;
  completed: number;
  techDebt: number;
  noGo: number;
  durationMs: number;
  goal: string;
  tasks: string[];
}

/** Parsed retro learnings */
export interface RetroLearnings {
  items: string[];
}

/**
 * Find the latest sprint log filename from `.brain/sprints/`.
 * Sorts by filename descending and returns the first match.
 */
export function findLatestSprintLog(root: string): string | null {
  const sprintsDir = join(root, '.brain', 'sprints');
  if (!existsSync(sprintsDir)) return null;

  const files = readdirSync(sprintsDir)
    .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
    .sort()
    .reverse();

  return files[0] ?? null;
}

/**
 * Parse sprint number from filename like "sprint-042.md" → 42
 */
export function parseSprintNumber(filename: string): number {
  const match = filename.match(/sprint-(\d+)\.md$/);
  if (!match?.[1]) return 0;
  return parseInt(match[1], 10);
}

/**
 * Parse a sprint log markdown file into structured data.
 */
export function parseSprintLog(content: string): SprintSummary {
  const summary: SprintSummary = {
    sprintNumber: 0,
    totalTasks: 0,
    completed: 0,
    techDebt: 0,
    noGo: 0,
    durationMs: 0,
    goal: 'No goal recorded',
    tasks: [],
  };

  // Parse sprint number from heading: # sprint-042
  const headingMatch = content.match(/^#\s+sprint-(\d+)/m);
  if (headingMatch?.[1]) {
    summary.sprintNumber = parseInt(headingMatch[1], 10);
  }

  // Parse metrics table — each uses optional chaining for capture group
  const totalMatch = content.match(/\|\s*Total Tasks\s*\|\s*(\d+)\s*\|/);
  if (totalMatch?.[1]) summary.totalTasks = parseInt(totalMatch[1], 10);

  const completedMatch = content.match(/\|\s*Completed\s*\|\s*(\d+)\s*\|/);
  if (completedMatch?.[1]) summary.completed = parseInt(completedMatch[1], 10);

  const debtMatch = content.match(/\|\s*Tech Debt\s*\|\s*(\d+)\s*\|/);
  if (debtMatch?.[1]) summary.techDebt = parseInt(debtMatch[1], 10);

  const nogoMatch = content.match(/\|\s*No-Go\s*\|\s*(\d+)\s*\|/);
  if (nogoMatch?.[1]) summary.noGo = parseInt(nogoMatch[1], 10);

  const durationMatch = content.match(/\|\s*Duration\s*\|\s*(\d+)ms\s*\|/);
  if (durationMatch?.[1]) summary.durationMs = parseInt(durationMatch[1], 10);

  // Parse tasks section
  const taskLines = content.match(/^- .+$/gm);
  if (taskLines) {
    summary.tasks = taskLines.map((line) => line.replace(/^- /, ''));
  }

  return summary;
}

/**
 * Parse the learnings section from RETRO.md.
 * Extracts items under the "## Learnings" heading, max 3 items.
 */
export function parseRetroLearnings(content: string): RetroLearnings {
  const result: RetroLearnings = { items: [] };

  const learningsMatch = content.match(/## Learnings\n([\s\S]*?)(?=\n##|\n*$)/);
  if (!learningsMatch?.[1]) return result;

  const lines = learningsMatch[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.replace(/^- /, ''));

  result.items = lines.slice(0, 3);
  return result;
}

/**
 * Format duration from milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return 'unknown';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Extract goal from DIRECTIVES.md (first `## Goal:` line).
 */
export function extractGoalFromDirectives(root: string): string | null {
  const directivesPath = join(root, 'DIRECTIVES.md');
  if (!existsSync(directivesPath)) return null;
  try {
    const content = readFileSync(directivesPath, 'utf-8');
    const match = content.match(/^##\s*Goal[:\s]*(.+)$/m);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract goal from sprint log content (first non-empty line after heading).
 */
export function extractGoalFromSprintLog(content: string): string | null {
  const match = content.match(/^#\s+(?:Sprint\s+)?sprint-\d+[^\n]*\n+([^\n#]+)/m);
  const line = match?.[1]?.trim();
  if (!line || line.length === 0) return null;
  // Skip table lines (starting with |) — not a goal
  if (line.startsWith('|')) return null;
  return line;
}

/** i18n labels for explain output */
const EXPLAIN_LABELS: Record<string, Record<string, string>> = {
  summary: { en: 'Summary', tr: 'Özet' },
  goal: { en: 'Goal', tr: 'Hedef' },
  whatHappened: { en: 'What happened:', tr: 'Ne oldu:' },
  tasksCompleted: { en: 'tasks completed successfully', tr: 'görev başarıyla tamamlandı' },
  tasksFailed: { en: 'tasks failed (NO_GO)', tr: 'görev başarısız (NO_GO)' },
  tasksDebt: { en: 'tasks completed with tech debt', tr: 'görev teknik borçla tamamlandı' },
  duration: { en: 'Duration', tr: 'Süre' },
  keyLearnings: { en: 'Key learnings:', tr: 'Temel öğrenmeler:' },
  next: {
    en: 'Next: Run `deckent start` to continue, or `deckent plan` to see next sprint',
    tr: 'Sonraki: Devam etmek için `deckent start`, planlamak için `deckent plan` çalıştırın',
  },
  noGoal: { en: 'No goal recorded', tr: 'Hedef kaydedilmemiş' },
};

function label(key: string, lang: string): string {
  const entry = EXPLAIN_LABELS[key];
  if (!entry) return key;
  return entry[lang === 'tr' ? 'tr' : 'en'] ?? entry['en'] ?? key;
}

/**
 * Build the human-readable explain output string.
 */
export function buildExplainOutput(summary: SprintSummary, learnings: RetroLearnings, lang = 'en'): string {
  const lines: string[] = [];

  lines.push(`Sprint #${summary.sprintNumber} ${label('summary', lang)}`);
  lines.push('\u2501'.repeat(17));
  lines.push('');
  lines.push(`${label('goal', lang)}: ${summary.goal === 'No goal recorded' ? label('noGoal', lang) : summary.goal}`);
  lines.push('');
  lines.push(label('whatHappened', lang));

  const doneCount = summary.completed + summary.techDebt;
  lines.push(`  \u2022 ${doneCount} ${label('tasksCompleted', lang)}`);
  lines.push(`  \u2022 ${summary.noGo} ${label('tasksFailed', lang)}`);
  lines.push(`  \u2022 ${summary.techDebt} ${label('tasksDebt', lang)}`);

  if (summary.durationMs > 0) {
    lines.push(`  \u2022 ${label('duration', lang)}: ${formatDuration(summary.durationMs)}`);
  }

  if (learnings.items.length > 0) {
    lines.push('');
    lines.push(label('keyLearnings', lang));
    for (const item of learnings.items) {
      lines.push(`  \u2022 ${item}`);
    }
  }

  lines.push('');
  lines.push(label('next', lang));

  return lines.join('\n');
}

/**
 * Register the `deckent explain` command.
 * Reads the latest sprint log and RETRO.md to generate a human-readable summary.
 */
export function registerExplain(program: Command): void {
  program
    .command('explain')
    .description('Explain what the last sprint did in human-friendly language')
    .option('--sprint <id>', 'Show a specific sprint by ID (e.g. 042)')
    .option('--json', 'Output results as JSON')
    .action((opts: { sprint?: string; json?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);

      let sprintFile: string | null;
      if (opts.sprint) {
        const paddedId = opts.sprint.padStart(3, '0');
        const filename = `sprint-${paddedId}.md`;
        const filePath = join(root, '.brain', 'sprints', filename);
        if (!existsSync(filePath)) {
          print(`Sprint ${opts.sprint} not found`);
          return;
        }
        sprintFile = filename;
      } else {
        sprintFile = findLatestSprintLog(root);
      }

      if (!sprintFile) {
        print('No sprints found. Run `deckent start` to begin.');
        return;
      }

      const sprintPath = join(root, '.brain', 'sprints', sprintFile);
      const sprintContent = readFileSync(sprintPath, 'utf-8');
      const summary = parseSprintLog(sprintContent);

      // Use filename-based sprint number if heading parse failed
      if (summary.sprintNumber === 0) {
        summary.sprintNumber = parseSprintNumber(sprintFile);
      }

      // Goal extraction: DIRECTIVES.md → sprint log → fallback
      if (summary.goal === 'No goal recorded') {
        const directivesGoal = extractGoalFromDirectives(root);
        if (directivesGoal) {
          summary.goal = directivesGoal;
        } else {
          const logGoal = extractGoalFromSprintLog(sprintContent);
          if (logGoal) {
            summary.goal = logGoal;
          }
        }
      }

      // Read RETRO.md for learnings
      let learnings: RetroLearnings = { items: [] };
      const retroPath = join(root, '.brain', 'RETRO.md');
      if (existsSync(retroPath)) {
        try {
          const retroContent = readFileSync(retroPath, 'utf-8');
          learnings = parseRetroLearnings(retroContent);
        } catch {
          // skip learnings if unreadable
        }
      }

      if (opts.json) {
        const output: Record<string, unknown> = {
          sprintId: summary.sprintNumber,
          goal: summary.goal,
          metrics: {
            totalTasks: summary.totalTasks,
            completed: summary.completed,
            techDebt: summary.techDebt,
            noGo: summary.noGo,
            durationMs: summary.durationMs,
          },
          learnings: learnings.items,
        };
        print(JSON.stringify(output, null, 2));
        return;
      }

      print(buildExplainOutput(summary, learnings, lang));
    });
}
