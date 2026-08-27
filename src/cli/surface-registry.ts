/** Canonical, transport-neutral metadata for every registered top-level CLI command. */

export const SURFACE_GROUPS = ['run', 'observe', 'control', 'system', 'advanced'] as const;
export type SurfaceGroup = (typeof SURFACE_GROUPS)[number];

export const SURFACE_STATUSES = ['visible', 'advanced', 'deprecated'] as const;
export type SurfaceStatus = (typeof SURFACE_STATUSES)[number];

export interface CommandDeprecation {
  readonly replacement: string;
  readonly removalNote: string;
}

export interface SurfaceCommand {
  readonly name: string;
  readonly group: SurfaceGroup;
  readonly summaryKey: string;
  readonly aliases: readonly string[];
  readonly status: SurfaceStatus;
  readonly deprecation?: CommandDeprecation;
}

type RegistryRow = readonly [
  name: string,
  group: SurfaceGroup,
  summaryKey: string,
  aliases?: readonly string[],
];

const VISIBLE_ROWS = [
  ['do', 'run', 'cli.do.desc'],
  ['run', 'run', 'cli.run.desc'],
  ['plan', 'run', 'cli.plan.desc'],
  ['start', 'run', 'cli.start.desc'],
  ['runs', 'run', 'cli.runs.desc'],
  ['review', 'run', 'cli.review.desc'],
  ['status', 'observe', 'status.desc'],
  ['watch', 'observe', 'cli.watch.desc'],
  ['inspect', 'observe', 'inspect.description'],
  ['history', 'observe', 'history.desc'],
  ['retro', 'observe', 'cli.retro.desc'],
  ['approvals', 'control', 'approvals.cmd_desc'],
  ['kill', 'control', 'cli.kill.desc'],
  ['recover', 'control', 'recover.description'],
  ['cleanup', 'control', 'cli.cleanup.desc'],
  ['autonomous', 'control', 'cli.autonomous.desc'],
  ['nervous', 'control', 'cli.nervous.desc'],
  ['xverify', 'control', 'xverify.cmd_desc'],
  ['init', 'system', 'cli.init.desc'],
  ['config', 'system', 'cli.config.desc'],
  ['doctor', 'system', 'cli.doctor.desc'],
  ['help', 'system', 'cli.help_command.desc'],
  ['sync', 'system', 'cli.sync.desc'],
  ['upgrade', 'system', 'cli.upgrade.desc'],
  ['connect', 'system', 'cli.connect.desc'],
  ['limits', 'system', 'cli.limits.desc'],
  ['usage', 'system', 'cli.usage.desc'],
  ['agent', 'system', 'cli.agent.desc'],
  ['skill', 'system', 'cli.skill.desc'],
  ['models', 'system', 'cli.models.desc'],
  ['memory', 'system', 'cli.memory.desc'],
  ['serve', 'system', 'cli.serve.desc'],
  ['bot', 'system', 'bot.group_desc'],
  ['mcp', 'system', 'cli.memcat.mcp.desc'],
] as const satisfies readonly RegistryRow[];

