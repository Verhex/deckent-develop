import type { Command } from 'commander';
import { loadConfig, readAuthMode } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import type { BootstrapResult } from '../../core/provider.js';
import {
  runSprint, readContext, planSprint,
  BrainError,
} from '../../orchestra/brain.js';
import type { SprintSizeRecommendation } from '../../core/types.js';
import { isSessionActive, setupWatchWindow } from '../../orchestra/tmux.js';
import { TMUX_SESSION_NAME } from '../../core/constants.js';
import { runDoctorChecks } from './doctor.js';
import { print, printError, formatSprintSummary, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { promptConfirm } from '../helpers/prompt.js';
import { bootstrapNotifyDispatcher } from '../../core/notify-bootstrap.js';
import { buildConnectorNotificationAdapter } from '../../connectors/connector-bootstrap.js';
import { buildBotHumanizer } from '../../connectors/bot-completion.js';
import { loadCostConfig, initCostConfig } from '../../core/cost-config-loader.js';
import { estimateSprintCost, formatEstimate, resolveBillingModeForAuth, type TaskCostInput } from '../../core/cost-calculator.js';
import { evaluateCostGate } from '../../core/cost-gate.js';
import { existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareZeroConfig, cleanupZeroConfig } from './quick-start.js';
import { isSprintLocked } from '../../core/multi-ide.js';
import { detectOrphan, archiveOrphan, listPidFiles } from '../../orchestra/sprint-pid-manager.js';

// ─── Provider Cache ───────────────────────────────────────────────

const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PROVIDER_CACHE_FILE = '.deckent/provider-cache.json';

interface ProviderCache {
  registered: string[];
  defaultProvider: string | null;
  cachedAt: string;
  configHash: string;
}

function makeConfigHash(config: { brain_provider?: string; worker_provider?: string; fallback_provider?: string }): string {
  return [config.brain_provider ?? '', config.worker_provider ?? '', config.fallback_provider ?? ''].join('|');
}

export function readProviderCache(projectRoot: string): ProviderCache | null {
  try {
    const raw = readFileSync(join(projectRoot, PROVIDER_CACHE_FILE), 'utf-8');
    return JSON.parse(raw) as ProviderCache;
  } catch {
    return null;
  }
}

export function writeProviderCache(projectRoot: string, result: BootstrapResult, configHash: string): void {
  try {
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    const cache: ProviderCache = {
      registered: result.registered,
      defaultProvider: result.defaultProvider,
      cachedAt: new Date().toISOString(),
      configHash,
    };
    writeFileSync(join(projectRoot, PROVIDER_CACHE_FILE), JSON.stringify(cache, null, 2), 'utf-8');
  } catch { /* non-fatal */ }
}

export function isProviderCacheFresh(cache: ProviderCache, configHash: string): boolean {
  if (cache.configHash !== configHash) return false;
  const cachedAt = new Date(cache.cachedAt).getTime();
  return Date.now() - cachedAt < PROVIDER_CACHE_TTL_MS;
}

// ─── Sandbox Mode Helpers ─────────────────────────────────────────

export interface SandboxState {
  stashRef: string | null;
  applied: boolean;
}

/**
 * Apply a git stash to create a sandbox state.
 * Returns the stash ref if successful, or null if nothing to stash.
 */
export function applySandbox(projectRoot: string): SandboxState {
  try {
    const result = spawnSync('git', ['stash', '--include-untracked', '--message', 'deckent-sandbox'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    if (result.status === 0 && result.stdout.includes('Saved')) {
      return { stashRef: 'stash@{0}', applied: true };
    }
  } catch { /* ignore */ }
  return { stashRef: null, applied: false };
}

/**
 * Restore from sandbox: git stash pop to undo sandbox changes.
 */
export function restoreSandbox(projectRoot: string, state: SandboxState): void {
  if (!state.applied || !state.stashRef) return;
  try {
    // First, reset any changes made during sandbox sprint
    spawnSync('git', ['checkout', '--', '.'], { cwd: projectRoot, encoding: 'utf-8' });
    // Then restore original stash
    spawnSync('git', ['stash', 'pop'], { cwd: projectRoot, encoding: 'utf-8' });
  } catch { /* non-fatal */ }
}

// ─── Watch Subprocess Log Helper ─────────────────────────────────

/**
 * Display subprocess worker logs (for non-tmux providers).
 * Tails all .tasks/*.log files and prints new lines as they appear.
 * Returns a cleanup function.
 */
export function watchSubprocessLogs(projectRoot: string, intervalMs = 2000): () => void {
  const tasksDir = join(projectRoot, '.tasks');
  const seen = new Map<string, number>(); // file -> last byte offset

  const tick = (): void => {
    if (!existsSync(tasksDir)) return;
    try {
      const logFiles = readdirSync(tasksDir).filter(f => f.endsWith('.log'));
      for (const file of logFiles) {
        const filePath = join(tasksDir, file);
        try {
          const content = readFileSync(filePath, 'utf-8');
          const lastOffset = seen.get(file) ?? 0;
          if (content.length > lastOffset) {
            const newContent = content.slice(lastOffset);
            process.stdout.write(`[${file.replace('.log', '')}] ${newContent}`);
            seen.set(file, content.length);
          }
        } catch { /* ignore per-file errors */ }
      }
    } catch { /* ignore */ }
  };

  const interval = setInterval(tick, intervalMs);
  return () => clearInterval(interval);
}

interface StartCommandOpts {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  dryRun?: boolean;
  force?: boolean;
  watch?: boolean;
  timeout?: string;
  forceDirectives?: boolean;
}

export function registerStart(program: Command): void {
  program
    .command('start [description]')
    .description('Start a new sprint (optionally with a one-line description for zero-config mode)')
    .option('--auto-approve', 'Auto-approve worker actions (--dangerously-skip-permissions)')
    .option('--sandbox-mode', 'Run in sandbox mode (git stash + restore)')
    .option('--dry-run', 'Plan sprint without spawning workers')
    .option('--force', 'Skip doctor pre-flight checks')
    .option('--watch', 'Automatically open watch mode after sprint spawns workers')
    .option('--timeout <ms>', 'Sprint timeout in milliseconds (default: 30 minutes)')
    .option('--force-directives', 'Override existing DIRECTIVES.md in zero-config mode')
    .action(async (description: string | undefined, opts: StartCommandOpts) => {
      const root = resolveProjectRoot();

      // ─── Zero-Config Mode ────────────────────────────────────────
      let zeroConfigResult: ReturnType<typeof prepareZeroConfig> | null = null;

      let warnDirectivesExist = false;

      if (description) {
        // --force-directives: remove existing DIRECTIVES.md so zero-config overwrites it
        if (opts.forceDirectives) {
          const dirPath = join(root, 'DIRECTIVES.md');
          if (existsSync(dirPath)) unlinkSync(dirPath);
        }
        zeroConfigResult = prepareZeroConfig(root, description);
        if (zeroConfigResult.alreadyExisted) {
          warnDirectivesExist = true;
          // Don't create temp file — use existing DIRECTIVES.md as-is
          zeroConfigResult = null;
        }
      }

      // ─── Sandbox State ───────────────────────────────────────────
      let sandboxState: SandboxState | null = null;

      try {
        const config = await loadConfig(root);
        const lang = config.language;

        // ─── Provider Bootstrap (with cache) ─────────────────────
        const configHash = makeConfigHash(config);
        const existingCache = readProviderCache(root);
        let bootstrap: BootstrapResult;

        if (existingCache && isProviderCacheFresh(existingCache, configHash)) {
          // Cache is fresh — bootstrap still runs but we can note providers are known
          bootstrap = await bootstrapProviders(config);
        } else {
          bootstrap = await bootstrapProviders(config);
          writeProviderCache(root, bootstrap, configHash);
        }

        if (description && !warnDirectivesExist && zeroConfigResult) {
          print(getMessage('start.zero_config_created', lang, { description }));
        }

        if (warnDirectivesExist) {
          print(getMessage('start.zero_config_directives_exist', lang));
        }

        if (opts.sandboxMode) {
          // Git stash + restore sandbox mechanism
          sandboxState = applySandbox(root);
          if (sandboxState.applied) {
            print('Sandbox mode: stashed local changes. Will restore after sprint.');
          } else {
            print('Sandbox mode: no changes to stash. Running sprint on clean state.');
          }
          // Continue with sprint in sandbox mode (does not abort)
        }

        // ─── Orphan Detection (Sprint 135 — coordinator resilience) ──
        if (!opts.force) {
          // Check all PID files for orphaned sprints
          const pidSprintIds = listPidFiles(root);
          // Also check last_sprint_id from config
          const lastSprintId = (config as unknown as Record<string, unknown>).last_sprint_id as string | undefined;
          if (lastSprintId && !pidSprintIds.includes(lastSprintId)) {
            pidSprintIds.push(lastSprintId);
          }
          for (const sid of pidSprintIds) {
            const orphan = detectOrphan(root, sid);
            if (orphan) {
              if (opts.autoApprove) {
                // Auto-archive: move orphan artifacts to .brain/archive/
                archiveOrphan(root, orphan);
                print(`Orphan sprint ${sid} (PID ${orphan.pid}) auto-archived.`);
              } else {
                printError(new Error(
                  `Orphan sprint detected: ${sid} (PID ${orphan.pid} is dead). ` +
                  'Run with --auto-approve to auto-archive, or use --force to skip this check.',
                ));
                if (sandboxState) restoreSandbox(root, sandboxState);
                process.exitCode = 2;
                return;
              }
            }
          }
        }

        // ─── Sprint Lock Check ─────────────────────────────────────
        if (!opts.force) {
          const lockInfo = isSprintLocked(root);
          if (lockInfo.locked) {
            if (sandboxState) restoreSandbox(root, sandboxState);
            printError(new Error(
              `Sprint already running (PID ${lockInfo.pid}, env: ${lockInfo.env}, sprint: ${lockInfo.sprintId}, started: ${lockInfo.acquiredAt}). Use --force to override.`
            ));
            process.exitCode = 1;
            return;
          }
        }

        // Pre-flight doctor check (unless --force)
        if (!opts.force) {
          const spawnBackend = (config as unknown as Record<string, unknown>).spawn_backend as string | undefined;
          const doctorResult = runDoctorChecks(root, undefined, spawnBackend);
          const requiredFailed = doctorResult.checks.filter(c => c.required && !c.passed);
          if (requiredFailed.length > 0) {
            if (sandboxState) restoreSandbox(root, sandboxState);
            printError(new Error(`Pre-flight failed: ${requiredFailed.map(c => `${c.name}: ${c.message}`).join('; ')}`));
            print(getMessage('start.use_force', lang));
            process.exitCode = 1;
            return;
          }
        }

        // WIRE-002 (MASTER-PLAN §4G): wire DECKENT→USER:NOTIFY to this terminal.
        // Pure-CLI sprints previously had a null global dispatcher, so every
        // notify() (task-done, sprint-finalized, human-checkpoint-required) was
        // a silent no-op. Bootstrap once the command is committed to running so
        // lifecycle notifications reach the operator + .deckent/notify-log.jsonl.
        // BOT-001: also fan notifications out to configured messaging connectors
        // (Telegram/Discord) so they reach the operator's phone. Fail-safe — a
        // misconfigured connector logs + skips, never blocks the sprint.
        const connectorAdapter = await buildConnectorNotificationAdapter(
          config.notify_connectors, {}, buildBotHumanizer(config as unknown as Record<string, unknown>),
        );
        bootstrapNotifyDispatcher({
          projectRoot: root,
          extraAdapters: connectorAdapter ? [connectorAdapter] : [],
        });

        // Dry-run mode: plan only, no spawn
        if (opts.dryRun) {
          if (opts.watch) {
            print(getMessage('start.watch_ignored_dry_run', lang));
          }
          const context = readContext(root);
          const recommendation: SprintSizeRecommendation = {
            size: 'full',
            maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
            modelConstraint: null,
            reason: 'No usage constraints',
          };
          const sprint = await planSprint(root, config, context, recommendation);

          print(getMessage('start.sprint_planned', lang, {
            number: String(sprint.number),
            id: sprint.id,
            count: String(sprint.tasks.length),
          }));
          const headers = ['ID', 'Title', 'Model', 'Priority'];
          const rows = sprint.tasks.map(t => [t.id, t.title, t.model, t.priority]);
          print(formatTable(headers, rows));
          if (sprint.reasoning) {
            print(getMessage('start.reasoning', lang, { reasoning: sprint.reasoning }));
          }
          if (sprint.planningMode) {
            print(getMessage('start.planning_mode', lang, { mode: sprint.planningMode }));
          }
          print(getMessage('start.workers_info', lang, {
            count: String(sprint.tasks.length),
            model: config.activeModeConfig.brain_model,
          }));

          // ─── COST ESTIMATE (User Safety Shield — Sprint 141) ──────
          try {
            initCostConfig(root);
            const costConfig = loadCostConfig(root);
            const cfgAuthMode = await readAuthMode(root);
            const costTasks: TaskCostInput[] = sprint.tasks.map((t) => ({
              id: t.id,
              model: t.model,
              estimatedInputTokens: t.estimatedTokens ?? 2700,
              estimatedOutputTokens: t.effort === 'high' ? 4000 : t.effort === 'low' ? 500 : 1500,
              effort: t.effort as 'low' | 'normal' | 'high' | undefined,
              // F1-CB: billing follows effective auth — subscription/local tasks cost $0
              billingMode: resolveBillingModeForAuth(t.provider, t.authMode ?? cfgAuthMode),
            }));
            const estimate = estimateSprintCost(costTasks, costConfig);
            print(formatEstimate(estimate));
          } catch (err) {
            print(`⚠ Cost estimate unavailable: ${err instanceof Error ? err.message : String(err)}`);
          }

          print(getMessage('start.dry_run_complete', lang));
          return;
        }

        // ─── PRE-SPRINT COST GATE (User Safety Shield — Sprint 141) ─
        // Runs before spawn — prevents Sprint 140 $42 disaster from repeating.
        // Sprint 189 Task 189-008: shared evaluateCostGate() helper — same
        // logic now drives the MCP deckent_start path.
        if (!opts.force) {
          try {
            initCostConfig(root);
            const costConfig = loadCostConfig(root);
            const context = readContext(root);
            const recommendation: SprintSizeRecommendation = {
              size: 'full',
              maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
              modelConstraint: null,
              reason: 'Cost gate pre-plan',
            };
            const planForCost = await planSprint(root, config, context, recommendation);
            const cfgAuthMode = await readAuthMode(root);
            const costTasks: TaskCostInput[] = planForCost.tasks.map((t) => ({
              id: t.id,
              model: t.model,
              estimatedInputTokens: t.estimatedTokens ?? 2700,
              estimatedOutputTokens: t.effort === 'high' ? 4000 : t.effort === 'low' ? 500 : 1500,
              effort: t.effort as 'low' | 'normal' | 'high' | undefined,
              // F1-CB: billing follows effective auth — subscription/local tasks cost $0
              billingMode: resolveBillingModeForAuth(t.provider, t.authMode ?? cfgAuthMode),
            }));
            const gate = evaluateCostGate({ tasks: costTasks, costConfig });
            print(formatEstimate(gate.estimate));

            if (!gate.ok) {
              if (sandboxState) restoreSandbox(root, sandboxState);
              printError(new Error(gate.message + ' (CLI: override with --force.)'));
              process.exitCode = 1;
              return;
            }

            // Auto-confirm threshold
            if (!gate.autoConfirm) {
              const confirmed = await promptConfirm(
                `\nProceed with sprint at ~$${gate.estimate.costRealistic.toFixed(2)}?`,
                false,
              );
              if (!confirmed) {
                print('Sprint cancelled by user.');
                if (sandboxState) restoreSandbox(root, sandboxState);
                return;
              }
            }
          } catch (err) {
            print(`⚠ Cost gate unavailable (proceeding anyway): ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Set up watch window before runSprint blocks
        let stopSubprocessWatch: (() => void) | null = null;
        if (opts.watch) {
          if (isSessionActive()) {
            setupWatchWindow(TMUX_SESSION_NAME, root);
            print(getMessage('start.watch_window_created', lang));
          } else {
            // Subprocess alternative: tail .tasks/*.log files
            print('No tmux session — watching subprocess worker logs...');
            stopSubprocessWatch = watchSubprocessLogs(root);
          }
        }

        const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : undefined;
        let sprintResult;
        try {
          sprintResult = await runSprint(root, config, {
            connector: bootstrap.connector,
            autoApprove: true, // Deckent standard: workers MUST have full write permissions
            sandboxMode: opts.sandboxMode,
            timeoutMs,
          });
        } finally {
          if (stopSubprocessWatch) stopSubprocessWatch();
        }
        print(formatSprintSummary(sprintResult));

        // Compact completion notification with agent breakdown
        const sm = sprintResult.metrics;
        if (sm) {
          const totalSec = Math.round(sm.durationMs / 1000);
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          const dur = mins > 0 ? `${mins}dk ${secs}sn` : `${secs}sn`;
          const agentMap: Record<string, number> = {};
          for (const t of sprintResult.tasks) {
            const a = t.assignedAgent ?? 'generic';
            agentMap[a] = (agentMap[a] ?? 0) + 1;
          }
          const agentStr = Object.entries(agentMap).map(([a, c]) => `${a}(${c})`).join(', ');
          const completed = sm.completedTasks; // DONE + GO_WITH_TECH_DEBT
          const donePure = completed - sm.techDebtTasks;
          const debt = sm.techDebtTasks;
          const noGo = sm.noGoTasks;
          print('');
          print(`✅ Sprint ${sprintResult.id} tamamlandı (${dur})`);
          print(`   ${completed}/${sm.totalTasks} task: ${donePure} DONE, ${debt} TECH_DEBT, ${noGo} NO_GO`);
          print(`   Agent: ${agentStr}`);
        }
      } catch (error) {
        if (error instanceof BrainError) {
          printError(new Error(`Sprint failed at phase ${error.phase ?? 'unknown'}: ${error.message}`));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      } finally {
        // Always clean up temp DIRECTIVES.md (moved from try/catch to finally)
        if (zeroConfigResult) cleanupZeroConfig(zeroConfigResult);
        // Restore sandbox state if applied
        if (sandboxState) restoreSandbox(root, sandboxState);
      }
    });
}
