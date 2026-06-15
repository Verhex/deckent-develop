// src/cli/commands/config-nervous.ts
//
// `deckent config nervous` TUI — Nervous System yapılandırması.
// Sprint 147 Task 15.
// ADR-012: register<Name>(program) pattern.
// ADR-011: node:readline/promises for interactive prompts.
// ADR-010: no external deps — commander only.

import { createInterface } from 'node:readline/promises';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { ACTION_BY_ID, isSafetyFloorAction } from '../../nervous/action-registry.js';
import type { AuthorityMode, ApprovalPolicy } from '../../core/nervous-types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_PRESETS: ReadonlyArray<AuthorityMode> = [
  'strict',
  'balanced',
  'autopilot',
  'full-auto',
];

const VALID_POLICIES: ReadonlyArray<ApprovalPolicy> = [
  'autonomous',
  'suggest-30m',
  'suggest-5m',
  'approve',
];

// Risk→policy mapping for each preset. Descriptions are i18n keys (MSG-004) so
// the matrix table is fully localized rather than mixing hardcoded Turkish prose.
const PRESET_DESCRIPTIONS: Record<AuthorityMode, { low: ApprovalPolicy; medium: ApprovalPolicy; high: ApprovalPolicy }> = {
  strict: { low: 'suggest-30m', medium: 'approve', high: 'approve' },
  balanced: { low: 'autonomous', medium: 'suggest-30m', high: 'approve' },
  autopilot: { low: 'autonomous', medium: 'autonomous', high: 'suggest-5m' },
  'full-auto': { low: 'autonomous', medium: 'autonomous', high: 'autonomous' },
};

const PRESET_DESC_KEY: Record<AuthorityMode, string> = {
  strict: 'config_nervous.preset_strict',
  balanced: 'config_nervous.preset_balanced',
  autopilot: 'config_nervous.preset_autopilot',
  'full-auto': 'config_nervous.preset_full_auto',
};

// ─── ANSI Helpers ────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function c(text: string, ...codes: string[]): string {
  return codes.join('') + text + RESET;
}

function policyColor(policy: ApprovalPolicy): string {
  switch (policy) {
    case 'autonomous': return c(policy, GREEN);
    case 'suggest-30m': return c(policy, CYAN);
    case 'suggest-5m': return c(policy, CYAN);
    case 'approve': return c(policy, YELLOW);
  }
}

// ─── Config Read/Write ───────────────────────────────────────────────────────

interface NervousConfigSection {
  mode: AuthorityMode;
  enabled: boolean;
  actionOverrides: Record<string, ApprovalPolicy>;
  [key: string]: unknown;
}

interface ProjectConfig {
  nervous_system?: NervousConfigSection;
  [key: string]: unknown;
}

function getConfigFilePath(root: string): string {
  return join(root, '.deckent', 'config.json');
}

function readProjectConfig(root: string): ProjectConfig {
  const cfgPath = getConfigFilePath(root);
  if (!existsSync(cfgPath)) return {};
  try {
    return JSON.parse(readFileSync(cfgPath, 'utf-8')) as ProjectConfig;
  } catch {
    return {};
  }
}

function readNervousSection(root: string): NervousConfigSection {
  const cfg = readProjectConfig(root);
  return {
    mode: 'balanced',
    enabled: false,
    actionOverrides: {},
    ...(cfg.nervous_system ?? {}),
  };
}

