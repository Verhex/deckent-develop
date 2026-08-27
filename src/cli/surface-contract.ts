/** Declarative batch surface contract; behavior is implemented by later slices. */

export const DEPRECATED_FORWARDING_SURFACES = [
  ['dashboard', 'status --watch', 'cli.batch.deprecated.dashboard'],
  ['attach', 'watch', 'cli.batch.deprecated.attach'],
  ['output', 'watch --logs', 'cli.batch.deprecated.output'],
  ['plan-nl', 'do', 'cli.batch.deprecated.plan_nl'],
  ['archive-debt', 'status --debt', 'cli.batch.deprecated.archive_debt'],
  ['confirmations', 'approvals', 'cli.batch.deprecated.confirmations'],
  ['checkpoint', 'approvals', 'cli.batch.deprecated.checkpoint'],
  ['audit-verify', 'audit verify', 'cli.batch.deprecated.audit_verify'],
  ['autonomous-mission', 'autonomous mission', 'cli.batch.deprecated.autonomous_mission'],
  ['explain', 'retro --explain', 'cli.batch.deprecated.explain'],
  ['recall', 'memory recall', 'cli.batch.deprecated.recall'],
  ['remember', 'memory remember', 'cli.batch.deprecated.remember'],
] as const;

export type DeprecatedForwardingSurface = {
  readonly command: string;
  readonly replacement: string;
  readonly warningKey: string;
  readonly status: 'deprecated-forwarding';
};

export const DEPRECATED_FORWARDING: readonly DeprecatedForwardingSurface[] = Object.freeze(
  DEPRECATED_FORWARDING_SURFACES.map(([command, replacement, warningKey]) => Object.freeze({
    command, replacement, warningKey, status: 'deprecated-forwarding' as const,
  })),
);

export const APPROVALS_CLASS_CONTRACT = Object.freeze({
  command: 'approvals', option: '--class <class>', optionHelpKey: 'approvals.opt_class',
  errorKey: 'approvals.class_invalid',
  classes: Object.freeze(['confirmation', 'autonomous', 'nervous', 'panic', 'checkpoint', 'bot', 'pairing'] as const),
});

export const LIMITS_PROVIDER_FILTERS = Object.freeze([
  Object.freeze({ option: '--claude', helpKey: 'limits.opt_claude' }),
  Object.freeze({ option: '--codex', helpKey: 'limits.opt_codex' }),
  Object.freeze({ option: '--cursor', helpKey: 'limits.opt_cursor' }),
] as const);

export const SURFACE_SUBCOMMAND_GROUPS = Object.freeze({
  audit: Object.freeze(['verify'] as const),
  autonomous: Object.freeze(['mission'] as const),
  memory: Object.freeze(['recall', 'remember'] as const),
});

export const RETRO_FLAGS = Object.freeze([
  Object.freeze({ option: '--explain', helpKey: 'cli.retro.opt.explain' }),
  Object.freeze({ option: '--task <id>', helpKey: 'cli.retro.opt.task' }),
] as const);

export const SURFACE_CONTRACT = Object.freeze({
  deprecatedForwarding: DEPRECATED_FORWARDING,
  approvals: APPROVALS_CLASS_CONTRACT,
  limits: LIMITS_PROVIDER_FILTERS,
  retro: RETRO_FLAGS,
  subcommandGroups: SURFACE_SUBCOMMAND_GROUPS,
});

export type SurfaceContract = typeof SURFACE_CONTRACT;
