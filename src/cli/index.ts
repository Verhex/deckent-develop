import { Command } from 'commander';
import { DECKENT_VERSION } from '../core/constants.js';
import { buildVersionString, buildVersionJson } from './version-info.js';
import { registerInit } from './commands/init.js';
import { registerStart } from './commands/start.js';
import { registerPlan } from './commands/plan.js';
import { registerStatus } from './commands/status.js';
import { registerAttach } from './commands/attach.js';
import { registerSpawn } from './commands/spawn.js';
import { registerKill } from './commands/kill.js';
import { registerRetro } from './commands/retro.js';
import { registerCleanup } from './commands/cleanup.js';
import { registerDoctor } from './commands/doctor.js';
import { registerConfig } from './commands/config.js';
import { registerHistory } from './commands/history.js';
import { registerPlugin } from './commands/plugin.js';
import { registerUpgrade } from './commands/upgrade.js';
import { registerOnboard } from './commands/onboard.js';
import { registerAnalyze } from './commands/analyze.js';
import { registerArchiveDebt } from './commands/archive-debt.js';
import { registerDashboard } from './commands/dashboard.js';
import { registerServe } from './commands/serve.js';
import { registerWeb } from './commands/web.js';
import { registerSync } from './commands/sync.js';
import { registerWatch } from './commands/watch.js';
import { registerRun } from './commands/run.js';
import { registerRuns } from './commands/runs.js';
import { registerProcess } from './commands/process.js';
import { registerTestRun } from './commands/test-run.js';
import { registerAgent } from './commands/agent.js';
import { registerSkill } from './commands/skill.js';
import { registerReview } from './commands/review.js';
import { registerFinalize } from './commands/finalize.js';
import { registerExplain } from './commands/explain.js';
import { registerSetDirectives } from './commands/set-directives.js';
import { registerConnect } from './commands/connect.js';
import { registerPlanNl } from './commands/plan-nl.js';
import { registerDo } from './commands/do.js';
import { registerHeartbeat } from './commands/heartbeat.js';
import { registerChat } from './commands/chat.js';
import { registerCheckpoint } from './commands/checkpoint.js';
import { registerDocs } from './commands/docs.js';
import { registerOutput } from './commands/output.js';
import { registerCostCommand } from './commands/cost.js';
import { registerRecall } from './commands/recall.js';
import { registerRemember } from './commands/remember.js';
import { registerMemory } from './commands/memory.js';
import { registerTraceExtract } from './commands/trace-extract.js';
import { registerResume } from './commands/resume.js';
import { registerHelp } from './commands/help.js';
import { registerNervous } from './commands/nervous.js';
import { registerConfigNervous } from './commands/config-nervous.js';
import { registerMode } from './commands/mode.js';
import { registerFeatures } from './commands/features.js';
import { registerTruth } from './commands/truth.js';
import { registerAudit } from './commands/audit.js';
import { registerAuditVerify } from './commands/audit-verify.js';
import { registerRecover } from './commands/recover.js';
import { registerModels } from './commands/models.js';
import { registerFlow } from './commands/flow.js';
import { registerRbac } from './commands/rbac.js';
import { registerEvolve } from './commands/evolve.js';
import { registerAutonomous } from './commands/autonomous.js';
import { registerAutonomousMission } from './commands/autonomous-mission.js';
import { registerBot } from './commands/bot.js';
import { registerGateway } from './commands/gateway.js';
import { registerMcp } from './commands/mcp.js';
import { registerResources } from './commands/resources.js';
import { registerUsage } from './commands/usage.js';
import { registerKpi } from './commands/kpi.js';
import { registerImage } from './commands/image.js';
import { registerLimits } from './commands/limits.js';
import { registerOpenRouterProbe } from './commands/openrouter-probe.js';
import { registerXverifyCommand } from './commands/xverify.js';
import { registerCuStatus } from './commands/cu-status.js';
import { showSplash } from './helpers/splash.js';
import { installFatalHandlers } from './helpers/error-handler.js';

/**
 * Build and configure the CLI program with all commands registered.
 * Does NOT call parseAsync — caller is responsible for parsing.
 *
 * Also installs top-level uncaughtException / unhandledRejection
 * handlers on first call (idempotent; skipped under vitest).
 */
export function buildProgram(): Command {
  installFatalHandlers();

  const program = new Command()
    .name('deckent')
    .description('AI agent orchestration system — your AI development team, orchestrated.')
    .addHelpText('after', '\nRun `deckent info` for a localized (TR/EN) quick-reference of common commands.\n')
    .showSuggestionAfterError(true)
    .option('-V, --version', 'output the version number with splash')
    .option('--version-json', 'output version info as JSON')
    .on('option:version', () => {
      console.log(showSplash(DECKENT_VERSION));
      console.log(`\n  ${buildVersionString(DECKENT_VERSION)}`);
      process.exit(0);
    })
    .on('option:version-json', () => {
      console.log(JSON.stringify(buildVersionJson(DECKENT_VERSION), null, 2));
      process.exit(0);
    });

  registerInit(program);
  registerStart(program);
  registerPlan(program);
  registerStatus(program);
  registerAttach(program);
  registerSpawn(program);
  registerKill(program);
  registerRetro(program);
  registerCleanup(program);
  registerDoctor(program);
  registerConfig(program);
  registerHistory(program);
  registerPlugin(program);
  registerUpgrade(program);
  registerOnboard(program);
  registerAnalyze(program);
  registerArchiveDebt(program);
  registerDashboard(program);
  registerServe(program);
  registerWeb(program);
  registerSync(program);
  registerWatch(program);
  registerRun(program);
  registerRuns(program);
  registerProcess(program);
  registerTestRun(program);
  registerAgent(program);
  registerSkill(program);
  registerReview(program);
  registerFinalize(program);
  registerExplain(program);
  registerSetDirectives(program);
  registerConnect(program);
  // TERM-6 (428-008, T6E): `plan-nl`/`do` are the ONLY two commands whose
  // action handlers branch on config.terminal.run_flow_v2 (see registerPlanNl
  // in plan-nl.ts / registerDo in do.ts — T6D/T6C, 428-007/428-006). That
  // routing lives entirely inside each command's own handler; this file only
  // registers the single command either way — no separate RunFlow-flavored
  // command is (or should be) added here. Flag-off keeps both byte-identical
  // to their pre-TERM-6 behavior. See docs/analysis/term-flow-unify-design-
  // 2026-07-11.md Sprint-6 row.
  registerPlanNl(program);
  registerDo(program);
  registerHeartbeat(program);
  registerChat(program);
  registerCheckpoint(program);
  registerDocs(program);
  registerOutput(program);
  registerCostCommand(program);
  registerRecall(program);
  registerRemember(program);
  registerMemory(program);
  registerTraceExtract(program);
  registerResume(program);
  registerNervous(program);
  registerConfigNervous(program);
  registerMode(program);
  registerFeatures(program);
  registerTruth(program);
  registerAudit(program);
  registerAuditVerify(program);
  registerRecover(program);
  registerModels(program);
  registerFlow(program);
  registerRbac(program);
  registerEvolve(program);
  registerAutonomous(program);
  registerAutonomousMission(program);
  registerBot(program);
  registerGateway(program);
  registerMcp(program);
  registerResources(program);
  registerUsage(program);
  registerKpi(program);
  registerImage(program);
  registerLimits(program);
  registerOpenRouterProbe(program);
  registerXverifyCommand(program);
  registerCuStatus(program);
  registerHelp(program);

  return program;
}
