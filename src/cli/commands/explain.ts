import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, MEMORY_DB_FILE, DECISIONS_LOG_DIR } from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';
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
 * (F/G) Uses tolerant regex for header and table formats.
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

  // (G) Tolerant heading: "# sprint-042", "# Sprint 042", "# Sprint-042", "## sprint-042" etc.
  const headingMatch = content.match(/^#{1,3}\s+(?:Sprint[-\s]?)?(\d+)/im);
  if (headingMatch?.[1]) {
    summary.sprintNumber = parseInt(headingMatch[1], 10);
  }

  // (F) Tolerant metrics table — allow extra whitespace, case-insensitive
  const totalMatch = content.match(/\|\s*Total\s+Tasks?\s*\|\s*(\d+)\s*\|/i);
  if (totalMatch?.[1]) summary.totalTasks = parseInt(totalMatch[1], 10);

  // Also handle "Tasks completed: X/Y" format from sprint-reporter
  const tasksCompletedMatch = content.match(/\|\s*Tasks\s+completed\s*\|\s*(\d+)\s*\/\s*(\d+)\s*\|/i);
  if (tasksCompletedMatch) {
    summary.completed = parseInt(tasksCompletedMatch[1] ?? '0', 10);
    if (summary.totalTasks === 0) {
      summary.totalTasks = parseInt(tasksCompletedMatch[2] ?? '0', 10);
    }
  } else {
    const completedMatch = content.match(/\|\s*Completed\s*\|\s*(\d+)\s*\|/i);
    if (completedMatch?.[1]) summary.completed = parseInt(completedMatch[1], 10);
  }

  const debtMatch = content.match(/\|\s*Tech\s+Debt\s*\|\s*(\d+)\s*\|/i);
  if (debtMatch?.[1]) summary.techDebt = parseInt(debtMatch[1], 10);

  const nogoMatch = content.match(/\|\s*No[-\s]?Go\s*\|\s*(\d+)\s*\|/i);
  if (nogoMatch?.[1]) summary.noGo = parseInt(nogoMatch[1], 10);

  // Also parse NO_GO rate format: "| NO_GO rate | 0% (0/5) |"
  const noGoRateMatch = content.match(/\|\s*NO_GO\s+rate\s*\|[^|]*\((\d+)\/\d+\)\s*\|/i);
  if (noGoRateMatch?.[1] && summary.noGo === 0) {
    summary.noGo = parseInt(noGoRateMatch[1], 10);
  }

  // (F) Duration: allow "ms" suffix or "5m 3s" format
  const durationMsMatch = content.match(/\|\s*Duration\s*\|\s*(\d+)\s*ms\s*\|/i);
  if (durationMsMatch?.[1]) {
    summary.durationMs = parseInt(durationMsMatch[1], 10);
  } else {
    // Try "Sprint time | 5m 3s |" format → convert to ms
    const sprintTimeMatch = content.match(/\|\s*Sprint\s+time\s*\|\s*(\d+)m\s+(\d+)s\s*\|/i);
    if (sprintTimeMatch) {
      const mins = parseInt(sprintTimeMatch[1] ?? '0', 10);
      const secs = parseInt(sprintTimeMatch[2] ?? '0', 10);
      summary.durationMs = (mins * 60 + secs) * 1000;
    }
  }

  // Parse tasks section — bullet list items
  const taskLines = content.match(/^[-*]\s+.+$/gm);
  if (taskLines) {
    summary.tasks = taskLines.map((line) => line.replace(/^[-*]\s+/, ''));
  }

  return summary;
}

/**
 * Load a sprint's retrospective content from the Memory V2 DB `retro` entry.
 * B8: retros live in memory.db (no `.brain/RETRO.md` file). Falls back to the
 * most recent retro when the requested sprint has no entry.
 */
function loadRetroContentForSprint(root: string, sprintNumber: number): string | null {
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return null;
  try {
    const store = new MemoryStore(dbPath);
    try {
      if (sprintNumber > 0) {
        const entry = store.getById(`retro-sprint-${sprintNumber}`);
        if (entry) return entry.content;
      }
      const retros = store.getByType('retro')
        .sort((a, b) => (b.sprint_num ?? 0) - (a.sprint_num ?? 0));
      return retros[0]?.content ?? null;
    } finally {
      store.close();
    }
  } catch {
    return null;
  }
}

/**
 * Parse the learnings section from a retrospective.
 * Extracts items under the "## Learnings" heading.
 * @param maxItems - Maximum items to return (default 3, pass Infinity for all)
 */
