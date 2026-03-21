#!/usr/bin/env node

import { Command } from 'commander';
import { DECKENT_VERSION } from '../core/constants.js';
import { handleCliError } from './helpers/process.js';
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
import { registerUsage } from './commands/usage.js';
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

const program = new Command()
  .name('deckent')
  .description('AI agent orchestration system — your AI development team, orchestrated.')
  .version(buildVersionString(DECKENT_VERSION), '-V, --version', 'output the version number with environment info')
  .option('--version-json', 'output version info as JSON')
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
registerUsage(program);
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

program.parseAsync(process.argv).catch((err: unknown) => {
  handleCliError(err);
});
