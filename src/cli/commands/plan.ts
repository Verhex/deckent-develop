import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import {
  readContext, planSprint, confirmDraftTasks, cleanupDraftTasks,
} from '../../orchestra/brain.js';
import type { SprintSizeRecommendation } from '../../core/types.js';
import type { BrainPlanningMode } from '../../core/types.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { promptConfirm } from '../helpers/prompt.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import {
  buildInterrogationQuestions,
  applyInterrogationAnswers,
} from '../../core/directive-interrogator.js';
import type { InterrogationAnswer } from '../../core/directive-interrogator.js';

export type RlFactory = () => {
  question: (q: string) => Promise<string>;
  close: () => void;
};

/**
 * Run the pre-plan directive interrogation flow (PLAN-INT-1).
 * Asks structural challenge questions, collects answers, generates a revised DIRECTIVES
 * draft, and writes it to disk if the user approves.
 *
 * @param directivesPath - Absolute path to DIRECTIVES.md (for writing back)
 * @param directivesContent - Current DIRECTIVES.md content
 * @param lang - UI language ('en' | 'tr')
 * @param rlFactory - Injectable readline factory (default: real createInterface)
 * @param confirmFn - Injectable confirm prompt (default: promptConfirm)
 * @returns The final directives content (revised if approved, original otherwise)
 */
export async function runInterrogation(
  directivesPath: string,
  directivesContent: string,
  lang: string,
  rlFactory: RlFactory = () => createInterface({ input: process.stdin, output: process.stdout }),
  confirmFn: (question: string) => Promise<boolean> = promptConfirm,
): Promise<string> {
  const questions = buildInterrogationQuestions(directivesContent, { lang });

  print(getMessage('interrogate.intro', lang));

  const rl = rlFactory();
  const answers: InterrogationAnswer[] = [];

  try {
    for (const q of questions) {
      print(`\n[${q.category}] ${q.text}`);
      const answer = await rl.question('> ');
      answers.push({ id: q.id, answer: answer.trim() });
    }
  } finally {
    rl.close();
  }

  const validAnswers = answers.filter((a) => a.answer.length > 0);
  if (validAnswers.length === 0) return directivesContent;

  const draft = applyInterrogationAnswers(directivesContent, validAnswers);

  print(`\n${getMessage('interrogate.draft_header', lang)}\n`);
  print(draft);

  const confirmed = await confirmFn('Write revised DIRECTIVES.md and plan with this?');

  if (confirmed) {
    writeFileSync(directivesPath, draft, 'utf-8');
    return draft;
  }

  return directivesContent;
}

export function registerPlan(program: Command): void {
  program
    .command('plan')
    .description('Plan a sprint without executing it')
    .option('--no-confirm', 'Skip confirmation, auto-approve plan')
    .option('--structured', 'Force structured parsing (skip AI)')
    .option('--dry-run', 'Show plan without writing task files to disk')
    .option('--interrogate', 'Challenge directives with structural questions before planning')
    .action(async (opts: {
      confirm?: boolean;
      structured?: boolean;
      dryRun?: boolean;
      interrogate?: boolean;
    }) => {
      const root = resolveProjectRoot();

      try {
        const config = await loadConfig(root);
        const lang = config.language ?? 'en';

        // ─── Interrogation (PLAN-INT-1) ──────────────────────────────────
        // Run BEFORE readContext so planSprint sees the revised DIRECTIVES.md.
        // Skip silently if --no-confirm (non-interactive) or no DIRECTIVES content.
        const shouldInterrogate = opts.interrogate === true || config.plan?.interrogate === true;
        if (shouldInterrogate && opts.confirm !== false) {
          const directivesPath = join(root, 'DIRECTIVES.md');
          if (existsSync(directivesPath)) {
            const content = readFileSync(directivesPath, 'utf-8');
            if (content.trim()) {
              await runInterrogation(directivesPath, content, lang);
            }
          }
        }

        const context = readContext(root);

        // Provider bootstrap — follows start.ts pattern
        // For --dry-run, providers are optional (structured parse suffices)
        let planMode: BrainPlanningMode | undefined = opts.structured ? 'structured' : undefined;
        const dryRun = opts.dryRun === true;

        if (dryRun) {
          // --dry-run: force structured mode, no provider needed
          if (!planMode) {
            planMode = 'structured';
          }
        } else {
          try {
            await bootstrapProviders(config);
          } catch (bootErr) {
            // Provider bootstrap failed (no API key, etc.) — fall back to structured mode.
            // Sprint 224 task 224-001: log the actual error + brain_provider so the
            // user knows *why* AI mode was unavailable instead of a silent reason.
            const provider = config.brain_provider ?? 'unknown';
            const reason = bootErr instanceof Error ? bootErr.message : String(bootErr);
            // Only warn on an ACTUAL silent fallback (auto/ai mode → structured).
            // When the user explicitly passed --structured, a bootstrap failure
            // is expected/irrelevant (no AI needed) — staying structured is not a
            // surprise, so it must NOT print a warning (T-224-001 honesty applies
            // to the silent-auto-fallback, not the explicit-structured choice).
            if (!planMode) {
              print(
                `[warn] Provider bootstrap failed (provider=${provider}): ${reason} — ` +
                `falling back to structured mode.`,
              );
              planMode = 'structured';
            }
          }
        }

        const recommendation: SprintSizeRecommendation = {
          size: 'full',
          maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
          modelConstraint: null,
          reason: 'No usage constraints',
        };

        // Clean up existing DRAFT tasks before planning (idempotency)
        cleanupDraftTasks(root);

        const asDraft = opts.confirm !== false;

        const sprint = await planSprint(root, config, context, recommendation, {
          mode: planMode,
          asDraft,
          dryRun,
        });

        print(getMessage('plan.sprint_planned', lang, {
          number: String(sprint.number),
          id: sprint.id,
          count: String(sprint.tasks.length),
        }));
        const headers = ['ID', 'Title', 'Model', 'Priority'];
        const rows = sprint.tasks.map((t) => [t.id, t.title, t.model, t.priority]);
        print(formatTable(headers, rows));

        if (sprint.reasoning) {
          print(getMessage('plan.reasoning', lang, { reasoning: sprint.reasoning }));
        }
        if (sprint.planningMode) {
          print(getMessage('plan.planning_mode', lang, { mode: sprint.planningMode }));
        }

        if (recommendation.size !== 'full') {
          print(getMessage('plan.note_sprint_size', lang, {
            size: recommendation.size,
            reason: recommendation.reason,
          }));
        }

        if (dryRun) {
          print('[dry-run] No task files written to disk.');
          return;
        }

        // Approval flow for DRAFT tasks
        if (asDraft) {
          const confirmed = await promptConfirm('Approve this plan?');
          if (confirmed) {
            await confirmDraftTasks(root, sprint);
            print(getMessage('plan.approved', lang));
          } else {
            print(getMessage('plan.rejected', lang));
          }
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