const ADVANCED_ROWS = [
  ['spawn', 'advanced', 'cli.spawn.desc'],
  ['plugin', 'advanced', 'cli.plugin.desc'],
  ['onboard', 'advanced', 'cli.onboard.desc'],
  ['analyze', 'advanced', 'cli.analyze.desc', ['analyze-project']],
  ['archive', 'advanced', 'archive.description'],
  ['process', 'advanced', 'cli.process.desc'],
  ['test', 'advanced', 'cli.test_run.test.desc'],
  ['finalize', 'advanced', 'finalize.description'],
  ['set-directives', 'advanced', 'cli.set_directives.desc'],
  ['heartbeat', 'advanced', 'cli.heartbeat.desc'],
  ['chat', 'advanced', 'cli.chat.desc'],
  ['docs', 'advanced', 'cli.docs.desc'],
  ['task', 'advanced', 'task.cmd_desc'],
  ['cost', 'advanced', 'cli.cost.desc'],
  ['trace', 'advanced', 'trace.desc'],
  ['resume', 'advanced', 'cli.resume.desc'],
  ['mode', 'advanced', 'mode.group_desc'],
  ['features', 'advanced', 'cli.features.desc', ['feature-query']],
  ['truth', 'advanced', 'cli.truth.desc'],
  ['audit', 'advanced', 'cli.audit.desc'],
  ['flow', 'advanced', 'cli.flow.desc'],
  ['rbac', 'advanced', 'cli.rbac.desc'],
  ['evolve', 'advanced', 'cli.evolve.desc'],
  ['gateway', 'advanced', 'gateway.group_desc'],
  // Internal supervisor entry: its catalog summary explicitly records that it is hidden.
  ['gateway-runtime', 'advanced', 'gateway.runtime_desc'],
  ['resources', 'advanced', 'cli.resources.desc'],
  ['kpi', 'advanced', 'cli.kpi.desc'],
  ['image', 'advanced', 'cli.image.desc'],
  ['openrouter-probe', 'advanced', 'cli.openrouter_probe.desc'],
  ['provider-authority', 'advanced', 'provider_authority.cmd_desc'],
  ['provider-observations', 'advanced', 'cli.governance.provider_observations.desc'],
  ['execution-authority', 'advanced', 'execution_authority.cmd_desc'],
  ['cu-status', 'advanced', 'cli.cu_status.desc'],
  ['local-llm', 'advanced', 'local_llm.cmd_desc'],
  ['help-info', 'advanced', 'cli.help.help_info.desc', ['info']],
] as const satisfies readonly RegistryRow[];

const REMOVAL_NOTE = 'Remove after the v2.1 deprecation window.';

const DEPRECATED_ROWS = [
  ['dashboard', 'cli.dashboard.desc', 'status --watch'],
  ['attach', 'cli.attach.desc', 'watch'],
  ['output', 'cli.output.desc', 'watch --logs'],
  ['plan-nl', 'cli.plan_nl.desc', 'do'],
  ['archive-debt', 'cli.archive_debt.desc', 'status --debt'],
  ['confirmations', 'confirmations.cmd_desc', 'approvals'],
  ['checkpoint', 'cli.checkpoint.desc', 'approvals'],
  ['audit-verify', 'cli.audit_verify.desc', 'audit verify'],
  ['autonomous-mission', 'cli.autonomous_mission.desc', 'autonomous mission'],
  ['explain', 'cli.explain.desc', 'retro --explain'],
  ['recall', 'cli.recall.desc', 'memory recall'],
  ['remember', 'cli.remember.desc', 'memory remember'],
] as const;

function fromRow(row: RegistryRow, status: 'visible' | 'advanced'): SurfaceCommand {
  return Object.freeze({
    name: row[0],
    group: row[1],
    summaryKey: row[2],
    aliases: Object.freeze([...(row[3] ?? [])]),
    status,
  });
}

/** The single machine-readable universe of top-level CLI commands. */
export const SURFACE_REGISTRY: readonly SurfaceCommand[] = Object.freeze([
  ...VISIBLE_ROWS.map((row) => fromRow(row, 'visible')),
  ...ADVANCED_ROWS.map((row) => fromRow(row, 'advanced')),
  ...DEPRECATED_ROWS.map(([name, summaryKey, replacement]) => Object.freeze({
    name,
    group: 'advanced' as const,
    summaryKey,
    aliases: Object.freeze([]),
    status: 'deprecated' as const,
    deprecation: Object.freeze({ replacement, removalNote: REMOVAL_NOTE }),
  })),
]);

const COMMAND_INDEX: ReadonlyMap<string, SurfaceCommand> = new Map(
  SURFACE_REGISTRY.flatMap((command) => [
    [command.name, command] as const,
    ...command.aliases.map((alias) => [alias, command] as const),
  ]),
);

/** Return commands in their canonical registry order for a help group. */
export function listByGroup(group: SurfaceGroup): readonly SurfaceCommand[] {
  return SURFACE_REGISTRY.filter((command) => command.group === group);
}

/** Resolve a canonical command name or a registered alias. */
export function findCommand(name: string): SurfaceCommand | undefined {
  return COMMAND_INDEX.get(name);
}

/** Return canonical names of commands still inside the removal window. */
export function deprecatedSet(): ReadonlySet<string> {
  return new Set(
    SURFACE_REGISTRY
      .filter((command) => command.status === 'deprecated')
      .map((command) => command.name),
  );
}