export function parseRetroLearnings(content: string, maxItems = 3): RetroLearnings {
  const result: RetroLearnings = { items: [] };

  // (F) Tolerant: allow extra whitespace around "Learnings" heading
  const learningsMatch = content.match(/##\s+Learnings\s*\r?\n([\s\S]*?)(?=\r?\n##|\r?\n*$)/i);
  if (!learningsMatch?.[1]) return result;

  const lines = learningsMatch[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.replace(/^- /, ''));

  result.items = maxItems === Infinity ? lines : lines.slice(0, maxItems);
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
  // (F) Tolerant: handle "# sprint-042", "# Sprint 042", "## Sprint-042" etc.
  const match = content.match(/^#{1,3}\s+(?:Sprint[-\s]?)?\d+[^\n]*\r?\n+([^\n#|]+)/im);
  const line = match?.[1]?.trim();
  if (!line || line.length === 0) return null;
  // Skip table lines (starting with |) — not a goal
  if (line.startsWith('|')) return null;
  return line;
}

// ─── Decision Log Display ──────────────────────────────────────────────────

/**
 * Build human-readable output for a task's routing decision log.
 * Reads from `<DECISIONS_LOG_DIR>/decision-<taskId>.json`.
 */
export function buildTaskDecisionOutput(taskId: string, root: string, lang = 'en'): string | null {
  const decisionPath = join(root, DECISIONS_LOG_DIR, `decision-${taskId}.json`);
  if (!existsSync(decisionPath)) return null;

  try {
    const raw = readFileSync(decisionPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      taskId: string;
      sprintId: string;
      steps: Array<{
        step: number;
        name: string;
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        reasoning: string;
      }>;
      decidedAt: string;
    };

    const lines: string[] = [];
    const header = lang === 'tr'
      ? `Task ${parsed.taskId} Routing Kararları (${parsed.sprintId})`
      : `Task ${parsed.taskId} Routing Decisions (${parsed.sprintId})`;
    lines.push(header);
    lines.push('\u2501'.repeat(header.length));
    lines.push('');

    // Show input from first step (task context)
    const firstStep = parsed.steps[0];
    if (firstStep?.input && Object.keys(firstStep.input).length > 0) {
      const inputLabel = lang === 'tr' ? 'Giriş:' : 'Input:';
      lines.push(inputLabel);
      if (firstStep.input.title) lines.push(`  Title: ${firstStep.input.title}`);
      if (firstStep.input.intent) lines.push(`  Intent: ${firstStep.input.intent}`);
      if (Array.isArray(firstStep.input.scope)) lines.push(`  Scope: ${(firstStep.input.scope as string[]).join(', ')}`);
      lines.push('');
    }

    // Show output from first step (routing result)
    if (firstStep?.output && Object.keys(firstStep.output).length > 0) {
      const outputLabel = lang === 'tr' ? 'Sonuç:' : 'Result:';
      lines.push(outputLabel);
      if (firstStep.output.agent) lines.push(`  Agent: ${firstStep.output.agent}`);
      if (Array.isArray(firstStep.output.skills)) lines.push(`  Skills: ${(firstStep.output.skills as string[]).join(', ')}`);
      if (firstStep.output.confidence) lines.push(`  Confidence: ${firstStep.output.confidence}`);
      lines.push('');
    }

    // Show reasoning steps
    const stepsLabel = lang === 'tr' ? 'Routing Adımları:' : 'Routing Steps:';
    lines.push(stepsLabel);
    for (const step of parsed.steps) {
      const excluded = step.reasoning.toLowerCase().includes('excluded');
      const marker = excluded ? '\u2718' : '\u2714';
      lines.push(`  ${marker} ${step.reasoning}`);
    }

    lines.push('');
    const decidedLabel = lang === 'tr' ? 'Karar zamanı' : 'Decided at';
    lines.push(`${decidedLabel}: ${parsed.decidedAt}`);

    return lines.join('\n');
  } catch {
    return null;
  }
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
  allLearnings: { en: 'All learnings:', tr: 'Tüm öğrenmeler:' },
  taskDetails: { en: 'Task details:', tr: 'Görev detayları:' },
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
 * J) When verbose=true, shows ALL learnings and task details.
 */
export function buildExplainOutput(summary: SprintSummary, learnings: RetroLearnings, lang = 'en', verbose = false): string {
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
    // J) verbose: show "All learnings:" with all items; default: "Key learnings:" with max 3
    lines.push(verbose ? label('allLearnings', lang) : label('keyLearnings', lang));
    for (const item of learnings.items) {
      lines.push(`  \u2022 ${item}`);
    }
  }

  // J) verbose: show task details
  if (verbose && summary.tasks.length > 0) {
    lines.push('');
    lines.push(label('taskDetails', lang));
    for (const task of summary.tasks) {
      lines.push(`  \u2022 ${task}`);
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
    .option('--task <taskId>', 'Show routing decision log for a specific task (e.g. 146-001)')
    .option('--json', 'Output results as JSON')
    .option('--verbose', 'Show all learnings and full task details (default shows max 3 learnings)')
    .action((opts: { sprint?: string; task?: string; json?: boolean; verbose?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);

      // --task mode: show routing decision log for a specific task
      if (opts.task) {
        const output = buildTaskDecisionOutput(opts.task, root, lang);
        if (!output) {
          print(`No decision log found for task ${opts.task}`);
          return;
        }
        print(output);
        return;
      }

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

      const verbose = opts.verbose ?? false;

      // Load sprint learnings from the Memory V2 DB `retro` entry — B8.
      // J) verbose: load ALL learnings (no limit); default: max 3
      let learnings: RetroLearnings = { items: [] };
      const retroContent = loadRetroContentForSprint(root, summary.sprintNumber);
      if (retroContent) {
        try {
          learnings = parseRetroLearnings(retroContent, verbose ? Infinity : 3);
        } catch {
          // skip learnings if unparseable
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
          // J) include tasks when verbose mode used in JSON output
          ...(verbose ? { tasks: summary.tasks } : {}),
        };
        print(JSON.stringify(output, null, 2));
        return;
      }

      print(buildExplainOutput(summary, learnings, lang, verbose));
    });
}