function writeNervousSection(root: string, nervousSection: NervousConfigSection): void {
  const cfgPath = getConfigFilePath(root);
  const dir = join(root, '.deckent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const existing = readProjectConfig(root);
  const updated: ProjectConfig = {
    ...existing,
    nervous_system: nervousSection,
  };
  writeFileSync(cfgPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** `deckent config nervous set mode <preset>` */
export function handleSetMode(root: string, preset: string, lang: string = 'en'): void {
  const lng = getLanguage(lang);
  if (!(VALID_PRESETS as string[]).includes(preset)) {
    printError(getMessage('config_nervous.invalid_preset', lng, {
      preset,
      values: VALID_PRESETS.join(', '),
    }));
    process.exitCode = 1;
    return;
  }

  const ns = readNervousSection(root);
  const updated: NervousConfigSection = { ...ns, mode: preset as AuthorityMode };
  writeNervousSection(root, updated);
  print(c('  ' + getMessage('config_nervous.mode_set', lng, { preset }), GREEN));
}

/**
 * `deckent nervous enable [--mode <preset>]` — flip nervous_system.enabled=true
 * with ONE command instead of a manual JSON edit (make-usable batch), preserving
 * every other key. The default stays OFF (safety invariant) and authority
 * defaults to 'balanced' (medium/high-risk → human-approval; 5 safety-floor
 * actions ALWAYS require explicit approval). An explicit invalid preset is
 * rejected without enabling.
 */
export function handleEnableNervous(root: string, lang: string = 'en', mode?: string): void {
  const lng = getLanguage(lang);
  if (mode !== undefined && !(VALID_PRESETS as string[]).includes(mode)) {
    printError(getMessage('config_nervous.invalid_preset', lng, {
      preset: mode,
      values: VALID_PRESETS.join(', '),
    }));
    process.exitCode = 1;
    return;
  }
  const ns = readNervousSection(root);
  if (ns.enabled && mode === undefined) {
    print(c('  ' + getMessage('nervous.already_enabled', lng, { mode: ns.mode }), GREEN));
    return;
  }
  const updated: NervousConfigSection = { ...ns, enabled: true, ...(mode ? { mode: mode as AuthorityMode } : {}) };
  writeNervousSection(root, updated);
  print(c('  ' + getMessage('nervous.enabled_banner', lng, { mode: updated.mode }), GREEN));
}

/** `deckent config nervous override <ACTION_ID> <policy>` */
export function handleOverride(root: string, actionId: string, policy: string, lang: string = 'en'): void {
  const lng = getLanguage(lang);
  // Validate action ID exists
  if (!ACTION_BY_ID.has(actionId)) {
    printError(getMessage('config_nervous.invalid_action', lng, { id: actionId }));
    process.exitCode = 1;
    return;
  }

  // Safety floor protection — cannot be overridden to non-approve
  if (isSafetyFloorAction(actionId) && policy !== 'approve') {
    print(c('  ' + getMessage('config_nervous.safety_floor_blocked', lng, {
      id: actionId,
      policy,
    }), YELLOW));
    print(c('    ' + getMessage('config_nervous.safety_floor_note', lng), DIM));
    process.exitCode = 1;
    return;
  }

  // Validate policy
  if (!(VALID_POLICIES as string[]).includes(policy)) {
    printError(getMessage('config_nervous.invalid_policy', lng, {
      policy,
      values: VALID_POLICIES.join(', '),
    }));
    process.exitCode = 1;
    return;
  }

  const ns = readNervousSection(root);
  const updated: NervousConfigSection = {
    ...ns,
    actionOverrides: {
      ...ns.actionOverrides,
      [actionId]: policy as ApprovalPolicy,
    },
  };
  writeNervousSection(root, updated);
  print(c('  ' + getMessage('config_nervous.override_set', lng, { id: actionId, policy }), GREEN));
}

/** `deckent config nervous list` */
export function handleList(root: string, lang: string = 'en'): void {
  const lng = getLanguage(lang);
  const ns = readNervousSection(root);

  print('');
  print(c('  ' + getMessage('config_nervous.matrix_title', lng), BOLD));
  print('');

  // Table header
  const col1 = getMessage('config_nervous.col_preset', lng).padEnd(12);
  const col2 = getMessage('config_nervous.col_low', lng).padEnd(14);
  const col3 = getMessage('config_nervous.col_medium', lng).padEnd(14);
  const col4 = getMessage('config_nervous.col_high', lng).padEnd(14);
  const col5 = getMessage('config_nervous.col_description', lng);
  print(`  ${c(col1, BOLD)}${c(col2, BOLD)}${c(col3, BOLD)}${c(col4, BOLD)}${c(col5, BOLD)}`);
  print(`  ${'-'.repeat(76)}`);

  for (const preset of VALID_PRESETS) {
    const desc = PRESET_DESCRIPTIONS[preset];
    const description = getMessage(PRESET_DESC_KEY[preset]!, lng);
    const isActive = preset === ns.mode;
    const presetLabel = isActive
      ? c(preset.padEnd(12), MAGENTA, BOLD)
      : preset.padEnd(12);
    const activeMarker = isActive ? c(getMessage('config_nervous.active_marker', lng), MAGENTA) : '';

    print(
      `  ${presetLabel}${policyColor(desc.low).padEnd(14)}${policyColor(desc.medium).padEnd(14)}${policyColor(desc.high).padEnd(14)}${description}${activeMarker}`,
    );
  }

  print('');

  // Active overrides
  const overrides = ns.actionOverrides ?? {};
  const overrideEntries = Object.entries(overrides);
  if (overrideEntries.length > 0) {
    print(c('  ' + getMessage('config_nervous.active_overrides', lng), BOLD));
    for (const [actionId, policy] of overrideEntries) {
      print(`    ${c(actionId, CYAN)} → ${policyColor(policy)}`);
    }
    print('');
  } else {
    print(c('  ' + getMessage('config_nervous.no_overrides', lng), DIM));
    print('');
  }

  // Safety floor reminder
  print(c('  ' + getMessage('config_nervous.safety_floor_label', lng), DIM));
  const SAFETY_FLOOR_IDS = [
    'KILL_LIVE_SPRINT',
    'MANUAL_FILE_DELETE',
    'COST_OVER_THRESHOLD',
    'DESTRUCTIVE_GIT',
    'ADR_DEPRECATE_ACCEPTED',
  ];
  print(c(`    ${SAFETY_FLOOR_IDS.join(', ')}`, DIM));
  print('');
}

/** `deckent config nervous reset` */
export function handleReset(root: string, lang: string = 'en'): void {
  const lng = getLanguage(lang);
  const ns = readNervousSection(root);
  const updated: NervousConfigSection = { ...ns, actionOverrides: {} };
  writeNervousSection(root, updated);
  print(c('  ' + getMessage('config_nervous.reset_done', lng), GREEN));
}

/** `deckent config nervous` (interactive) */
async function handleInteractive(root: string, lang: string = 'en'): Promise<void> {
  const lng = getLanguage(lang);
  const ns = readNervousSection(root);

  print('');
  print(c('  ' + getMessage('config_nervous.interactive_title', lng), BOLD));
  print(c('  ' + getMessage('config_nervous.current_mode', lng, { mode: ns.mode }), DIM));
  print('');
  print('  ' + getMessage('config_nervous.available_presets', lng));
  VALID_PRESETS.forEach((p, i) => {
    const active = p === ns.mode ? c(getMessage('config_nervous.preset_current', lng), MAGENTA) : '';
    print(`    ${i + 1}. ${c(p, CYAN)}${active} — ${getMessage(PRESET_DESC_KEY[p]!, lng)}`);
  });
  print('');

  // Check if stdin is a TTY — if not, just show current config
  if (!process.stdin.isTTY) {
    print(c('  ' + getMessage('config_nervous.non_interactive', lng), DIM));
    print(`  ${getMessage('config_nervous.ni_mode', lng, { mode: c(ns.mode, MAGENTA) })}`);
    const overrideCount = Object.keys(ns.actionOverrides ?? {}).length;
    print(`  ${getMessage('config_nervous.ni_overrides', lng, { count: String(overrideCount) })}`);
    print('');
    return;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      '  ' + getMessage('config_nervous.select_prompt', lng, {
        max: String(VALID_PRESETS.length),
        mode: ns.mode,
      }),
    );

    const trimmed = answer.trim();
    if (trimmed === '') {
      print(c('  ' + getMessage('config_nervous.no_change', lng, { mode: ns.mode }), DIM));
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= VALID_PRESETS.length) {
        const selected = VALID_PRESETS[num - 1]!;
        const updated: NervousConfigSection = { ...ns, mode: selected };
        writeNervousSection(root, updated);
        print(c('  ' + getMessage('config_nervous.mode_updated', lng, { mode: selected }), GREEN));
      } else {
        // Try as preset name
        if ((VALID_PRESETS as string[]).includes(trimmed)) {
          const updated: NervousConfigSection = { ...ns, mode: trimmed as AuthorityMode };
          writeNervousSection(root, updated);
          print(c('  ' + getMessage('config_nervous.mode_updated', lng, { mode: trimmed }), GREEN));
        } else {
          printError(getMessage('config_nervous.invalid_selection', lng, { value: trimmed }));
          process.exitCode = 1;
        }
      }
    }

    print('');
    const overrides = ns.actionOverrides ?? {};
    if (Object.keys(overrides).length > 0) {
      print(c('  ' + getMessage('config_nervous.active_overrides', lng), BOLD));
      for (const [actionId, policy] of Object.entries(overrides)) {
        print(`    ${c(actionId, CYAN)} → ${policyColor(policy)}`);
      }
      const resetAnswer = await rl.question('  ' + getMessage('config_nervous.reset_prompt', lng));
      if (resetAnswer.trim().toLowerCase() === 'y') {
        const current = readNervousSection(root);
        writeNervousSection(root, { ...current, actionOverrides: {} });
        print(c('  ' + getMessage('config_nervous.overrides_reset', lng), GREEN));
      }
    }
  } finally {
    rl.close();
  }

  print('');
}

// ─── Register ────────────────────────────────────────────────────────────────

/**
 * Attaches `deckent config nervous` subcommand tree to the root program.
 * ADR-012: register<Name>(program) pattern — accepts root program, finds config subcommand.
 * This allows registration via `registerConfigNervous(program)` from index.ts.
 */
export function registerConfigNervous(program: Command): void {
  // Find the existing `config` command registered by registerConfig()
  // so we can attach `nervous` as a sub-subcommand.
  // If config command does not exist yet (e.g. in mocked tests), skip registration.
  const configCmd = program.commands.find((c) => c.name() === 'config');
  if (!configCmd) return;
  const nervousCmd = configCmd
    .command('nervous')
    .description(
      'Configure Nervous System authority mode and action overrides',
    )
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (_opts: unknown, cmd: Command) => {
      const root = resolveProjectRoot();
      await handleInteractive(root, langOf(cmd));
    });

  // deckent config nervous set mode <preset>
  nervousCmd
    .command('set')
    .description('Set a nervous system configuration value')
    .argument('<key>', 'Configuration key (e.g. mode)')
    .argument('<value>', 'Value to set')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((key: string, value: string, _opts: unknown, cmd: Command) => {
      const root = resolveProjectRoot();
      const lang = langOf(cmd);
      if (key === 'mode') {
        handleSetMode(root, value, lang);
      } else {
        printError(getMessage('config_nervous.unknown_key', lang, { key }));
        process.exitCode = 1;
      }
    });

  // deckent config nervous override <ACTION_ID> <policy>
  nervousCmd
    .command('override <actionId> <policy>')
    .description('Set a per-action policy override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((actionId: string, policy: string, _opts: unknown, cmd: Command) => {
      const root = resolveProjectRoot();
      handleOverride(root, actionId, policy, langOf(cmd));
    });

  // deckent config nervous list
  nervousCmd
    .command('list')
    .description('Show current authority matrix with all presets')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((_opts: unknown, cmd: Command) => {
      const root = resolveProjectRoot();
      handleList(root, langOf(cmd));
    });

  // deckent config nervous reset
  nervousCmd
    .command('reset')
    .description('Reset all action overrides to preset defaults')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((_opts: unknown, cmd: Command) => {
      const root = resolveProjectRoot();
      handleReset(root, langOf(cmd));
    });
}

/**
 * Resolve --lang from a command, tolerating commander attaching the flag to an
 * ancestor (`config nervous`) rather than the invoked sub-subcommand.
 */
function langOf(cmd: Command): string {
  const own = (cmd.opts() as { lang?: string }).lang;
  const parent = (cmd.parent?.opts() as { lang?: string } | undefined)?.lang;
  const grand = (cmd.parent?.parent?.opts() as { lang?: string } | undefined)?.lang;
  return getLanguage(own ?? parent ?? grand);
}
