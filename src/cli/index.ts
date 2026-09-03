import { Command } from 'commander';
import { DECKENT_VERSION } from '../core/constants.js';
import { buildVersionString, buildVersionJson } from './version-info.js';
import { registerInit } from './commands/init.js';
import { registerStart } from './commands/start.js';
import { registerPlan } from './commands/plan.js';
import { registerStatus } from './commands/status.js';
import { registerInspect } from './commands/inspect.js';
import { readProviderConcurrencyRuntime } from '../core/provider-concurrency-runtime-reader.js';
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
import { registerArchive } from './commands/archive.js';
import { registerDashboard } from './commands/dashboard.js';
import { registerServe } from './commands/serve.js';
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
import { registerTaskSettlement } from './commands/task-settlement.js';
import { registerCostCommand } from './commands/cost.js';
import { registerRecall } from './commands/recall.js';
import { registerRemember } from './commands/remember.js';
import { registerMemory } from './commands/memory.js';
import { registerTraceExtract } from './commands/trace-extract.js';
import { registerResume } from './commands/resume.js';
import {
  createExactDockerTaskAuthorityDiscriminator,
  createExactDockerTerminalAuthorityRevalidator,
} from '../orchestra/spawn-backend-docker.js';
import { registerHelp } from './commands/help.js';
import { registerNervous } from './commands/nervous.js';
import { registerConfigNervous } from './commands/config-nervous.js';
import { registerMode } from './commands/mode.js';
import { registerFeatures } from './commands/features.js';
import { registerTruth } from './commands/truth.js';
import { registerIntelligence } from './commands/intelligence.js';
import type { IntelligenceCommandDependencies } from './commands/intelligence.js';
import { readFile } from 'node:fs/promises';
import { print } from './helpers/output.js';
import { join, resolve } from 'node:path';
import { createAuditedCapabilityRegistry } from '../core/capability-runtime.js';
import { FlowRegistry } from '../core/flow-registry.js';
import { MemoryStore } from '../core/memory-store.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
import type { SourceDefinition } from '../intelligence/source-retrieval.js';
import type { CompetitorEvent } from '../intelligence/event-history.js';
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
import { registerApprovalsCommand } from './commands/approvals.js';
import { registerConfirmationsCommand } from './commands/confirmations.js';
import { registerProviderAuthorityCommand } from './commands/provider-authority.js';
import { registerProviderObservations } from './commands/provider-observations.js';
import { registerExecutionAuthorityCommand } from './commands/execution-authority.js';
import { registerCuStatus } from './commands/cu-status.js';
import { registerLocalLlm } from './commands/local-llm.js';
import { showSplash } from './helpers/splash.js';
import { installFatalHandlers } from './helpers/error-handler.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import {
  openTaskSettlementAuthority,
  openTaskSettlementProjection,
} from '../core/task-settlement-authority.js';
import { getLanguage, getMessage } from './helpers/messages.js';
import { SURFACE_REGISTRY, listByGroup } from './surface-registry.js';
import {
  applyLocalizedHelp,
  attachRootHelpFooter,
  buildCliHelpLabels,
} from './helpers/cli-help.js';

export interface CliProgramRuntime {
  readonly providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
}

const ROOT_HELP_GROUPS = ['run', 'observe', 'control', 'system'] as const;


/** Render the compact v2.1 root surface directly from the canonical registry. */
export function formatGeneratedRootHelp(lang: string): string {
  const lines = [
    getMessage('cli.root_help.usage', lang),
    '',
    `  ${getMessage('cli.root_help.prompt_chat', lang)}`,
    `  ${getMessage('cli.root_help.prompt_do', lang)}`,
    '',
  ];

  // Owner-yönergesi (2026-08-27 akşam): her komut kendi satırında, ne-işe-
  // yaradığı açıklamasıyla; deprecated-bloğu kök-help'te YOK (help advanced'te).
  const visible = SURFACE_REGISTRY.filter(({ status }) => status === 'visible');
  const width = Math.max(...visible.map(({ name }) => name.length));
  for (const group of ROOT_HELP_GROUPS) {
    lines.push(getMessage(`cli.root_help.group.${group}`, lang));
    for (const command of listByGroup(group)) {
      lines.push(`  ${command.name.padEnd(width)}  ${getMessage(command.summaryKey, lang)}`);
    }
    lines.push('');
  }
  lines.push(
    getMessage('cli.root_help.group.advanced', lang),
    `  ${getMessage('cli.root_help.advanced_link', lang)}`,
  );
  return `${lines.join('\n')}\n`;
}

