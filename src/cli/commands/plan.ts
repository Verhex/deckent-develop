import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import { readContext } from '../../orchestra/brain.js';
import { collectOverrideWarnings } from '../../orchestra/sprint-planner.js';
import { generatePlanPreview } from '../../orchestra/plan-preview-service.js';
import {
  decideRunFlowPlan,
  planRunFlow,
  type PlanRunFlowResult,
  RunFlowPlanServiceError,
} from '../../orchestra/run-flow-plan-service.js';
import {
  inspectTaskArtifactsNoClobber,
  inspectStructuredCriteriaProjectionAdoption,
  publishTaskArtifactsNoClobber,
  type StructuredCriteriaProjectionAdoption,
  TaskArtifactProjectionError,
} from '../../orchestra/task-artifact-projection.js';
import { computeExecutionPlanDigestV4 } from '../../core/execution-plan-digest.js';
import { TaskStatus, type Sprint, type SprintSizeRecommendation } from '../../core/types.js';
import type { BrainPlanningMode, PlannerProof } from '../../core/types.js';
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
import type { ExecutionTopology } from '../../core/execution-topology.js';
import { normalizePlannerDependencies } from '../../orchestra/planner.js';
import {
  buildPlanPreviewCardLabels,
  formatScopeGateLines,
  formatTopologyLines,
} from '../repl/plan-preview-card.js';

export type RlFactory = () => {
  question: (q: string) => Promise<string>;
  close: () => void;
};

function directivePlanSummary(directives: string, projectName: string): string {
  const heading = directives
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.length > 0)
    ?.replace(/^#+\s*/, '')
    .trim();
  return heading || projectName;
}

