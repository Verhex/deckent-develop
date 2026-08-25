// src/core/cli-command-contract.ts
// ═══ CLI-CONTRACT-001 — path-level CLI command contract (SSOT) ═════════════
//
// One row per REAL command path in the delivery tree (`deckent`, `deckent
// agent`, `deckent agent list`, …) plus the repl/mcp-only capability rows the
// top-level registry still projects. This is the single source of truth the
// coarse-grained `COMMAND_REGISTRY` (src/core/command-registry.ts) is now a
// COMPATIBILITY PROJECTION of — nothing downstream re-declares command
// metadata.
//
// Every row is mechanically derived from, and mechanically re-verified
// against, the live Commander tree by the CLI adapter
// (src/cli/helpers/command-contract.ts, exercised by
// tests/cli/cli-surface-truth-battery.test.ts): path existence in BOTH
// directions, description⇄summaryKey binding, option flag set, argument
// arity/variadicity, aliases, hidden, and the derived defaultExecution/output
// axes. A drift between this file and the Commander tree fails the battery —
// it can never rot silently.
//
// Field semantics
//   path              — space-separated command path WITHOUT the `deckent`
//                       root (`'agent list'`).
//   summaryKey        — i18n catalog key (src/cli/helpers/messages.ts) that
//                       renders the command's one-line description. NEVER
//                       display text.
//   summaryBinding    — how summaryKey binds to the live description:
//                       'exact'        getMessage(key, lang) === description
//                       'interpolated' description is the key's template with
//                                      {placeholders} filled at build time
//                       'unbound'      the command module does not read the
//                                      key yet (declared intent + open debt;
//                                      see CONTRACT_SUMMARY_BINDING_DEBT).
//   longDescriptionKey— optional long-form help key (see
//                       helpers/message-catalog/cli-common.ts).
//   effect            — what running the command does to the world.
//   defaultExecution  — what a bare invocation does: 'read' | 'dry-run'
//                       (preview until an explicit execute opt-in flag) |
//                       'apply'.
//   authority         — who may invoke it: 'open' | 'operator' | 'owner'.
//   output            — machine-output contract; 'json'/'text-and-json'
//                       REQUIRES a real `--json` flag on the command.
//   platforms         — OS matrix the command is contracted on.
//   options/arguments — the command's full declared flag/argument surface;
//                       every descriptionKey is required and resolves through
//                       the shared bilingual i18n catalog. The live-tree
//                       adapter verifies the rendered binding in EN and TR.
//   catalogDependent  — SEC-04: may trigger the lazy model-catalog bootstrap.
//   registry          — present on rows the coarse top-level COMMAND_REGISTRY
//                       projects (top-level commands + repl/mcp-only rows).

/** UX grouping shown in a command-discovery surface. */
export type CommandCategory = 'Core' | 'Run' | 'Memory' | 'MCP' | 'Enterprise' | 'Danger';

/**
 * TERM-5 plain-risk-language ladder: read-only < local-state modification <
 * execute/spawn a process < autonomous continuous-loop control.
 */
export type CommandRisk = 'Oku' | 'Değiştir' | 'Çalıştır' | 'Otonom';

/** Which surface(s) actually expose this capability today. */
export type CommandSurface = 'cli' | 'mcp' | 'repl';

/** Subsystem domain the command's functionality belongs to (CLAUDE.md Architecture map). */
export type CommandScope =
  | 'orchestra'
  | 'core'
  | 'agents'
  | 'nervous'
  | 'monitor'
  | 'connectors'
  | 'providers'
  | 'api'
  | 'mcp'
  | 'cli'
  | 'dashboard';

/** What executing the command actually does to the world. */
export type CommandEffect = 'group' | 'read' | 'mixed' | 'local-write' | 'process' | 'dangerous' | 'autonomous';

/** What a bare (flag-free) invocation of the command does. */
export type CommandDefaultExecution = 'read' | 'dry-run' | 'apply';

/** Who is allowed to invoke the command. */
export type CommandAuthority = 'open' | 'operator' | 'owner';

/** Machine-output contract of the command. */
export type CommandOutputMode = 'text' | 'json' | 'text-and-json' | 'stream';

/** OS matrix a command is contracted on. */
export type CommandPlatform = 'darwin' | 'linux' | 'win32';

/** How `summaryKey` binds to the live Commander description. */
export type SummaryBinding = 'exact' | 'interpolated' | 'unbound';

export interface CliOptionContract {
  /** Exact commander flags string, e.g. `-j, --json` or `--env <envs>`. */
  readonly flags: string;
  /** Bilingual i18n key rendering this flag's help text. */
  readonly descriptionKey: string;
}

export interface CliArgumentContract {
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly descriptionKey: string;
}

/** The coarse fields the top-level COMMAND_REGISTRY projection still needs. */
export interface CliRegistryProjection {
  readonly category: CommandCategory;
  readonly scope: CommandScope;
  /**
   * Aggregate risk of the whole top-level command family. Required only when
   * the bare path is a read/group surface but mutating child paths exist.
   */
  readonly familyRisk?: CommandRisk;
  /** Exact `deckent_*` MCP tool name(s) this row folds. */
  readonly mcpNames?: readonly string[];
}

export interface CliCommandContract {
  readonly path: readonly string[];
  readonly summaryKey: string;
  readonly summaryBinding: SummaryBinding;
  readonly longDescriptionKey?: string;
  readonly effect: CommandEffect;
  readonly defaultExecution: CommandDefaultExecution;
  readonly authority: CommandAuthority;
  readonly output: CommandOutputMode;
  readonly platforms: readonly CommandPlatform[];
  readonly options: readonly CliOptionContract[];
  readonly arguments: readonly CliArgumentContract[];
  readonly aliases: readonly string[];
  readonly hidden: boolean;
  readonly catalogDependent: boolean;
  readonly surfaces: readonly CommandSurface[];
  readonly registry?: CliRegistryProjection;
}

/** Every command is contracted on the full desktop OS matrix today. */
export const ALL_PLATFORMS: readonly CommandPlatform[] = Object.freeze([
  'darwin',
  'linux',
  'win32',
]);

/** effect → the TERM-5 plain-risk word the coarse registry projection shows. */
export const EFFECT_TO_RISK: Readonly<Record<CommandEffect, CommandRisk>> = Object.freeze({
  group: 'Oku',
  read: 'Oku',
  mixed: 'Değiştir',
  'local-write': 'Değiştir',
  process: 'Çalıştır',
  dangerous: 'Çalıştır',
  autonomous: 'Otonom',
});

/** Flags whose presence means "a bare run only previews" (execute is opt-in). */
// (?![\w-]) — `--write-allowlist` gibi bileşik bayrak adları execute opt-in
// DEĞİLDİR; çıplak `\b` tireyi sınır sayıp yanlış-pozitif üretiyordu (677-002).
const EXECUTE_OPT_IN_RE = /--(run|apply|write|execute|commit)(?![\w-])/;
/** Flags that make the command a long-lived stream rather than a one-shot print. */
const STREAM_FLAG_RE = /--(follow|watch|stream|tail)\b/;
/** A real machine-JSON flag. */
const JSON_FLAG_RE = /--json\b/;

/**
 * Derived, therefore verifiable: a read command reads, a mutating command
 * that carries an explicit execute opt-in flag previews by default, anything
 * else applies. The CLI adapter recomputes this from the live Commander
 * option set and fails on drift.
 */
export function deriveDefaultExecution(
  effect: CommandEffect,
  optionFlags: readonly string[],
): CommandDefaultExecution {
  if (effect === 'group' || effect === 'read' || effect === 'mixed') return 'read';
  return optionFlags.some((f) => EXECUTE_OPT_IN_RE.test(f)) ? 'dry-run' : 'apply';
}

/**
 * Derived, therefore verifiable: claiming a JSON output contract without a
 * real `--json` flag (or vice versa) is a contract violation.
 */
export function deriveOutputMode(optionFlags: readonly string[]): CommandOutputMode {
  if (optionFlags.some((f) => JSON_FLAG_RE.test(f))) return 'text-and-json';
  if (optionFlags.some((f) => STREAM_FLAG_RE.test(f))) return 'stream';
  return 'text';
}

/** Does this output mode promise a machine-readable JSON face? */
export function outputCarriesJson(output: CommandOutputMode): boolean {
  return output === 'json' || output === 'text-and-json';
}

/** Canonical map key for a command path. */
export function contractPathKey(path: readonly string[] | string): string {
  return Array.isArray(path) ? path.join(' ') : String(path);
}

// ── row factory ─────────────────────────────────────────────────────────────

/** Compact authoring shape for one contract row. */
interface ContractInit {
  readonly path: string;
  readonly summaryKey: string;
  readonly binding?: SummaryBinding;
  readonly long?: string;
  readonly effect: CommandEffect;
  readonly defaultExecution: CommandDefaultExecution;
  readonly authority: CommandAuthority;
  readonly output: CommandOutputMode;
  /** Exact Commander flags → bilingual i18n key. */
  readonly opts?: Readonly<Record<string, string>>;
  /** `[token, i18nKey]`; token uses `<required>`, `[optional]` and optional `...`. */
  readonly args?: readonly (readonly [string, string])[];
  readonly aliases?: readonly string[];
  readonly hidden?: true;
  readonly catalogDependent?: true;
  readonly surfaces?: readonly CommandSurface[];
  readonly registry?: CliRegistryProjection;
}

function parseArgument(token: string, descriptionKey: string): CliArgumentContract {
  const required = token.startsWith('<');
  const variadic = token.includes('...');
  const name = token.replace(/^[<[]/, '').replace(/[>\]]$/, '').replace(/\.\.\.$/, '');
  return { name, required, variadic, descriptionKey };
}

function c(init: ContractInit): CliCommandContract {
  const options: CliOptionContract[] = Object.entries(init.opts ?? {}).map(([flags, descriptionKey]) =>
    ({ flags, descriptionKey }),
  );
  const args: CliArgumentContract[] = (init.args ?? []).map(([token, descriptionKey]) =>
    parseArgument(token, descriptionKey),
  );
  return {
    path: Object.freeze(init.path.split(' ')),
    summaryKey: init.summaryKey,
    summaryBinding: init.binding ?? 'exact',
    ...(init.long === undefined ? {} : { longDescriptionKey: init.long }),
    effect: init.effect,
    defaultExecution: init.defaultExecution,
    authority: init.authority,
    output: init.output,
    platforms: ALL_PLATFORMS,
    options: Object.freeze(options),
    arguments: Object.freeze(args),
    aliases: Object.freeze([...(init.aliases ?? [])]),
    hidden: init.hidden === true,
    catalogDependent: init.catalogDependent === true,
    surfaces: Object.freeze([...(init.surfaces ?? ['cli'])]),
    ...(init.registry === undefined ? {} : { registry: init.registry }),
  };
}