/** Render every advanced and deprecated registry row in canonical order. */
export function formatGeneratedAdvancedHelp(lang: string): string {
  const commands = SURFACE_REGISTRY.filter(({ status }) => status !== 'visible');
  const width = Math.max(...commands.map(({ name }) => name.length));
  const lines = [
    getMessage('cli.root_help.advanced_usage', lang),
    '',
    getMessage('cli.root_help.advanced_heading', lang),
    '',
  ];
  for (const command of commands) {
    const summary = getMessage(command.summaryKey, lang);
    const suffix = command.status === 'deprecated'
      ? ` (${getMessage('cli.root_help.deprecated_label', lang, {
        replacement: command.deprecation?.replacement ?? '',
      })})`
      : '';
    lines.push(`  ${command.name.padEnd(width)}  ${summary}${suffix}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Build and configure the CLI program with all commands registered.
 * Does NOT call parseAsync — caller is responsible for parsing.
 *
 * Also installs top-level uncaughtException / unhandledRejection
 * handlers on first call (idempotent; skipped under vitest).
 */
/**
 * Production composition for `deckent intelligence`.
 *
 * The watch capability is registered ONLY when a live binding is supplied, and
 * this composition deliberately supplies none: the chain still lacks a
 * production `interpretSource` — the semantic step that turns a retrieved
 * source into comparable signals — so no honest binding can be built yet.
 * Without it `capabilityRegistry.invoke` returns a typed failure and the command
 * reports that instead of pretending to have run a watch. When the interpreter
 * lands, this function gains the binding and the command starts working with no
 * change to the command module itself.
 */
function buildIntelligenceDependencies(): IntelligenceCommandDependencies {
  return {
    capabilityRegistry: createAuditedCapabilityRegistry(),
    flowRegistry: new FlowRegistry(),
    loadSources: async (fixture: string | undefined) => {
      if (fixture === undefined) return [];
      const raw = await readFile(resolve(fixture), 'utf-8');
      return JSON.parse(raw) as SourceDefinition[];
    },
    readStatus: () => {
      const store = new MemoryStore(join(process.cwd(), BRAIN_DIR, MEMORY_DB_FILE));
      try {
        const events = store.getByType('custom')
          .filter(entry => (entry.tag_text ?? '').includes('competitor-event'))
          .map(entry => JSON.parse(entry.metadata) as CompetitorEvent);
        const lastRun = events
          .map(event => Date.parse(event.detectionDate))
          .filter(value => Number.isFinite(value))
          .sort((left, right) => right - left)[0];
        return { events, lastRun: lastRun === undefined ? undefined : new Date(lastRun) };
      } finally {
        store.close();
      }
    },
    write: (message) => print(message),
  };
}

export function buildProgram(runtime: CliProgramRuntime = {}): Command {
  installFatalHandlers();

  // CLI-CONTRACT-001 — every string Commander itself would render in English
  // (section headings, built-in help labels, the root footer, the version
  // flags) is caller-injected from the `cli-common` message-catalog family.
  // The `en` catalog rows are byte-identical to the previous literals, so
  // English help output is unchanged; only the localized faces are new.
  const helpLabels = buildCliHelpLabels(getLanguage(undefined));

  const program = new Command()
    .name('deckent')
    .description(getMessage('cli.program.desc', getLanguage(undefined)))
    .showSuggestionAfterError(true)
    .option('-V, --version', helpLabels.versionOptionDescription)
    .option('--version-json', helpLabels.versionJsonOptionDescription)
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
  registerStart(program, {
    ...(runtime.providerAuthority
      ? { providerAuthority: runtime.providerAuthority }
      : {}),
  });
  registerPlan(program);
  registerStatus(program, {
    openTaskSettlementProjection,
    providerConcurrencyRuntime: readProviderConcurrencyRuntime,
  });
  registerInspect(program);
  registerAttach(program);
  registerSpawn(program, {
    ...(runtime.providerAuthority
      ? { providerAuthority: runtime.providerAuthority }
      : {}),
  });
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
  registerArchive(program);
  registerDashboard(program);
  registerServe(program);
  registerSync(program);
  registerWatch(program);
  registerRun(program, {
    ...(runtime.providerAuthority
      ? { providerAuthority: runtime.providerAuthority }
      : {}),
    openTaskSettlementAuthority,
  });
  registerRuns(program);
  registerProcess(program);
  registerTestRun(program);
  registerAgent(program);
  registerSkill(program);
  registerReview(program);
  registerFinalize(program, {
    resolveExactTaskTerminalAuthorityReader:
      createExactDockerTaskAuthorityDiscriminator,
  });
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
  registerDo(program, {
    ...(runtime.providerAuthority
      ? { providerAuthority: runtime.providerAuthority }
      : {}),
  });
  registerHeartbeat(program);
  registerChat(program);
  registerCheckpoint(program);
  registerDocs(program);
  registerOutput(program, {
    openTaskSettlementProjection,
  });
  registerTaskSettlement(program);
  registerCostCommand(program);
  registerRecall(program);
  registerRemember(program);
  registerMemory(program);
  registerTraceExtract(program);
  registerResume(program, {
    resolveExactTerminalAuthorityRevalidator:
      createExactDockerTerminalAuthorityRevalidator,
    resolveIsExactTask: createExactDockerTaskAuthorityDiscriminator,
  });
  registerNervous(program);
  registerConfigNervous(program);
  registerMode(program);
  registerFeatures(program);
  registerTruth(program);
  registerIntelligence(program, buildIntelligenceDependencies());
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
  registerXverifyCommand(program, {
    ...(runtime.providerAuthority
      ? { providerAuthority: runtime.providerAuthority }
      : {}),
  });
  registerApprovalsCommand(program);
  registerConfirmationsCommand(program);
  registerProviderAuthorityCommand(program);
  registerProviderObservations(program);
  registerExecutionAuthorityCommand(program);
  registerCuStatus(program);
  registerLocalLlm(program);
  registerHelp(program);

  program
    .command('help [topic]', { hidden: true })
    .description(getMessage('cli.root_help.help_command_desc', getLanguage(undefined)))
    .action((topic?: string) => {
      const lang = getLanguage(undefined);
      process.stdout.write(topic === 'advanced'
        ? formatGeneratedAdvancedHelp(lang)
        : formatGeneratedRootHelp(lang));
    });

  // Applied AFTER every registration so the localized help configuration
  // reaches the whole tree (Commander only copies inherited settings at
  // subcommand-creation time). The root footer belongs to the root only.
  attachRootHelpFooter(program, helpLabels);
  applyLocalizedHelp(program, helpLabels);
  program.configureHelp({
    ...program.configureHelp(),
    formatHelp: () => formatGeneratedRootHelp(getLanguage(undefined)),
  });

  return program;
}
