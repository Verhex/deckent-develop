import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

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
 * Build the human-readable explain output string.
 */
export function buildExplainOutput(summary: SprintSummary, learnings: RetroLearnings): string {
  const lines: string[] = [];

  lines.push(`Sprint #${summary.sprintNumber} Summary`);
  lines.push('\u2501'.repeat(17));
  lines.push('');
  lines.push(`Goal: ${summary.goal}`);
  lines.push('');
  lines.push('What happened:');

  const doneCount = summary.completed + summary.techDebt;
  lines.push(`  \u2022 ${doneCount} tasks completed successfully`);
  lines.push(`  \u2022 ${summary.noGo} tasks failed (NO_GO)`);
  lines.push(`  \u2022 ${summary.techDebt} tasks completed with tech debt`);

  if (summary.durationMs > 0) {
    lines.push(`  \u2022 Duration: ${formatDuration(summary.durationMs)}`);
  }

  if (learnings.items.length > 0) {
    lines.push('');
    lines.push('Key learnings:');
    for (const item of learnings.items) {
      lines.push(`  \u2022 ${item}`);
    }
  }

  lines.push('');
  lines.push('Next: Run `deckent start` to continue, or `deckent plan` to see next sprint');

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
    .action(() => {
      const root = resolveProjectRoot();
      const latestFile = findLatestSprintLog(root);

      if (!latestFile) {
        print('No sprints found. Run `deckent start` to begin.');
        return;
      }

      const sprintPath = join(root, '.brain', 'sprints', latestFile);
      const sprintContent = readFileSync(sprintPath, 'utf-8');
      const summary = parseSprintLog(sprintContent);

      // Use filename-based sprint number if heading parse failed
      if (summary.sprintNumber === 0) {
        summary.sprintNumber = parseSprintNumber(latestFile);
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

      print(buildExplainOutput(summary, learnings));
    });
}
