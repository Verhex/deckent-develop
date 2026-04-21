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
import { registerTestRun } from './commands/test-run.js';
import { registerAgent } from './commands/agent.js';
import { registerSkill } from './commands/skill.js';
import { registerReview } from './commands/review.js';
import { registerFinalize } from './commands/finalize.js';
import { registerExplain } from './commands/explain.js';
import { registerSetDirectives } from './commands/set-directives.js';
import { registerHeartbeat } from './commands/heartbeat.js';
import { registerCheckpoint } from './commands/checkpoint.js';
import { registerDocs } from './commands/docs.js';
import { registerOutput } from './commands/output.js';
import { registerCostCommand } from './commands/cost.js';
import { registerRecall } from './commands/recall.js';
import { registerRemember } from './commands/remember.js';
import { registerMemory } from './commands/memory.js';
import { registerResume } from './commands/resume.js';
import { registerHelp } from './commands/help.js';
import { registerNervous } from './commands/nervous.js';
import { registerConfigNervous } from './commands/config-nervous.js';
import { registerMode } from './commands/mode.js';
import { registerFeatures } from './commands/features.js';
import { registerAudit } from './commands/audit.js';
import { registerRecover } from './commands/recover.js';
import { showSplash } from './helpers/splash.js';

/**
 * Build and configure the CLI program with all commands registered.
 * Does NOT call parseAsync — caller is responsible for parsing.
 */
export function buildProgram(): Command {
  const program = new Command()
    .name('deckent')
    .description('AI agent orchestration system — your AI development team, orchestrated.')
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
  registerTestRun(program);
  registerAgent(program);
  registerSkill(program);
  registerReview(program);
  registerFinalize(program);
  registerExplain(program);
  registerSetDirectives(program);
  registerHeartbeat(program);
  registerCheckpoint(program);
  registerDocs(program);
  registerOutput(program);
  registerCostCommand(program);
  registerRecall(program);
  registerRemember(program);
  registerMemory(program);
  registerResume(program);
  registerNervous(program);
  registerConfigNervous(program);
  registerMode(program);
  registerFeatures(program);
  registerAudit(program);
  registerRecover(program);
  registerHelp(program);

  return program;
}