// ── the contract catalog ────────────────────────────────────────────────────

/**
 * CANONICAL path-level CLI command contract. Rows follow the Commander
 * registration order of buildProgram(); the repl/mcp-only capability rows the
 * coarse registry still projects come last.
 */
export const CLI_COMMAND_CONTRACTS: readonly CliCommandContract[] = Object.freeze([
  c({ path: 'init', summaryKey: 'cli.init.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--auto': 'cliContract.init.opt.auto', '--manual': 'cliContract.init.opt.manual', '--cursor': 'cliContract.init.opt.cursor', '--claude-code': 'cliContract.init.opt.claude_code', '--env <envs>': 'cliContract.init.opt.env', '--all-envs': 'cliContract.init.opt.all_envs', '--upgrade': 'cliContract.init.opt.upgrade', '--force': 'cliContract.init.opt.force', '--repair': 'cliContract.init.opt.repair', '-y, --yes': 'init.option_yes', '--install': 'init.option_install', '--no-install': 'init.option_no_install', '--no-image': 'cliContract.init.opt.no_image' }, surfaces: ['cli', 'mcp'], registry: { category: 'Core', scope: 'core', mcpNames: ['deckent_init'] } }),
  c({ path: 'start', summaryKey: 'cli.start.desc', long: 'cliContract.start.long', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'stream', opts: { '--auto-approve': 'cliContract.start.opt.auto_approve', '--sandbox-mode': 'cliContract.start.opt.sandbox_mode', '--sandbox': 'cliContract.start.opt.sandbox', '--dry-run': 'cliContract.start.opt.dry_run', '--force': 'cliContract.start.opt.force', '--force-scope': 'cliContract.start.opt.force_scope', '--force-prompt-gate': 'cliContract.start.opt.force_prompt_gate', '--force-replan': 'cliContract.start.opt.force_replan', '--consume-approved <flowId>': 'cliContract.start.opt.consume_approved', '--watch': 'cliContract.start.opt.watch', '--timeout <ms>': 'cliContract.start.opt.timeout', '--force-directives': 'cliContract.start.opt.force_directives', '--flow-id <id>': 'cliContract.start.opt.flow_id', '--revision <n>': 'cliContract.start.opt.revision', '--plan-digest <digest>': 'cliContract.start.opt.plan_digest', '--exact-attempt-id <id>': 'cliContract.start.opt.exact_attempt_id', '--exact-owner-nonce <nonce>': 'cliContract.start.opt.exact_owner_nonce', '--exact-log-ref <path>': 'cliContract.start.opt.exact_log_ref' }, args: [['[description]', 'cliContract.start.arg.description']], catalogDependent: true, surfaces: ['cli', 'mcp'], registry: { category: 'Run', scope: 'orchestra', mcpNames: ['deckent_start'] } }),
  c({ path: 'plan', summaryKey: 'cli.plan.desc', long: 'cliContract.plan.long', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--no-confirm': 'cliContract.plan.opt.no_confirm', '-y, --yes': 'cliContract.plan.opt.yes', '--structured': 'cliContract.plan.opt.structured', '--dry-run': 'cliContract.plan.opt.dry_run', '--interrogate': 'cliContract.plan.opt.interrogate', '--force-prompt-gate': 'cliContract.plan.opt.force_prompt_gate', '--force-scope': 'plan.force_scope_option', '--write-allowlist <paths...>': 'do.write_allowlist_option', '--adopt-existing <sprintId>': 'plan.adopt_existing_option', '--expected-plan-digest <sha256>': 'plan.expected_plan_digest_option', '--expected-projection-digest <sha256>': 'plan.expected_projection_digest_option', '--expected-canonical-projection-digest <sha256>': 'plan.expected_canonical_projection_digest_option', '--adoption-actor <actorId>': 'plan.adoption_actor_option', '--adoption-justification <text>': 'plan.adoption_justification_option' }, catalogDependent: true, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Run', scope: 'orchestra', mcpNames: ['deckent_plan'] } }),
  c({ path: 'status', summaryKey: 'status.desc', long: 'cliContract.status.long', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--watch': 'cli.runtime.status.opt.watch', '-f, --follow': 'cli.runtime.status.opt.follow', '--json': 'cli.runtime.status.opt.json', '--raw': 'cli.runtime.status.opt.raw', '--verbose': 'cli.runtime.status.opt.verbose', '--no-color': 'cli.runtime.status.opt.no_color', '--graph': 'cli.runtime.status.opt.graph', '--mode <mode>': 'cli.runtime.status.opt.mode' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'orchestra', mcpNames: ['deckent_status'] } }),
  c({ path: 'inspect', summaryKey: 'inspect.description', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'inspect.option.json', '--follow': 'inspect.option.follow' }, args: [['[taskId]', 'cliContract.inspect.arg.taskId']], surfaces: ['cli', 'mcp'], registry: { category: 'Core', scope: 'orchestra', mcpNames: ['deckent_inspect'] } }),
  c({ path: 'attach', summaryKey: 'cli.attach.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--list': 'cliContract.attach.opt.list' }, surfaces: ['cli'], registry: { category: 'Run', scope: 'cli' } }),
  c({ path: 'spawn', summaryKey: 'cli.spawn.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--force': 'cliContract.spawn.opt.force', '--auto-approve': 'cliContract.spawn.opt.auto_approve' }, args: [['<taskId>', 'cliContract.spawn.arg.taskId']], surfaces: ['cli'], registry: { category: 'Run', scope: 'agents' } }),
  c({ path: 'kill', summaryKey: 'cli.kill.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--all': 'cliContract.kill.opt.all', '--force': 'cliContract.kill.opt.force', '--user-explicit': 'cliContract.kill.opt.user_explicit' }, args: [['[taskId]', 'cliContract.kill.arg.taskId']], surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Danger', scope: 'agents', mcpNames: ['deckent_kill'] } }),
  c({ path: 'retro', summaryKey: 'cli.retro.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--raw': 'cli.memcat.retro.opt.raw', '--compare': 'cli.memcat.retro.opt.compare', '--json': 'cli.memcat.shared.opt.json', '--perf': 'cli.memcat.retro.opt.perf', '--trend [n]': 'cli.memcat.retro.opt.trend' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Memory', scope: 'orchestra', mcpNames: ['deckent_retro'] } }),
  c({ path: 'cleanup', summaryKey: 'cli.cleanup.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'operator', output: 'text-and-json', opts: { '--decay': 'cli.runtime.cleanup.opt.decay', '--dry-run': 'cli.runtime.cleanup.opt.dry_run', '--history': 'cli.runtime.cleanup.opt.history', '--apply': 'cli.runtime.cleanup.opt.apply', '--plan-digest <digest>': 'cli.runtime.cleanup.opt.plan_digest', '--json': 'cli.runtime.cleanup.opt.json', '--sprint <id>': 'cleanup.sprint_option' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Danger', scope: 'orchestra', mcpNames: ['deckent_cleanup'] } }),
  c({ path: 'doctor', summaryKey: 'cli.doctor.desc', effect: 'mixed', defaultExecution: 'read', authority: 'operator', output: 'text-and-json', opts: { '--profile': 'cli.runtime.doctor.opt.profile', '--legacy': 'cli.runtime.doctor.opt.legacy', '--json': 'cli.runtime.doctor.opt.json', '--pre-flight': 'cli.runtime.doctor.opt.pre_flight', '--providers': 'cli.runtime.doctor.opt.providers', '--memory': 'cli.runtime.doctor.opt.memory', '--ram-experiment': 'cli.runtime.doctor.opt.ram_experiment', '--fix-image': 'cli.runtime.doctor.opt.fix_image', '--fix': 'cli.runtime.doctor.opt.fix', '-y, --yes': 'cli.runtime.doctor.opt.yes', '--dry-run': 'cli.runtime.doctor.opt.dry_run' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'core', mcpNames: ['deckent_doctor'] } }),
  c({ path: 'config', summaryKey: 'cli.config.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--raw': 'cliContract.config.opt.raw' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'core', mcpNames: ['deckent_config'] } }),
  c({ path: 'config set', summaryKey: 'cli.config.set.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<key>', 'cliContract.config.arg.key'], ['<value>', 'cliContract.config.arg.value']] }),
  c({ path: 'config get', summaryKey: 'cli.config.get.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', args: [['<key>', 'cliContract.config.arg.key']] }),
  c({ path: 'config export', summaryKey: 'cli.config.export.desc', effect: 'mixed', defaultExecution: 'read', authority: 'operator', output: 'text', args: [['[file]', 'cliContract.config.arg.export_file']] }),
  c({ path: 'config import', summaryKey: 'cli.config.import.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<file>', 'cliContract.config.arg.import_file']] }),
  c({ path: 'config list', summaryKey: 'cli.config.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'config keys', summaryKey: 'cli.config.keys.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'config migrate', summaryKey: 'cli.config.migrate.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--dry-run': 'cliContract.config.opt.dry_run' } }),
  c({ path: 'config nervous', summaryKey: 'cli.config_nervous.nervous.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'config nervous set', summaryKey: 'cli.config_nervous.set.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' }, args: [['<key>', 'cli.governance.config_nervous.arg.key'], ['<value>', 'cli.governance.config_nervous.arg.value']] }),
  c({ path: 'config nervous override', summaryKey: 'cli.config_nervous.override.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' }, args: [['<actionId>', 'cli.governance.config_nervous.arg.action_id'], ['<policy>', 'cli.governance.config_nervous.arg.policy']] }),
  c({ path: 'config nervous list', summaryKey: 'cli.config_nervous.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'config nervous reset', summaryKey: 'cli.config_nervous.reset.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'history', summaryKey: 'history.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--agent <name>': 'cli.memcat.history.opt.agent', '--skill <name>': 'cli.memcat.history.opt.skill', '--json': 'cli.memcat.shared.opt.json', '--last <n>': 'history.opt_last', '--trend': 'history.opt_trend' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Memory', scope: 'orchestra', mcpNames: ['deckent_history'] } }),
  c({ path: 'plugin', summaryKey: 'cli.plugin.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Core', scope: 'core', familyRisk: 'Değiştir' } }),
  c({ path: 'plugin install', summaryKey: 'cli.plugin.install.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--force': 'cli.memcat.plugin.opt.force' }, args: [['<source>', 'cli.memcat.plugin.arg.source']] }),
  c({ path: 'plugin remove', summaryKey: 'cli.plugin.remove.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', args: [['<name>', 'cli.memcat.plugin.arg.name']] }),
  c({ path: 'plugin update', summaryKey: 'cli.plugin.update.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<source>', 'cli.memcat.plugin.arg.source']] }),
  c({ path: 'plugin list', summaryKey: 'cli.plugin.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json' } }),
  c({ path: 'plugin info', summaryKey: 'cli.plugin.info.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', args: [['<dir>', 'cli.memcat.plugin.arg.dir']] }),
  c({ path: 'plugin test', summaryKey: 'cli.plugin.test.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<name>', 'cli.memcat.plugin.arg.name']] }),
  c({ path: 'plugin create', summaryKey: 'cli.plugin.create.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<name>', 'cli.memcat.plugin.arg.new_name']] }),
  c({ path: 'upgrade', summaryKey: 'cli.upgrade.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--check': 'cliContract.upgrade.opt.check', '--changelog': 'cliContract.upgrade.opt.changelog', '--canary': 'cliContract.upgrade.opt.canary', '--beta': 'cliContract.upgrade.opt.beta', '--rollback': 'cliContract.upgrade.opt.rollback', '--local <path>': 'cliContract.upgrade.opt.local' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'cli' } }),
  c({ path: 'onboard', summaryKey: 'cli.onboard.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'operator', output: 'text-and-json', opts: { '--non-interactive': 'cliContract.onboard.opt.non_interactive', '--force': 'cliContract.onboard.opt.force', '--plan-only': 'cliContract.onboard.opt.plan_only', '--json': 'cliContract.onboard.opt.json', '--apply': 'cliContract.onboard.opt.apply', '--dry-run': 'cliContract.onboard.opt.dry_run', '-y, --yes': 'cliContract.onboard.opt.yes' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'cli' } }),
  c({ path: 'analyze', summaryKey: 'cli.analyze.desc', effect: 'mixed', defaultExecution: 'read', authority: 'operator', output: 'text-and-json', opts: { '--json': 'cliContract.analyze.opt.json', '--bootstrap-vocabulary': 'cliContract.analyze.opt.bootstrap_vocabulary' }, aliases: ['analyze-project'], surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'core', mcpNames: ['deckent_analyze_project'] } }),
  c({ path: 'archive-debt', summaryKey: 'cli.archive_debt.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--count': 'cli.memcat.archive_debt.opt.count', '--before <sprint>': 'cli.memcat.archive_debt.opt.before' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'orchestra' } }),
  c({ path: 'archive', summaryKey: 'archive.description', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Core', scope: 'core', familyRisk: 'Değiştir' } }),
  c({ path: 'archive inspect', summaryKey: 'archive.inspect.description', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--sprint <id>': 'archive.option.sprint', '--all': 'archive.option.all', '--json': 'archive.option.json' } }),
  c({ path: 'archive reconcile', summaryKey: 'archive.reconcile.description', effect: 'local-write', defaultExecution: 'dry-run', authority: 'operator', output: 'text-and-json', opts: { '--sprint <id>': 'archive.option.sprint', '--all': 'archive.option.all', '--apply': 'archive.option.apply', '--retire-legacy': 'archive.option.retire_legacy', '--json': 'archive.option.json' } }),
  c({ path: 'archive verify', summaryKey: 'archive.verify.description', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--sprint <id>': 'archive.option.sprint', '--all': 'archive.option.all', '--json': 'archive.option.json' } }),
  c({ path: 'archive terminal-inspect', summaryKey: 'archive.terminal.inspect.description', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--sprint <id>': 'archive.option.exact_sprint', '--hot-journal <path>': 'archive.option.hot_journal', '--json': 'archive.option.json' } }),
  c({ path: 'archive terminal-verify', summaryKey: 'archive.terminal.verify.description', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--sprint <id>': 'archive.option.exact_sprint', '--hot-journal <path>': 'archive.option.hot_journal', '--json': 'archive.option.json' } }),
  c({ path: 'archive terminal-repair', summaryKey: 'archive.terminal.repair.description', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text-and-json', opts: { '--sprint <id>': 'archive.option.exact_sprint', '--hot-journal <path>': 'archive.option.hot_journal', '--receipt <path>': 'archive.option.receipt', '--final-sequence <n>': 'archive.option.final_sequence', '--final-digest <sha256>': 'archive.option.final_digest', '--expected-archive-digest <sha256>': 'archive.option.expected_archive_digest', '--expected-hot-digest <sha256>': 'archive.option.expected_hot_digest', '--reason <text>': 'archive.option.reason', '--json': 'archive.option.json' } }),
  c({ path: 'dashboard', summaryKey: 'cli.dashboard.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--interval <ms>': 'cliContract.dashboard.opt.interval', '--no-color': 'cliContract.dashboard.opt.no_color', '--json': 'cliContract.dashboard.opt.json' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'monitor' } }),
  c({ path: 'serve', summaryKey: 'cli.serve.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--port <number>': 'cli.governance.serve.opt.port', '--dev': 'cli.governance.serve.opt.dev', '--dev-port <number>': 'cli.governance.serve.opt.dev_port', '--host <addr>': 'cli.governance.serve.opt.host', '--no-terminal': 'cli.governance.serve.opt.no_terminal' }, surfaces: ['cli'], registry: { category: 'Run', scope: 'api' } }),
  c({ path: 'sync', summaryKey: 'cli.sync.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text-and-json', opts: { '--git-only': 'cliContract.sync.opt.git_only', '--adapters-only': 'cliContract.sync.opt.adapters_only', '--dry-run': 'cliContract.sync.opt.dry_run', '--json': 'cliContract.sync.opt.json' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'orchestra', mcpNames: ['deckent_sync'] } }),
  c({ path: 'watch', summaryKey: 'cli.watch.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'stream', opts: { '--follow <taskId>': 'cliContract.watch.opt.follow' }, surfaces: ['cli', 'mcp'], registry: { category: 'Run', scope: 'monitor', mcpNames: ['deckent_watch'] } }),
  c({ path: 'run', summaryKey: 'cli.run.desc', long: 'cliContract.run.long', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--model <model>': 'run.opt_model', '--provider <name>': 'run.opt_provider', '--model-effort <level>': 'cliContract.run.opt.model_effort', '--scope <dir>': 'cliContract.run.opt.scope', '--timeout <ms>': 'cliContract.run.opt.timeout', '--keep': 'cliContract.run.opt.keep', '--auto-approve': 'cliContract.run.opt.auto_approve', '--verbose': 'cliContract.run.opt.verbose' }, args: [['<description>', 'cliContract.run.arg.description']], catalogDependent: true, surfaces: ['cli', 'mcp'], registry: { category: 'Run', scope: 'orchestra', mcpNames: ['deckent_run'] } }),
  c({ path: 'run start', summaryKey: 'run.alias_note', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['[args...]', 'cliContract.run.arg.alias_args']], catalogDependent: true }),
  c({ path: 'run status', summaryKey: 'run.alias_note', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', args: [['[args...]', 'cliContract.run.arg.alias_args']], catalogDependent: true }),
  c({ path: 'run retro', summaryKey: 'run.alias_note', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', args: [['[args...]', 'cliContract.run.arg.alias_args']], catalogDependent: true }),
  c({ path: 'run history', summaryKey: 'run.alias_note', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', args: [['[args...]', 'cliContract.run.arg.alias_args']], catalogDependent: true }),
  c({ path: 'runs', summaryKey: 'cli.runs.desc', effect: 'mixed', defaultExecution: 'read', authority: 'operator', output: 'text', opts: { '--limit <n>': 'cliContract.runs.opt.limit', '--close-stale': 'cliContract.runs.opt.close_stale', '--retire-superseded': 'cliContract.runs.opt.retire_superseded', '--yes': 'cliContract.runs.opt.yes', '--approve': 'cliContract.runs.opt.approve', '--reject': 'cliContract.runs.opt.reject', '--retire': 'cliContract.runs.opt.retire', '--reason <text>': 'cliContract.runs.opt.reason', '--start': 'cliContract.runs.opt.start', '--diff': 'cliContract.runs.opt.diff', '--commit': 'cliContract.runs.opt.commit', '--message <text>': 'cliContract.runs.opt.message' }, args: [['[n]', 'cliContract.runs.arg.n']], surfaces: ['cli', 'repl'], registry: { category: 'Run', scope: 'orchestra' } }),
  c({ path: 'process', summaryKey: 'cli.process.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp'], registry: { category: 'Enterprise', scope: 'orchestra', familyRisk: 'Çalıştır', mcpNames: ['deckent_process'] } }),
  c({ path: 'process submit', summaryKey: 'cli.process.submit.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--kind <kind>': 'cliContract.process.opt.kind', '--scope-dir <dir>': 'cliContract.process.opt.scope_dir', '--provider <provider>': 'cliContract.process.opt.provider', '--model <model>': 'cliContract.process.opt.model', '--root <path>': 'cliContract.process.opt.root', '--lang <code>': 'cliContract.process.opt.lang' }, args: [['<description>', 'cliContract.process.arg.description']] }),
  c({ path: 'process status', summaryKey: 'cli.process.status.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--root <path>': 'cliContract.process.opt.root', '--lang <code>': 'cliContract.process.opt.lang' }, args: [['<executionId>', 'cliContract.process.arg.executionId']] }),
  c({ path: 'process result', summaryKey: 'cli.process.result.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--root <path>': 'cliContract.process.opt.root', '--lang <code>': 'cliContract.process.opt.lang' }, args: [['<executionId>', 'cliContract.process.arg.executionId']] }),
  c({ path: 'test', summaryKey: 'cli.test_run.test.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--keep': 'cliContract.test.opt.keep', '--timeout <ms>': 'cliContract.test.opt.timeout', '--directives <file>': 'cliContract.test.opt.directives', '--sandbox': 'cliContract.test.opt.sandbox', '--model <model>': 'cliContract.test.opt.model', '--reporter <format>': 'cliContract.test.opt.reporter', '--min-coverage <percent>': 'cliContract.test.opt.min_coverage' }, surfaces: ['cli'], registry: { category: 'Run', scope: 'orchestra' } }),
  c({ path: 'agent', summaryKey: 'cli.agent.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'core', familyRisk: 'Değiştir', mcpNames: ['deckent_agent_list', 'deckent_agent_manage'] } }),
  c({ path: 'agent lint', summaryKey: 'cli.agent.lint.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json' } }),
  c({ path: 'agent list', summaryKey: 'cli.agent.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json' } }),
  c({ path: 'agent create', summaryKey: 'agent.create.description', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--model <model>': 'agent.create.option_model', '--triggers <triggers...>': 'agent.create.option_triggers', '--prompt <text>': 'agent.create.option_prompt', '--description <desc>': 'agent.create.option_description' }, args: [['<name>', 'cli.memcat.agent.arg.new_name']] }),
  c({ path: 'agent stats', summaryKey: 'cli.agent.stats.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json' }, args: [['<name>', 'cli.memcat.agent.arg.name']] }),
  c({ path: 'agent enable', summaryKey: 'cli.agent.enable.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<name>', 'cli.memcat.agent.arg.name']] }),
  c({ path: 'agent disable', summaryKey: 'cli.agent.disable.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<name>', 'cli.memcat.agent.arg.name']] }),
  c({ path: 'agent delete', summaryKey: 'cli.agent.delete.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--force': 'cli.memcat.agent.delete.opt.force' }, args: [['<name>', 'cli.memcat.agent.arg.name']] }),
  c({ path: 'agent edit', summaryKey: 'cli.agent.edit.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--model <model>': 'cli.memcat.agent.edit.opt.model', '--description <desc>': 'cli.memcat.agent.edit.opt.description', '--enable': 'cli.memcat.agent.edit.opt.enable', '--disable': 'cli.memcat.agent.edit.opt.disable', '--triggers <triggers...>': 'cli.memcat.agent.edit.opt.triggers', '--sync-prompt': 'cli.memcat.agent.edit.opt.sync_prompt' }, args: [['<name>', 'cli.memcat.agent.arg.name']] }),
  c({ path: 'agent reclassify', summaryKey: 'cli.agent.reclassify.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--sprint <id>': 'cli.memcat.agent.reclassify.opt.sprint', '--task <id>': 'cli.memcat.agent.reclassify.opt.task', '--decision <decision>': 'cli.memcat.agent.reclassify.opt.decision', '--reason <text>': 'cli.memcat.agent.reclassify.opt.reason', '--no-audit': 'cli.memcat.agent.reclassify.opt.no_audit' } }),
  c({ path: 'agent info', summaryKey: 'cli.agent.info.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', args: [['<name>', 'cli.memcat.agent.arg.name']] }),
  c({ path: 'skill', summaryKey: 'cli.skill.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'core', familyRisk: 'Değiştir', mcpNames: ['deckent_skill_list', 'deckent_skill_manage'] } }),
  c({ path: 'skill list', summaryKey: 'cli.skill.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json', '--category <cat>': 'cli.memcat.skill.opt.category' } }),
  c({ path: 'skill create', summaryKey: 'cli.skill.create.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<name>', 'cli.memcat.skill.arg.new_name']] }),
  c({ path: 'skill install', summaryKey: 'cli.skill.install.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--force': 'cli.memcat.skill.opt.force' }, args: [['<source>', 'cli.memcat.skill.arg.source']] }),
  c({ path: 'skill update', summaryKey: 'cli.skill.update.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<name>', 'cli.memcat.skill.arg.name']] }),
  c({ path: 'skill enable', summaryKey: 'cli.skill.enable.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<name>', 'cli.memcat.skill.arg.name']] }),
  c({ path: 'skill disable', summaryKey: 'cli.skill.disable.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<name>', 'cli.memcat.skill.arg.name']] }),
  c({ path: 'skill delete', summaryKey: 'cli.skill.delete.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', args: [['<name>', 'cli.memcat.skill.arg.name']] }),
  c({ path: 'skill info', summaryKey: 'cli.skill.info.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--stats': 'cli.memcat.skill.opt.stats' }, args: [['<name>', 'cli.memcat.skill.arg.name']] }),
  c({ path: 'skill search', summaryKey: 'cli.skill_marketplace.search.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--category <cat>': 'cli.memcat.skill_marketplace.opt.category', '--json': 'cli.memcat.shared.opt.json', '--limit <n>': 'cli.memcat.skill_marketplace.opt.limit' }, args: [['<query>', 'cli.memcat.skill_marketplace.arg.query']] }),
  c({ path: 'skill publish', summaryKey: 'cli.skill_marketplace.publish.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--dry-run': 'cli.memcat.skill_marketplace.opt.dry_run', '--key-dir <dir>': 'cli.memcat.skill_marketplace.opt.key_dir', '--no-sign': 'cli.memcat.skill_marketplace.opt.no_sign' }, args: [['<skillPath>', 'cli.memcat.skill_marketplace.arg.skill_path']] }),
  c({ path: 'review', summaryKey: 'cli.review.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text-and-json', opts: { '--auto': 'cliContract.review.opt.auto', '--json': 'cliContract.review.opt.json', '--approve-all': 'cliContract.review.opt.approve_all', '--reject-all': 'cliContract.review.opt.reject_all' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Run', scope: 'orchestra', mcpNames: ['deckent_review'] } }),
  c({ path: 'finalize', summaryKey: 'finalize.description', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--sprint <id>': 'finalize.sprint_option', '--skip-decay': 'finalize.skip_decay_option', '--skip-hooks': 'finalize.skip_hooks_option', '--force': 'finalize.force_option' }, surfaces: ['cli'], registry: { category: 'Run', scope: 'orchestra' } }),
  c({ path: 'explain', summaryKey: 'cli.explain.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--sprint <id>': 'cli.memcat.explain.opt.sprint', '--task <taskId>': 'cli.memcat.explain.opt.task', '--json': 'cli.memcat.shared.opt.json', '--verbose': 'cli.memcat.explain.opt.verbose' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Memory', scope: 'orchestra', mcpNames: ['deckent_explain'] } }),
  c({ path: 'set-directives', summaryKey: 'cli.set_directives.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--content <string>': 'cliContract.set_directives.opt.content', '--file <path>': 'cliContract.set_directives.opt.file' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Run', scope: 'orchestra', mcpNames: ['deckent_set_directives'] } }),
  c({ path: 'connect', summaryKey: 'cli.connect.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--provider <name>': 'cliContract.connect.opt.provider', '--json': 'cliContract.connect.opt.json' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'core' } }),
  c({ path: 'plan-nl', summaryKey: 'cli.plan_nl.desc', effect: 'mixed', defaultExecution: 'read', authority: 'operator', output: 'text', opts: { '--write': 'cliContract.plan_nl.opt.write' }, args: [['<goal>', 'cliContract.plan_nl.arg.goal']], surfaces: ['cli'], registry: { category: 'Run', scope: 'orchestra' } }),
  c({ path: 'do', summaryKey: 'cli.do.desc', long: 'cliContract.do.long', effect: 'process', defaultExecution: 'dry-run', authority: 'operator', output: 'text', opts: { '--run': 'cliContract.do.opt.run', '--yes': 'cliContract.do.opt.yes', '--force-scope': 'cliContract.do.opt.force_scope', '--write-allowlist <paths...>': 'do.write_allowlist_option' }, args: [['<goal>', 'cliContract.do.arg.goal']], surfaces: ['cli', 'repl'], registry: { category: 'Run', scope: 'orchestra' } }),
  c({ path: 'heartbeat', summaryKey: 'cli.heartbeat.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--daemon': 'cliContract.heartbeat.opt.daemon', '--interval <minutes>': 'cliContract.heartbeat.opt.interval', '--stop': 'cliContract.heartbeat.opt.stop' }, surfaces: ['cli'], registry: { category: 'Run', scope: 'orchestra' } }),
  c({ path: 'chat', summaryKey: 'cli.chat.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--tool <name>': 'cli.governance.chat.opt.tool', '--local': 'cli.governance.chat.opt.local', '--check-mcp': 'cli.governance.chat.opt.check_mcp', '--resume <sessionId>': 'cli.governance.chat.opt.resume', '--resume-limit <n>': 'cli.governance.chat.opt.resume_limit_with_default', '--native': 'cli.governance.chat.opt.native', '--once': 'cli.governance.chat.opt.once', '--message <text>': 'cli.governance.chat.opt.message' }, catalogDependent: true, surfaces: ['cli'], registry: { category: 'Run', scope: 'cli' } }),
  c({ path: 'checkpoint', summaryKey: 'cli.checkpoint.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Run', scope: 'orchestra', familyRisk: 'Değiştir', mcpNames: ['deckent_checkpoint'] } }),
  c({ path: 'checkpoint list', summaryKey: 'cli.checkpoint.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--pending': 'checkpoint.pending_option', '--json': 'checkpoint.json_option', '--lang <code>': 'checkpoint.lang_option' } }),
  c({ path: 'checkpoint approve', summaryKey: 'cli.checkpoint.approve.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--lang <code>': 'checkpoint.lang_option' }, args: [['<sprintId>', 'cliContract.checkpoint.arg.sprintId'], ['<phase>', 'cliContract.checkpoint.arg.phase']] }),
  c({ path: 'checkpoint reject', summaryKey: 'cli.checkpoint.reject.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--lang <code>': 'checkpoint.lang_option' }, args: [['<sprintId>', 'cliContract.checkpoint.arg.sprintId'], ['<phase>', 'cliContract.checkpoint.arg.phase']] }),
  c({ path: 'docs', summaryKey: 'cli.docs.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp'], registry: { category: 'Core', scope: 'orchestra', familyRisk: 'Değiştir', mcpNames: ['deckent_docs'] } }),
  c({ path: 'docs add', summaryKey: 'cli.docs.add.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--auto <sections>': 'cli.memcat.docs.opt.auto', '--protect <sections>': 'cli.memcat.docs.opt.protect', '--skills <skills>': 'cli.memcat.docs.opt.skills', '--max-lines <n>': 'cli.memcat.docs.opt.max_lines' }, args: [['<path>', 'cli.memcat.docs.arg.path']] }),
  c({ path: 'docs remove', summaryKey: 'cli.docs.remove.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', args: [['<pathOrId>', 'cli.memcat.docs.arg.path_or_id']] }),
  c({ path: 'docs list', summaryKey: 'cli.docs.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'docs update', summaryKey: 'cli.docs.update.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--add-auto <sections>': 'cli.memcat.docs.opt.add_auto', '--add-protect <sections>': 'cli.memcat.docs.opt.add_protect', '--remove-auto <sections>': 'cli.memcat.docs.opt.remove_auto', '--max-lines <n>': 'cli.memcat.docs.opt.set_max_lines' }, args: [['<pathOrId>', 'cli.memcat.docs.arg.path_or_id']] }),
  c({ path: 'docs run', summaryKey: 'cli.docs.run.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--no-cache': 'cli.memcat.docs.opt.no_cache' } }),
  c({ path: 'docs track', summaryKey: 'cli.docs.track.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'docs track scan', summaryKey: 'cli.docs.scan.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--no-write': 'cli.memcat.docs.opt.no_write', '--prune': 'cli.memcat.docs.opt.prune', '--check': 'cli.memcat.docs.opt.check', '--max-rank <n>': 'cli.memcat.docs.opt.max_rank' } }),
  c({ path: 'docs track status', summaryKey: 'cli.docs.status.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--stale': 'cli.memcat.docs.opt.stale', '--rank <n>': 'cli.memcat.docs.opt.rank', '--json': 'cli.memcat.shared.opt.json' } }),
  c({ path: 'docs track sync', summaryKey: 'cli.docs.sync.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'output', summaryKey: 'cli.output.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--tail <n>': 'cliContract.output.opt.tail', '--follow': 'cliContract.output.opt.follow', '--sprint-id <sprintId>': 'cliContract.output.opt.sprint_id', '--json': 'cliContract.output.opt.json' }, args: [['<taskId>', 'cliContract.output.arg.taskId']], surfaces: ['cli'], registry: { category: 'Core', scope: 'monitor' } }),
  c({ path: 'task', summaryKey: 'task.cmd_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Run', scope: 'core', familyRisk: 'Değiştir' } }),
  c({ path: 'task settle', summaryKey: 'task.settle.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'operator', output: 'text-and-json', opts: { '--apply': 'task.settle.opt_apply', '--attestation-reason <text>': 'task.settle.opt_attestation_reason', '--operator <id>': 'task.settle.opt_operator', '--reason-code <code>': 'task.settle.opt_reason_code', '--json': 'task.settle.opt_json' }, args: [['<taskId>', 'cliContract.task.arg.taskId']] }),
  c({ path: 'cost', summaryKey: 'cli.cost.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp'], registry: { category: 'Enterprise', scope: 'core', familyRisk: 'Değiştir', mcpNames: ['deckent_cost'] } }),
  c({ path: 'cost show', summaryKey: 'cli.cost.show.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--provider <name>': 'cli.memcat.cost.opt.provider_filter', '--model <id>': 'cli.memcat.cost.opt.model' } }),
  c({ path: 'cost update', summaryKey: 'cli.cost.update.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--provider <name>': 'cli.memcat.cost.opt.provider_update', '--dry-run': 'cli.memcat.cost.opt.dry_run', '--skip-validation': 'cli.memcat.cost.opt.skip_validation' } }),
  c({ path: 'cost budget', summaryKey: 'cli.cost.budget.desc', effect: 'mixed', defaultExecution: 'read', authority: 'operator', output: 'text', opts: { '--set <usd>': 'cli.memcat.cost.opt.set', '--daily <usd>': 'cli.memcat.cost.opt.daily', '--monthly <usd>': 'cli.memcat.cost.opt.monthly' } }),
  c({ path: 'recall', summaryKey: 'cli.recall.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '-t, --type <types>': 'cli.memcat.recall.opt.type', '-n, --limit <n>': 'cli.memcat.recall.opt.limit', '--sprint-min <n>': 'cli.memcat.recall.opt.sprint_min', '-m, --mode <mode>': 'cli.memcat.recall.opt.mode', '--json': 'cli.memcat.shared.opt.json' }, args: [['<query>', 'cli.memcat.recall.arg.query']], surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Memory', scope: 'core', mcpNames: ['deckent_memory_query'] } }),
  c({ path: 'remember', summaryKey: 'cli.remember.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '-t, --type <type>': 'cli.memcat.remember.opt.type', '--tags <tags>': 'cli.memcat.remember.opt.tags', '--title <title>': 'cli.memcat.remember.opt.title' }, args: [['<note>', 'cli.memcat.remember.arg.note']], surfaces: ['cli'], registry: { category: 'Memory', scope: 'core' } }),
  c({ path: 'memory', summaryKey: 'cli.memory.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp'], registry: { category: 'Memory', scope: 'core', familyRisk: 'Değiştir', mcpNames: ['deckent_memory_manage'] } }),
  c({ path: 'memory rebuild', summaryKey: 'cli.memory.rebuild.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'memory export', summaryKey: 'cli.memory.export.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'memory stats', summaryKey: 'cli.memory.stats.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'memory backup', summaryKey: 'memory.backup.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--output <path>': 'cli.runtime.memory.backup.opt.output', '--checkpoint': 'cli.runtime.memory.backup.opt.checkpoint' } }),
  c({ path: 'memory relations', summaryKey: 'cli.memory.relations.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'memory relations list', summaryKey: 'cli.memory.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'memory relations review', summaryKey: 'cli.memory.review.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'trace', summaryKey: 'trace.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Core', scope: 'core', familyRisk: 'Değiştir' } }),
  c({ path: 'trace extract', summaryKey: 'trace.extract.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--out <dir>': 'trace.extract.opt.out', '--system <text>': 'trace.extract.opt.system' }, args: [['<input>', 'trace.extract.arg.input']] }),
  c({ path: 'trace migrate', summaryKey: 'trace.migrate.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'operator', output: 'text-and-json', opts: { '--out <dir>': 'trace.migrate.opt.out', '--apply': 'trace.migrate.opt.apply', '--allow-training': 'trace.migrate.opt.allow_training', '--weight <number>': 'trace.migrate.opt.weight', '--require-consent': 'trace.migrate.opt.require_consent', '--require-lineage': 'trace.migrate.opt.require_lineage', '--exclude': 'trace.migrate.opt.exclude', '--policy-version <id>': 'trace.migrate.opt.policy_version', '--contract-version <id>': 'trace.migrate.opt.contract_version', '--json': 'trace.opt.json' }, args: [['<inputs...>', 'trace.migrate.arg.inputs']] }),
  c({ path: 'trace corpus', summaryKey: 'trace.corpus.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'trace corpus build', summaryKey: 'trace.corpus.build.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text-and-json', opts: { '--out <file>': 'trace.corpus.opt.out', '--json': 'trace.opt.json' }, args: [['<migration>', 'trace.corpus.arg.migration']] }),
  c({ path: 'trace corpus lint', summaryKey: 'trace.corpus.lint.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--manifest <file>': 'trace.corpus.opt.manifest', '--json': 'trace.opt.json' }, args: [['<corpus>', 'trace.corpus.arg.corpus']] }),
  c({ path: 'resume', summaryKey: 'cli.resume.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--auto-approve': 'cliContract.resume.opt.auto_approve', '--dry-run': 'cliContract.resume.opt.dry_run', '--force-scope': 'recover.force_scope_option', '--root <path>': 'cliContract.resume.opt.root', '--test-mode': 'cliContract.resume.opt.test_mode', '--outcome-file <path>': 'cliContract.resume.opt.outcome_file' }, args: [['<sprintId>', 'cliContract.resume.arg.sprintId']], surfaces: ['cli', 'repl'], registry: { category: 'Run', scope: 'orchestra' } }),
  c({ path: 'nervous', summaryKey: 'cli.nervous.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Enterprise', scope: 'nervous', familyRisk: 'Değiştir', mcpNames: ['deckent_nervous_subscribe', 'deckent_nervous_accept', 'deckent_nervous_reject', 'deckent_nervous_status', 'deckent_nervous_config', 'deckent_nervous_edit', 'deckent_nervous_undo'] } }),
  c({ path: 'nervous enable', summaryKey: 'cli.nervous.enable.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--mode <preset>': 'cli.governance.nervous.opt.mode', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'nervous accept', summaryKey: 'cli.nervous.accept.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' }, args: [['<id>', 'cli.governance.nervous.arg.id']] }),
  c({ path: 'nervous reject', summaryKey: 'cli.nervous.reject.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--reason <text>': 'cli.governance.opt.reason', '--lang <code>': 'cli.governance.opt.lang' }, args: [['<id>', 'cli.governance.nervous.arg.id']] }),
  c({ path: 'nervous edit', summaryKey: 'cli.nervous.edit.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' }, args: [['<id>', 'cli.governance.nervous.arg.id']] }),
  c({ path: 'nervous undo', summaryKey: 'cli.nervous.undo.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' }, args: [['<action-id>', 'cli.governance.nervous.arg.action_id']] }),
  c({ path: 'nervous history', summaryKey: 'cli.nervous.history.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--limit <n>': 'cli.governance.opt.limit', '--since <duration>': 'cli.governance.nervous.opt.since', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'nervous recommendations', summaryKey: 'cli.nervous.recommendations.desc', effect: 'mixed', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--all': 'cli.governance.nervous.opt.all', '--limit <n>': 'cli.governance.opt.limit', '--dismiss <id>': 'cli.governance.nervous.opt.dismiss', '--lang <code>': 'cli.governance.opt.lang' }, aliases: ['recs'] }),
  c({ path: 'nervous log', summaryKey: 'cli.nervous.log.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'stream', opts: { '--follow': 'cli.governance.nervous.opt.follow', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'nervous accept-panic', summaryKey: 'cli.nervous.accept_panic.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--reason <text>': 'cli.governance.nervous.opt.panic_reason' }, args: [['<task-id>', 'cli.governance.nervous.arg.task_id']] }),
  c({ path: 'nervous baseline-refresh', summaryKey: 'cli.nervous.baseline_refresh.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text' }),
  c({ path: 'mode', summaryKey: 'mode.group_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Core', scope: 'core', familyRisk: 'Değiştir' } }),
  c({ path: 'mode show', summaryKey: 'mode.show_desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'mode sprint', summaryKey: 'mode.sprint_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'mode run', summaryKey: 'mode.run_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'mode task', summaryKey: 'mode.task_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'mode process', summaryKey: 'mode.process_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'mode auto', summaryKey: 'mode.auto_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'mode global', summaryKey: 'mode.global_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<style>', 'cli.governance.mode.arg.style']] }),
  c({ path: 'features', summaryKey: 'cli.features.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '-c, --category <category>': 'cli.memcat.features.opt.category', '--json': 'cli.memcat.shared.opt.json', '--id <featureId>': 'cli.memcat.features.opt.id' }, aliases: ['feature-query'], surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'core', mcpNames: ['deckent_feature_query'] } }),
  c({ path: 'truth', summaryKey: 'cli.truth.desc', effect: 'mixed', defaultExecution: 'read', authority: 'operator', output: 'text-and-json', opts: { '--json': 'cli.memcat.truth.opt.json', '--check': 'cli.memcat.truth.opt.check', '--write': 'cli.memcat.truth.opt.write' }, surfaces: ['cli', 'mcp'], registry: { category: 'Core', scope: 'core', mcpNames: ['deckent_truth'] } }),
  c({ path: 'audit', summaryKey: 'cli.audit.desc', effect: 'process', defaultExecution: 'dry-run', authority: 'operator', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json_raw', '--sprint <id>': 'cli.memcat.audit.opt.sprint', '--tenant <id>': 'cli.memcat.audit.opt.tenant', '--action <channel>': 'cli.memcat.audit.opt.action', '--since <timestamp>': 'cli.memcat.audit.opt.since', '--role <role>': 'cli.memcat.audit.opt.role', '--out <path>': 'cli.memcat.audit.opt.out', '--url <url>': 'cli.memcat.audit.opt.url', '--syslog <host[:port]>': 'cli.memcat.audit.opt.syslog', '--syslog-protocol <protocol>': 'cli.memcat.audit.opt.syslog_protocol', '--keep-days <n>': 'cli.memcat.audit.opt.keep_days', '--keep-count <n>': 'cli.memcat.audit.opt.keep_count', '--apply': 'cli.memcat.audit.opt.apply', '--lang <code>': 'cli.memcat.shared.opt.lang' }, args: [['[sprint-id]', 'cli.memcat.audit.arg.sprint_id']], surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'orchestra', mcpNames: ['deckent_audit'] } }),
  c({ path: 'audit-verify', summaryKey: 'cli.audit_verify.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json_raw' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'orchestra' } }),
  c({ path: 'recover', summaryKey: 'recover.description', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text-and-json', opts: { '--dry-run': 'recover.dry_run_option', '--force': 'recover.force_option', '--skip-audit': 'recover.skip_audit_option', '--restore-tasks': 'recover.restore_tasks_option', '--resume': 'recover.resume_option', '--auto-approve': 'recover.auto_approve_option', '--force-scope': 'recover.force_scope_option', '--json': 'recover.json_option' }, args: [['<sprint-id>', 'cliContract.recover.arg.sprint_id']], surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Danger', scope: 'orchestra', mcpNames: ['deckent_recover'] } }),
  c({ path: 'models', summaryKey: 'cli.models.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', catalogDependent: true, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'core', familyRisk: 'Değiştir', mcpNames: ['deckent_models'] } }),
  c({ path: 'models list', summaryKey: 'cli.models.list.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--provider <name>': 'cli.memcat.models.opt.provider_filter', '--offline': 'cli.memcat.models.opt.offline' }, catalogDependent: true }),
  c({ path: 'models activate', summaryKey: 'cli.models.activate.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--provider <name>': 'cli.memcat.models.opt.provider_required' }, args: [['<model>', 'cli.memcat.models.arg.model']], catalogDependent: true }),
  c({ path: 'models deactivate', summaryKey: 'cli.models.deactivate.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--provider <name>': 'cli.memcat.models.opt.provider_required' }, args: [['<model>', 'cli.memcat.models.arg.model']], catalogDependent: true }),
  c({ path: 'models activation', summaryKey: 'cli.models.activation.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', catalogDependent: true }),
  c({ path: 'models policy', summaryKey: 'cli.models.policy.desc', effect: 'mixed', defaultExecution: 'read', authority: 'owner', output: 'text', args: [['[provider]', 'cli.memcat.models.arg.policy_provider'], ['[mode]', 'cli.memcat.models.arg.policy_mode']], catalogDependent: true }),
  c({ path: 'models active-set', summaryKey: 'cli.models.active_set.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', catalogDependent: true }),
  c({ path: 'models refresh', summaryKey: 'cli.models.refresh.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', catalogDependent: true }),
  c({ path: 'models tier', summaryKey: 'cli.models.tier.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--offline': 'cli.memcat.models.opt.offline' }, args: [['<model>', 'cli.memcat.models.arg.model']], catalogDependent: true }),
  c({ path: 'flow', summaryKey: 'cli.flow.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'orchestra', familyRisk: 'Çalıştır' } }),
  c({ path: 'flow list', summaryKey: 'cli.flow.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--tenant <id>': 'cli.governance.opt.tenant_filter', '--json': 'cli.governance.opt.json' } }),
  c({ path: 'flow add', summaryKey: 'cli.flow.add.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--tenant <id>': 'cli.governance.flow.opt.add_tenant' }, args: [['<cron>', 'cli.governance.flow.arg.cron'], ['<action>', 'cli.governance.flow.arg.action']] }),
  c({ path: 'flow run', summaryKey: 'cli.flow.run.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--once': 'cli.governance.flow.opt.once', '--tenant <id>': 'cli.governance.opt.tenant_filter' } }),
  c({ path: 'flow approve', summaryKey: 'cli.flow.approve.desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', args: [['<id>', 'cli.governance.flow.arg.id']] }),
  c({ path: 'rbac', summaryKey: 'cli.rbac.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'core', familyRisk: 'Değiştir' } }),
  c({ path: 'rbac check', summaryKey: 'cli.rbac.check.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--tenant <id>': 'cli.governance.rbac.opt.tenant' }, args: [['<role>', 'cli.governance.rbac.arg.role'], ['<action>', 'cli.governance.rbac.arg.action']] }),
  c({ path: 'rbac roles', summaryKey: 'cli.rbac.roles.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'rbac grant', summaryKey: 'cli.rbac.grant.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', args: [['<user>', 'cli.governance.rbac.arg.user'], ['<role>', 'cli.governance.rbac.arg.role']] }),
  c({ path: 'rbac revoke', summaryKey: 'cli.rbac.revoke.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', args: [['<user>', 'cli.governance.rbac.arg.user']] }),
  c({ path: 'evolve', summaryKey: 'cli.evolve.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'orchestra' } }),
  c({ path: 'evolve report', summaryKey: 'cli.evolve.report.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '-n, --sprints <n>': 'cli.governance.evolve.opt.sprints', '--json': 'cli.governance.opt.json' } }),
  c({ path: 'autonomous', summaryKey: 'cli.autonomous.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Enterprise', scope: 'orchestra', familyRisk: 'Otonom', mcpNames: ['deckent_autonomous', 'deckent_autonomous_backlog', 'deckent_autonomous_status', 'deckent_autonomous_approve', 'deckent_autonomous_reject'] } }),
  c({ path: 'autonomous enable', summaryKey: 'cli.autonomous.enable.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'autonomous start', summaryKey: 'cli.autonomous.start.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--interval-ms <ms>': 'cli.governance.autonomous.opt.interval_ms', '--max-iterations <n>': 'cli.governance.autonomous.opt.max_iterations', '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'autonomous plan', summaryKey: 'cli.autonomous.plan.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--from <ref>': 'cli.governance.autonomous.opt.from', '--policy <policy>': 'cli.governance.autonomous.opt.policy', '--max-items <n>': 'cli.governance.autonomous.opt.max_items', '--model <model>': 'run.opt_model', '--provider <name>': 'run.opt_provider', '--dry-run': 'cli.governance.autonomous.opt.dry_run', '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' }, args: [['<goal>', 'cli.governance.autonomous.arg.goal']] }),
  c({ path: 'autonomous status', summaryKey: 'cli.autonomous.status.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'autonomous stop', summaryKey: 'cli.autonomous.stop.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'autonomous cleanup', summaryKey: 'cli.autonomous.cleanup.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'autonomous pending', summaryKey: 'cli.autonomous.pending.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'autonomous approve', summaryKey: 'cli.autonomous.approve.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--reason <text>': 'cli.governance.autonomous.opt.decision_reason', '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' }, args: [['<triggerId>', 'cli.governance.autonomous.arg.trigger_id']] }),
  c({ path: 'autonomous reject', summaryKey: 'cli.autonomous.reject.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--reason <text>': 'cli.governance.autonomous.opt.decision_reason', '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' }, args: [['<triggerId>', 'cli.governance.autonomous.arg.trigger_id']] }),
  c({ path: 'autonomous backlog', summaryKey: 'cli.autonomous.backlog.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'autonomous backlog add', summaryKey: 'cli.autonomous.add.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--id <id>': 'cli.governance.autonomous.opt.entry_id', '--title <title>': 'cli.governance.autonomous.opt.entry_title', '--kind <kind>': 'cli.governance.autonomous.opt.entry_kind', '--description <text>': 'cli.governance.autonomous.opt.entry_description', '--policy <policy>': 'cli.governance.autonomous.opt.entry_policy', '--cron <expr>': 'cli.governance.autonomous.opt.cron', '--capability <verb>': 'cli.governance.autonomous.opt.capability', '--args <json>': 'cli.governance.autonomous.opt.args', '--connector <id>': 'cli.governance.autonomous.opt.connector', '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'autonomous backlog list', summaryKey: 'cli.autonomous.list.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'autonomous backlog remove', summaryKey: 'cli.autonomous.remove.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--id <id>': 'cli.governance.autonomous.opt.remove_id', '--root <path>': 'cli.governance.opt.root', '--lang <code>': 'cli.governance.opt.lang' }, args: [['[id]', 'cli.governance.autonomous.arg.backlog_id']] }),
  c({ path: 'autonomous-mission', summaryKey: 'cli.autonomous_mission.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'orchestra', familyRisk: 'Otonom' } }),
  c({ path: 'autonomous-mission create-list', summaryKey: 'cli.autonomous_mission.create_list.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--item <kind:spec>': 'cli.governance.mission.opt.item', '--items-file <path>': 'cli.governance.mission.opt.items_file', '--id <id>': 'cli.governance.mission.opt.id', '--tenant <tenant>': 'cli.governance.opt.tenant', '--deliver-to <channel>': 'cli.governance.mission.opt.deliver_to' }, args: [['<title>', 'cli.governance.mission.arg.title']] }),
  c({ path: 'autonomous-mission create-goal', summaryKey: 'cli.autonomous_mission.create_goal.desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--accept <criteria>': 'cli.governance.mission.opt.accept', '--title <title>': 'cli.governance.mission.opt.title', '--id <id>': 'cli.governance.mission.opt.id', '--tenant <tenant>': 'cli.governance.opt.tenant', '--deliver-to <channel>': 'cli.governance.mission.opt.deliver_to' }, args: [['<goal>', 'cli.governance.mission.arg.goal']] }),
  c({ path: 'autonomous-mission list', summaryKey: 'cli.autonomous_mission.list.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text-and-json', opts: { '--json': 'cli.governance.opt.json', '--tenant <tenant>': 'cli.governance.opt.tenant_filter' } }),
  c({ path: 'bot', summaryKey: 'bot.group_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'connectors', familyRisk: 'Çalıştır' } }),
  c({ path: 'bot listen', summaryKey: 'bot.listen_desc', effect: 'process', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--root <path>': 'bot.root_option', '--lang <code>': 'bot.lang_option' } }),
  c({ path: 'bot start', summaryKey: 'bot.daemon_desc', effect: 'process', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--root <path>': 'bot.root_option', '--lang <code>': 'bot.lang_option' } }),
  c({ path: 'bot stop', summaryKey: 'bot.stop_desc', effect: 'process', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--root <path>': 'bot.root_option', '--lang <code>': 'bot.lang_option' } }),
  c({ path: 'bot status', summaryKey: 'bot.status_desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--root <path>': 'bot.root_option', '--lang <code>': 'bot.lang_option' } }),
  c({ path: 'gateway', summaryKey: 'gateway.group_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'connectors', familyRisk: 'Çalıştır' } }),
  c({ path: 'gateway listen', summaryKey: 'cli.gateway.listen.desc', effect: 'process', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'gateway start', summaryKey: 'cli.gateway.start.desc', effect: 'process', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'gateway stop', summaryKey: 'cli.gateway.stop.desc', effect: 'process', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'gateway status', summaryKey: 'cli.gateway.status.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'gateway pair', summaryKey: 'cli.governance.gateway.pair.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'gateway pair list', summaryKey: 'cli.gateway.pair.list.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' } }),
  c({ path: 'gateway pair approve', summaryKey: 'cli.gateway.pair.approve.desc', effect: 'process', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' }, args: [['<code>', 'cli.governance.gateway.arg.pair_code'], ['<project>', 'cli.governance.gateway.arg.project']] }),
  c({ path: 'gateway pair reject', summaryKey: 'cli.gateway.pair.reject.desc', effect: 'process', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--lang <code>': 'cli.governance.opt.lang' }, args: [['<code>', 'cli.governance.gateway.arg.pair_code']] }),
  c({ path: 'gateway-runtime', summaryKey: 'gateway.runtime_desc', effect: 'autonomous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--project <path>': 'cli.governance.gateway.opt.project', '--lang <code>': 'cli.governance.opt.lang' }, hidden: true, surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'connectors' } }),
  c({ path: 'mcp', summaryKey: 'cli.memcat.mcp.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'MCP', scope: 'mcp', familyRisk: 'Değiştir' } }),
  c({ path: 'mcp add', summaryKey: 'cli.mcp.add.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--scope <scope>': 'cli.memcat.mcp.opt.scope_add', '--transport <transport>': 'cli.memcat.mcp.opt.transport', '--header <kv...>': 'cli.memcat.mcp.opt.header', '--env <kv...>': 'cli.memcat.mcp.opt.env' }, args: [['<name>', 'cli.memcat.mcp.arg.name'], ['<cmdOrUrl>', 'cli.memcat.mcp.arg.cmd_or_url'], ['[args...]', 'cli.memcat.mcp.arg.args']] }),
  c({ path: 'mcp list', summaryKey: 'cli.mcp.list.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json' } }),
  c({ path: 'mcp remove', summaryKey: 'cli.mcp.remove.desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--scope <scope>': 'cli.memcat.mcp.opt.scope_remove' }, args: [['<name>', 'cli.memcat.mcp.arg.name']] }),
  c({ path: 'mcp get', summaryKey: 'cli.mcp.get.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.memcat.shared.opt.json' }, args: [['<name>', 'cli.memcat.mcp.arg.name']] }),
  c({ path: 'resources', summaryKey: 'cli.resources.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--log [path]': 'cli.governance.resources.opt.log', '--json': 'cli.governance.opt.json' }, surfaces: ['cli', 'repl'], registry: { category: 'Core', scope: 'monitor' } }),
  c({ path: 'usage', summaryKey: 'cli.usage.desc', effect: 'mixed', defaultExecution: 'read', authority: 'operator', output: 'text-and-json', opts: { '--sprint <N>': 'usage.option.sprint', '--since <ISO>': 'usage.option.since', '--until <ISO>': 'usage.option.until', '--json': 'usage.option.json', '--lineage': 'usage.option.lineage', '--baseline-sprint <id>': 'usage.option.baseline_sprint', '--candidate-sprint <id>': 'usage.option.candidate_sprint', '--apply': 'usage.option.apply', '--decision-digest <sha256>': 'usage.option.decision_digest', '--environment <id>': 'usage.option.environment', '--tenant <id>': 'usage.option.tenant' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'api', mcpNames: ['deckent_usage'] } }),
  c({ path: 'kpi', summaryKey: 'cli.kpi.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--sprint <id>': 'cli.memcat.kpi.opt.sprint', '--trend <kpiId>': 'cli.memcat.kpi.opt.trend', '-n, --n <count>': 'cli.memcat.kpi.opt.n', '--json': 'cli.memcat.shared.opt.json_raw' }, surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'orchestra', mcpNames: ['deckent_kpi'] } }),
  c({ path: 'image', summaryKey: 'cli.image.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Core', scope: 'core', familyRisk: 'Değiştir' } }),
  c({ path: 'image build', summaryKey: 'cli.image.build.desc', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', opts: { '--tag <tag>': 'cli.image.build.opt_tag', '--dry-run': 'cli.image.build.opt_dry_run', '--with-codex': 'cli.image.build.opt_with_codex', '--with-gemini': 'cli.image.build.opt_with_gemini', '--with-ollama': 'cli.image.build.opt_with_ollama', '--with-cursor': 'cli.image.build.opt_with_cursor', '--image <tag>': 'cli.image.build.opt_image', '--lang <code>': 'cli.image.build.opt_lang' } }),
  c({ path: 'limits', summaryKey: 'cli.limits.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.governance.opt.json' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'core' } }),
  c({ path: 'openrouter-probe', summaryKey: 'cli.openrouter_probe.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.governance.opt.json' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'core' } }),
  c({ path: 'xverify', summaryKey: 'xverify.cmd_desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--author <provider>': 'xverify.opt_author', '--author-model <apiId>': 'xverify.opt_author_model', '--verifier <provider>': 'xverify.opt_verifier', '--verifier-model <id>': 'xverify.opt_verifier_model', '--diff': 'xverify.opt_diff', '--files <csv>': 'xverify.opt_files', '--target <specs>': 'xverify.opt_target', '--timeout <ms>': 'xverify.opt_timeout', '--json': 'xverify.opt_json' }, args: [['<claim>', 'cli.governance.xverify.arg.claim']], surfaces: ['cli', 'mcp'], registry: { category: 'Core', scope: 'orchestra', mcpNames: ['deckent_xverify'] } }),
  c({ path: 'approvals', summaryKey: 'approvals.cmd_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp'], registry: { category: 'Enterprise', scope: 'core', familyRisk: 'Değiştir', mcpNames: ['deckent_approvals'] } }),
  c({ path: 'approvals list', summaryKey: 'approvals.list_desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text' }),
  c({ path: 'approvals decide', summaryKey: 'approvals.decide_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--allow': 'approvals.opt_allow', '--deny': 'approvals.opt_deny', '--reason <text>': 'approvals.opt_reason', '--always': 'approvals.opt_always' }, args: [['<requestId>', 'cli.governance.approvals.arg.request_id']] }),
  c({ path: 'approvals rules', summaryKey: 'approvals.rules_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'approvals rules list', summaryKey: 'approvals.rules_list_desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text' }),
  c({ path: 'approvals rules apply', summaryKey: 'approvals.rules_apply_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text' }),
  c({ path: 'approvals rules disable', summaryKey: 'approvals.rules_disable_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', args: [['<id>', 'cli.governance.approvals.arg.rule_id']] }),
  c({ path: 'approvals rules enable', summaryKey: 'approvals.rules_enable_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', args: [['<id>', 'cli.governance.approvals.arg.rule_id']] }),
  c({ path: 'approvals rules remove', summaryKey: 'approvals.rules_remove_desc', effect: 'dangerous', defaultExecution: 'apply', authority: 'owner', output: 'text', args: [['<id>', 'cli.governance.approvals.arg.rule_id']] }),
  c({ path: 'confirmations', summaryKey: 'confirmations.cmd_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'core', familyRisk: 'Değiştir' } }),
  c({ path: 'confirmations list', summaryKey: 'confirmations.list_desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text' }),
  c({ path: 'confirmations decide', summaryKey: 'confirmations.decide_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--confirm': 'confirmations.opt_confirm', '--reject': 'confirmations.opt_reject', '--reason <text>': 'confirmations.opt_reason' }, args: [['<id>', 'cli.governance.confirmations.arg.id']] }),
  c({ path: 'confirmations run', summaryKey: 'confirmations.run_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--id <id>': 'confirmations.opt_run_id', '--author <provider>': 'confirmations.opt_run_author', '--timeout <ms>': 'confirmations.opt_run_timeout' } }),
  c({ path: 'provider-authority', summaryKey: 'provider_authority.cmd_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'providers', familyRisk: 'Değiştir' } }),
  c({ path: 'provider-authority keyring', summaryKey: 'provider_authority.keyring.cmd_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'provider-authority keyring status', summaryKey: 'provider_authority.keyring.status_desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text' }),
  c({ path: 'provider-authority keyring init', summaryKey: 'provider_authority.keyring.init_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text' }),
  c({ path: 'provider-authority keyring rotate', summaryKey: 'provider_authority.keyring.rotate_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--expect-revision <hash>': 'provider_authority.keyring.opt_expect_revision' } }),
  c({ path: 'provider-authority limits', summaryKey: 'provider_authority.limits.cmd_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'provider-authority limits init', summaryKey: 'provider_authority.limits.init_desc', effect: 'local-write', defaultExecution: 'apply', authority: 'owner', output: 'text', opts: { '--provider <id>': 'provider_authority.limits.opt_provider', '--model <apiId>': 'provider_authority.limits.opt_model', '--auth-mode <mode>': 'provider_authority.limits.opt_auth_mode', '--transport <transport>': 'provider_authority.limits.opt_transport', '--execution-backend <backend>': 'provider_authority.limits.opt_execution_backend', '--execution-profile-ref <ref>': 'provider_authority.limits.opt_execution_profile_ref', '--endpoint-ref-hash <hash>': 'provider_authority.limits.opt_endpoint_ref_hash', '--tenant <id>': 'provider_authority.limits.opt_tenant', '--warn-at-ratio <ratio>': 'provider_authority.limits.opt_warn_at_ratio', '--block-at-ratio <ratio>': 'provider_authority.limits.opt_block_at_ratio', '--ratio-enforcement <mode>': 'provider_authority.limits.opt_ratio_enforcement' } }),
  c({ path: 'provider-observations', summaryKey: 'cli.governance.provider_observations.desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Enterprise', scope: 'providers', familyRisk: 'Değiştir' } }),
  c({ path: 'provider-observations inspect', summaryKey: 'cli.governance.provider_observations.inspect.desc', effect: 'read', defaultExecution: 'read', authority: 'owner', output: 'text-and-json', opts: { '--database <path>': 'cli.governance.provider_observations.opt.database', '--json': 'cli.governance.opt.json' } }),
  c({ path: 'provider-observations migrate', summaryKey: 'cli.governance.provider_observations.migrate.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'owner', output: 'text-and-json', opts: { '--database <path>': 'cli.governance.provider_observations.opt.database', '--json': 'cli.governance.opt.json', '--apply': 'cli.governance.provider_observations.opt.apply', '--plan-digest <digest>': 'cli.governance.provider_observations.opt.plan_digest', '--approval-id <id>': 'cli.governance.provider_observations.opt.approval_id' } }),
  c({ path: 'provider-observations adopt', summaryKey: 'cli.governance.provider_observations.adopt.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'owner', output: 'text-and-json', opts: { '--database <path>': 'cli.governance.provider_observations.opt.database', '--json': 'cli.governance.opt.json', '--preimage <path>': 'cli.governance.provider_observations.opt.preimage', '--apply': 'cli.governance.provider_observations.opt.apply', '--plan-digest <digest>': 'cli.governance.provider_observations.opt.plan_digest' } }),
  c({ path: 'provider-observations adopt-runtime', summaryKey: 'cli.governance.provider_observations.adopt_runtime.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'owner', output: 'text-and-json', opts: { '--database <path>': 'cli.governance.provider_observations.opt.database', '--json': 'cli.governance.opt.json', '--preimage <path>': 'cli.governance.provider_observations.opt.preimage', '--apply': 'cli.governance.provider_observations.opt.apply', '--plan-digest <digest>': 'cli.governance.provider_observations.opt.plan_digest' } }),
  c({ path: 'provider-observations reconcile', summaryKey: 'cli.governance.provider_observations.reconcile.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'owner', output: 'text-and-json', opts: { '--database <path>': 'cli.governance.provider_observations.opt.database', '--json': 'cli.governance.opt.json', '--run-id <id>': 'cli.governance.provider_observations.opt.run_id', '--apply': 'cli.governance.provider_observations.opt.apply', '--plan-digest <digest>': 'cli.governance.provider_observations.opt.plan_digest', '--approval-id <id>': 'cli.governance.provider_observations.opt.approval_id' } }),
  c({ path: 'execution-authority', summaryKey: 'execution_authority.cmd_desc', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli', 'mcp'], registry: { category: 'Enterprise', scope: 'core', familyRisk: 'Değiştir', mcpNames: ['deckent_execution_authority'] } }),
  c({ path: 'execution-authority mount-adopt', summaryKey: 'execution_authority.mount_adopt.desc', effect: 'local-write', defaultExecution: 'dry-run', authority: 'owner', output: 'text-and-json', opts: { '--apply': 'execution_authority.mount_adopt.opt_apply', '--operator <id>': 'execution_authority.mount_adopt.opt_operator', '--justification <text>': 'execution_authority.mount_adopt.opt_justification', '--json': 'execution_authority.mount_adopt.opt_json' } }),
  c({ path: 'cu-status', summaryKey: 'cli.cu_status.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text-and-json', opts: { '--json': 'cli.governance.opt.json' }, surfaces: ['cli'], registry: { category: 'Core', scope: 'core' } }),
  c({ path: 'local-llm', summaryKey: 'cmdCatalog.local-llm.summary', effect: 'group', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['cli'], registry: { category: 'Core', scope: 'providers', familyRisk: 'Çalıştır' } }),
  c({ path: 'local-llm start', summaryKey: 'local_llm.start_desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'local-llm status', summaryKey: 'local_llm.status_desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text' }),
  c({ path: 'local-llm stop', summaryKey: 'local_llm.stop_desc', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text' }),
  c({ path: 'help-info', summaryKey: 'cli.help.help_info.desc', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', opts: { '--lang <lang>': 'cli.memcat.help_info.opt.lang' }, aliases: ['info'], surfaces: ['cli', 'mcp', 'repl'], registry: { category: 'Core', scope: 'cli', mcpNames: ['deckent_help'] } }),
  c({ path: 'interrogate', summaryKey: 'cmdCatalog.interrogate.summary', binding: 'unbound', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['repl'], registry: { category: 'Run', scope: 'orchestra' } }),
  c({ path: 'cancel', summaryKey: 'cmdCatalog.cancel.summary', binding: 'unbound', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', surfaces: ['repl'], registry: { category: 'Run', scope: 'cli' } }),
  c({ path: 'mcp-bridge', summaryKey: 'cmdCatalog.mcp-bridge.summary', binding: 'unbound', effect: 'process', defaultExecution: 'apply', authority: 'operator', output: 'text', surfaces: ['repl'], registry: { category: 'MCP', scope: 'mcp' } }),
  c({ path: 'model', summaryKey: 'cmdCatalog.model.summary', binding: 'unbound', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', surfaces: ['repl'], registry: { category: 'Core', scope: 'providers' } }),
  c({ path: 'provider', summaryKey: 'cmdCatalog.provider.summary', binding: 'unbound', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', surfaces: ['repl'], registry: { category: 'Core', scope: 'providers' } }),
  c({ path: 'renew', summaryKey: 'cmdCatalog.renew.summary', binding: 'unbound', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', surfaces: ['repl'], registry: { category: 'Core', scope: 'cli' } }),
  c({ path: 'approve', summaryKey: 'cmdCatalog.approve.summary', binding: 'unbound', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', surfaces: ['repl'], registry: { category: 'Core', scope: 'cli' } }),
  c({ path: 'term', summaryKey: 'cmdCatalog.term.summary', binding: 'unbound', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', surfaces: ['repl'], registry: { category: 'Core', scope: 'cli' } }),
  c({ path: 'cd', summaryKey: 'cmdCatalog.cd.summary', binding: 'unbound', effect: 'local-write', defaultExecution: 'apply', authority: 'operator', output: 'text', surfaces: ['repl'], registry: { category: 'Core', scope: 'cli' } }),
  c({ path: 'clear', summaryKey: 'cmdCatalog.clear.summary', binding: 'unbound', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['repl'], registry: { category: 'Core', scope: 'cli' } }),
  c({ path: 'exit', summaryKey: 'cmdCatalog.exit.summary', binding: 'unbound', effect: 'read', defaultExecution: 'read', authority: 'open', output: 'text', surfaces: ['repl'], registry: { category: 'Core', scope: 'cli' } }),
]);

// ── Query API ───────────────────────────────────────────────────────────────

const BY_PATH: ReadonlyMap<string, CliCommandContract> = new Map(
  CLI_COMMAND_CONTRACTS.map((contract) => [contractPathKey(contract.path), contract]),
);

/** Exact path lookup — `getContract('agent list')` or `getContract(['agent','list'])`. */
export function getContract(path: readonly string[] | string): CliCommandContract | undefined {
  return BY_PATH.get(contractPathKey(path));
}

/** Contracts that describe a real Commander path (`surfaces` includes 'cli'). */
export function cliContracts(): readonly CliCommandContract[] {
  return CLI_COMMAND_CONTRACTS.filter((contract) => contract.surfaces.includes('cli'));
}

/** Contracts the coarse top-level COMMAND_REGISTRY projects. */
export function registryContracts(): readonly CliCommandContract[] {
  return CLI_COMMAND_CONTRACTS.filter((contract) => contract.registry !== undefined);
}

/**
 * Summary-binding debt detector. A healthy catalog produces an empty array;
 * the surface-truth battery fails if any live description stops resolving
 * exactly through its declared `summaryKey`.
 */
export const CONTRACT_SUMMARY_BINDING_DEBT: readonly string[] = Object.freeze(
  CLI_COMMAND_CONTRACTS.filter(
    (contract) => contract.surfaces.includes('cli') && contract.summaryBinding !== 'exact',
  ).map((contract) => contractPathKey(contract.path)),
);

/** Every option flag declared across the whole contract catalog. */
export function contractOptionCoverage(): {
  readonly total: number;
  readonly catalogBound: number;
} {
  const all = CLI_COMMAND_CONTRACTS.flatMap((contract) => contract.options);
  return {
    total: all.length,
    catalogBound: all.filter((option) => option.descriptionKey.length > 0).length,
  };
}

/** Every positional argument declared across the whole contract catalog. */
export function contractArgumentCoverage(): {
  readonly total: number;
  readonly catalogBound: number;
} {
  const all = CLI_COMMAND_CONTRACTS.flatMap((contract) => contract.arguments);
  return {
    total: all.length,
    catalogBound: all.filter((argument) => argument.descriptionKey.length > 0).length,
  };
}