function approvedTaskProjection(sprint: Sprint): Sprint {
  return {
    ...sprint,
    tasks: sprint.tasks.map(task => ({ ...task, status: TaskStatus.PENDING })),
  };
}

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
    .option('--force-scope', getMessage('plan.force_scope_option', 'en'))
    .option('--adopt-existing <sprintId>', getMessage('plan.adopt_existing_option', 'en'))
    .option('--expected-plan-digest <sha256>', getMessage('plan.expected_plan_digest_option', 'en'))
    .option('--expected-projection-digest <sha256>', getMessage('plan.expected_projection_digest_option', 'en'))
    .option(
      '--expected-canonical-projection-digest <sha256>',
      getMessage('plan.expected_canonical_projection_digest_option', 'en'),
    )
    .option('--adoption-actor <actorId>', getMessage('plan.adoption_actor_option', 'en'))
    .option('--adoption-justification <text>', getMessage('plan.adoption_justification_option', 'en'))
    .action(async (opts: {
      confirm?: boolean;
      yes?: boolean;
      structured?: boolean;
      dryRun?: boolean;
      interrogate?: boolean;
      forcePromptGate?: boolean;
      forceScope?: boolean;
      adoptExisting?: string;
      expectedPlanDigest?: string;
      expectedProjectionDigest?: string;
      expectedCanonicalProjectionDigest?: string;
      adoptionActor?: string;
      adoptionJustification?: string;
    }) => {
      const root = resolveProjectRoot();
      let lang = 'en';

      try {
        const config = await loadConfig(root);
        lang = config.language ?? 'en';

        // PLAN-W1 Bug 2: --yes is the non-interactive auto-approve switch. It must
        // never block on a prompt — treat it like --no-confirm for the interactive
        // gates (interrogation + final approval), but still plan as DRAFT so the
        // normal DRAFT → PENDING lifecycle runs (just without a human at the keyboard).
        const autoApprove = opts.yes === true;
        const dryRun = opts.dryRun === true;
        const adoptionRequested = typeof opts.adoptExisting === 'string';
        if (
          adoptionRequested
          && !dryRun
          && (
            !opts.expectedPlanDigest
            || !opts.expectedProjectionDigest
            || !opts.expectedCanonicalProjectionDigest
            || !opts.adoptionActor
            || !opts.adoptionJustification
          )
        ) {
          throw new Error(getMessage('plan.adoption_authority_required', lang));
        }

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

        const asDraft = opts.confirm !== false;

        const spinnerLabel = lang === 'tr' ? 'Planlanıyor…' : 'Planning…';
        const spinner = createSpinner(spinnerLabel);
        spinner.start();
        let sprint;
        let flowPlan: PlanRunFlowResult | undefined;
        let planDigest: string | undefined;
        let topology: ExecutionTopology | undefined;
        let adoptionInspection:
          | StructuredCriteriaProjectionAdoption<Sprint['tasks'][number]>
          | undefined;
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
            if (adoptionRequested) {
              const dependencyNormalization = normalizePlannerDependencies(sprint.tasks);
              if (dependencyNormalization.dropped.length > 0) {
                throw new Error(getMessage('plan.adoption_dependency_hold', lang));
              }
              const taskProjection = approvedTaskProjection(sprint);
              adoptionInspection = inspectStructuredCriteriaProjectionAdoption(
                root,
                opts.adoptExisting!,
                taskProjection.tasks,
              );
              sprint = {
                ...taskProjection,
                tasks: [...adoptionInspection.canonicalTasks],
              };
              const digest = computeExecutionPlanDigestV4(
                sprint,
                preview.planDigestContext,
              );
              planDigest = digest.digest;
              topology = digest.topology;
            } else {
              planDigest = preview.planDigest;
              topology = preview.topology;
            }
          } else {
            const projectName = config.projectName || basename(root);
            const flowId = adoptionRequested
              ? `adoption-${createHash('sha256').update([
                  opts.adoptExisting,
                  opts.expectedProjectionDigest,
                ].join('\0')).digest('hex').slice(0, 32)}`
              : randomUUID();
            const revision = 1;
            const planActor = adoptionRequested
              ? { id: opts.adoptionActor! }
              : { id: 'cli-operator' };
            flowPlan = await planRunFlow({
              projectRoot: root,
              config,
              recommendation,
              proposal: {
                flowId,
                tenant: 'local',
                project: projectName,
                actor: planActor,
                origin: 'cli',
                revision,
                intentSummary: directivePlanSummary(context.directives, projectName),
              },
              lineage: {
                tenantId: 'local',
                actor: planActor,
                origin: 'cli',
                correlationId: flowId,
                idempotencyKey: `plan:${flowId}:r${revision}`,
                sourceRef: 'DIRECTIVES.md',
              },
              source: {
                sourceKind: 'directives',
                brainContext: context,
              },
              previewOptions: {
                mode: planMode,
                acknowledgePromptGate: opts.forcePromptGate === true,
              },
              acknowledgeScopePaths: opts.forceScope === true,
              ...(adoptionRequested
                ? {
                    projectionAdoption: {
                      kind: 'structured-criteria-projection' as const,
                      sprintId: opts.adoptExisting!,
                      expectedPlanDigest: opts.expectedPlanDigest!,
                      expectedLegacyProjectionDigest: opts.expectedProjectionDigest!,
                      expectedCanonicalProjectionDigest:
                        opts.expectedCanonicalProjectionDigest!,
                      authorizedBy: planActor,
                      authorizedAt: new Date().toISOString(),
                      justification: opts.adoptionJustification!,
                    },
                  }
                : {}),
            });
            sprint = flowPlan.sprint;
            planDigest = flowPlan.planDigest;
            topology = flowPlan.preview.topology;
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
        const previewLabels = buildPlanPreviewCardLabels(lang);
        if (topology) {
          print('');
          for (const line of formatTopologyLines({
            topology,
            topologyGateResult: topology.verdict === 'block' ? 'fail' : 'pass',
          }, previewLabels)) {
            print(line);
          }
          if (topology.verdict === 'block') {
            process.exitCode = 1;
            return;
          }
        }
        if (flowPlan) {
          const scopeLines = formatScopeGateLines(flowPlan.preview, previewLabels);
          if (scopeLines.length > 0) {
            print('');
            for (const line of scopeLines) print(line);
          }
          if (flowPlan.preview.scopeGateResult === 'fail') {
            process.exitCode = 1;
            return;
          }
        }
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
        if (sprint.plannerProof) {
          print(getMessage('planning.proof', lang, {
            requested: sprint.plannerProof.requestedMode,
            actual: sprint.plannerProof.actualMode,
            call: sprint.plannerProof.call.attempted
              ? (sprint.plannerProof.call.succeeded ? 'succeeded' : 'failed')
              : 'not-attempted',
            reason: sprint.plannerProof.resolutionReason,
          }));
          const receiptRef = sprint.plannerProof.call.receiptRef;
          if (receiptRef) {
            print(getMessage('planning.receipt_ref', lang, {
              invocationId: receiptRef.invocationId,
              tenantId: receiptRef.tenantId,
              projectId: receiptRef.projectId,
            }));
          }
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
          if (adoptionInspection) {
            print(getMessage('plan.adoption_inspection_ready', lang, {
              sprintId: adoptionInspection.sprintId,
              count: String(adoptionInspection.canonicalTasks.length),
            }));
            print(JSON.stringify({
              sprintId: adoptionInspection.sprintId,
              planDigest,
              legacyProjectionDigest: adoptionInspection.legacyProjectionDigest,
              canonicalProjectionDigest: adoptionInspection.canonicalProjectionDigest,
              requiresMigration: adoptionInspection.requiresMigration,
              alreadyCanonical: adoptionInspection.alreadyCanonical,
            }));
          }
          return;
        }

        if (!flowPlan) {
          throw new Error('E_PLAN_DURABLE_RESULT_MISSING');
        }

        // Compatibility files are never a plan input or a pre-approval side
        // effect. Preflight the full approved projection before the approval
        // CAS, then publish it atomically/no-clobber only after that CAS wins.
        const taskProjection = approvedTaskProjection(sprint);
        if (flowPlan.projectionAdoption) {
          const inspected = inspectStructuredCriteriaProjectionAdoption(
            root,
            flowPlan.projectionAdoption.sprintId,
            taskProjection.tasks,
          );
          if (
            inspected.legacyProjectionDigest
              !== flowPlan.projectionAdoption.legacyProjectionDigest
            || inspected.canonicalProjectionDigest
              !== flowPlan.projectionAdoption.canonicalProjectionDigest
          ) {
            throw new RunFlowPlanServiceError('PROJECTION_ADOPTION_HOLD', {
              reason: 'pre_approval_projection_drift',
            });
          }
        } else {
          inspectTaskArtifactsNoClobber(root, taskProjection.tasks);
        }
        const publishTaskProjection = (): void => {
          if (flowPlan!.projectionAdoption) return;
          publishTaskArtifactsNoClobber(
            root,
            taskProjection.tasks,
            `plan:${flowPlan.flowId}:r${flowPlan.revision}`,
          );
        };
        const approve = (): void => {
          decideRunFlowPlan(root, flowPlan.flowId, {
            decision: 'approve',
            actor: flowPlan.projectionAdoption?.authorizedBy ?? { id: 'cli-operator' },
            acknowledgePromptGate: opts.forcePromptGate === true,
            acknowledgeScopePaths: opts.forceScope === true,
          });
        };

        // Approval flow for DRAFT tasks
        if (asDraft) {
          // PLAN-W1 Bug 2: --yes skips the interactive prompt and approves directly
          // (DRAFT → PENDING), so non-interactive callers (CI / pipe / MCP) don't get
          // EOF → false → tasks stranded in DRAFT.
          const confirmed = autoApprove ? true : await promptConfirm('Approve this plan?');
          if (confirmed) {
            approve();
            publishTaskProjection();
            print(getMessage('plan.approved', lang));
            if (flowPlan.projectionAdoption) {
              print(getMessage('plan.adoption_approved', lang, {
                sprintId: flowPlan.projectionAdoption.sprintId,
              }));
            }
            print(JSON.stringify({
              flowId: flowPlan.flowId,
              revision: flowPlan.revision,
              planDigest: flowPlan.planDigest,
            }));
          } else {
            decideRunFlowPlan(root, flowPlan.flowId, {
              decision: 'reject',
              actor: { id: 'cli-operator' },
            });
            print(getMessage('plan.rejected', lang));
          }
        } else {
          // --no-confirm retains its historical auto-approval semantics while
          // now producing the same durable exact snapshot as --yes.
          approve();
          publishTaskProjection();
          print(JSON.stringify({
            flowId: flowPlan.flowId,
            revision: flowPlan.revision,
            planDigest: flowPlan.planDigest,
          }));
        }
      } catch (error) {
        const surfacedError = error instanceof TaskArtifactProjectionError
          ? new Error(getMessage(
            error.code === 'TASK_ARTIFACT_ID_INVALID'
              ? 'plan.task_projection_invalid_id'
              : error.code === 'TASK_ARTIFACT_CONTENT_CONFLICT'
                ? 'plan.task_projection_conflict'
                : error.code === 'TASK_ARTIFACT_DIRECTORY_DRIFT'
                  ? 'plan.task_projection_directory_hold'
                  : 'plan.task_projection_durability_hold',
            lang,
            { taskId: String(error.details.taskId ?? 'unknown') },
          ), { cause: error })
          : error instanceof RunFlowPlanServiceError
            && error.code === 'PROJECTION_ADOPTION_HOLD'
            ? new Error(getMessage('plan.adoption_hold', lang, {
                reason: String(error.details.reason ?? error.code),
              }), { cause: error })
          : error;
        printError(surfacedError);
        const plannerProof = error instanceof Error
          ? (error as Error & { plannerProof?: PlannerProof }).plannerProof
          : undefined;
        if (plannerProof) {
          print(getMessage('planning.proof', lang, {
            requested: plannerProof.requestedMode,
            actual: plannerProof.actualMode,
            call: plannerProof.call.attempted
              ? (plannerProof.call.succeeded ? 'succeeded' : 'failed')
              : 'not-attempted',
            reason: plannerProof.resolutionReason,
          }));
          const receiptRef = plannerProof.call.receiptRef;
          if (receiptRef) {
            print(getMessage('planning.receipt_ref', lang, {
              invocationId: receiptRef.invocationId,
              tenantId: receiptRef.tenantId,
              projectId: receiptRef.projectId,
            }));
          }
        }
        process.exitCode = 1;
      }
    });
}
