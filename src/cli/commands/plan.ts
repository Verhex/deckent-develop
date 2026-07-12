import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import {
  readContext, planSprint, confirmDraftTasks, cleanupDraftTasks,
} from '../../orchestra/brain.js';
import { collectOverrideWarnings } from '../../orchestra/sprint-planner.js';
import { generatePlanPreview } from '../../orchestra/plan-preview-service.js';
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
import { createSpinner } from './chat-spinner.js';

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
    .option('-y, --yes', 'Non-interactive: auto-approve the plan (DRAFT → PENDING) without prompting')
    .option('--structured', 'Force structured parsing (skip AI)')
    .option('--dry-run', 'Show plan without writing task files to disk')
    .option('--interrogate', 'Challenge directives with structural questions before planning')
    .option('--force-prompt-gate', 'Bypass the plan-time prompt-gate BLOCK (persona-capability mismatch)')
    .action(async (opts: {
      confirm?: boolean;
      yes?: boolean;
      structured?: boolean;
      dryRun?: boolean;
      interrogate?: boolean;
      forcePromptGate?: boolean;
    }) => {
      const root = resolveProjectRoot();

      try {
        const config = await loadConfig(root);
        const lang = config.language ?? 'en';

        // PLAN-W1 Bug 2: --yes is the non-interactive auto-approve switch. It must
        // never block on a prompt — treat it like --no-confirm for the interactive
        // gates (interrogation + final approval), but still plan as DRAFT so the
        // normal DRAFT → PENDING lifecycle runs (just without a human at the keyboard).
        const autoApprove = opts.yes === true;

        // ─── Interrogation (PLAN-INT-1) ──────────────────────────────────
        // Run BEFORE readContext so planSprint sees the revised DIRECTIVES.md.
        // Skip silently if --no-confirm / --yes (non-interactive) or no DIRECTIVES content.
        const shouldInterrogate = opts.interrogate === true || config.plan?.interrogate === true;
        if (shouldInterrogate && opts.confirm !== false && !autoApprove) {
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

        const spinnerLabel = lang === 'tr' ? 'Planlanıyor…' : 'Planning…';
        const spinner = createSpinner(spinnerLabel);
        spinner.start();
        let sprint;
        let planDigest: string | undefined;
        try {
          if (dryRun) {
            // --dry-run is already a pure preview (never writes task files) —
            // delegate to the shared plan-preview-service (TERM2 424-001)
            // instead of calling planSprint ad hoc, so CLI/MCP share one
            // real-plan-generation + digest code path.
            const preview = await generatePlanPreview(root, config, context, recommendation, {
              mode: planMode,
              acknowledgePromptGate: opts.forcePromptGate === true,
            });
            sprint = preview.sprint;
            planDigest = preview.planDigest;
          } else {
            sprint = await planSprint(root, config, context, recommendation, {
              mode: planMode,
              asDraft,
              dryRun,
              acknowledgePromptGate: opts.forcePromptGate === true,
            });
          }
        } finally {
          spinner.stop();
        }

        print(getMessage('plan.sprint_planned', lang, {
          number: String(sprint.number),
          id: sprint.id,
          count: String(sprint.tasks.length),
        }));
        const headers = ['ID', 'Title', 'Model', 'Priority'];
        const rows = sprint.tasks.map((t) => [t.id, t.title, t.model, t.priority]);
        print(formatTable(headers, rows));

        // OVERRIDE-WARNING-SURFACE (born-595 / 395-005): router-level
        // forceAgent/forceSkills semantic-mismatch warnings (routingMeta.overrideWarnings)
        // were previously only debugLog'd (DECKENT_DEBUG-gated) — invisible on every real
        // surface (sprint-391: 9/9 tasks carried one, none were seen). Advisory only; the
        // plan proceeds regardless. Placed before the --dry-run early-return below so
        // dry-run output carries the block too.
        const overrideWarnings = collectOverrideWarnings(sprint.tasks);
        if (overrideWarnings.length > 0) {
          print('');
          print(getMessage('plan.override_warnings_header', lang, { count: String(overrideWarnings.length) }));
          for (const w of overrideWarnings) {
            print(`  [${w.taskId}] ${w.message}`);
          }
        }

        // G-series prompt-gate surface (persona/decision-space). WARN findings are
        // advisory; an unacknowledged BLOCK (persona-capability mismatch) halts the
        // plan before the approval prompt, mirroring the cost/scope-gate UX.
        const gate = sprint.promptGate;
        if (gate && gate.findings.length > 0) {
          print('');
          print(getMessage('plan.prompt_gate_header', lang, { count: String(gate.findings.length) }));
          for (const f of gate.findings) {
            const tag = f.level === 'block' ? 'BLOCK' : 'WARN';
            print(`  [${tag}] ${f.taskId} · ${f.lint} (${f.agentId}): ${f.message}`);
            if (f.suggestion) print(`         → ${f.suggestion}`);
          }
          if (!gate.ok) {
            print('');
            printError(new Error(getMessage('plan.prompt_gate_blocked', lang, { count: String(gate.blockers.length) })));
            process.exitCode = 1;
            return;
          }
          if (gate.overrideApplied) {
            print(getMessage('plan.prompt_gate_override', lang, { count: String(gate.blockers.length) }));
          }
        }

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
          if (planDigest) {
            print(`[dry-run] Plan digest: ${planDigest}`);
          }
          return;
        }

        // Approval flow for DRAFT tasks
        if (asDraft) {
          // PLAN-W1 Bug 2: --yes skips the interactive prompt and approves directly
          // (DRAFT → PENDING), so non-interactive callers (CI / pipe / MCP) don't get
          // EOF → false → tasks stranded in DRAFT.
          const confirmed = autoApprove ? true : await promptConfirm('Approve this plan?');
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
