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

// Matrix description for each preset
const PRESET_DESCRIPTIONS: Record<AuthorityMode, { low: ApprovalPolicy; medium: ApprovalPolicy; high: ApprovalPolicy; description: string }> = {
  strict: {
    low: 'suggest-30m',
    medium: 'approve',
    high: 'approve',
    description: 'Enterprise / yeni kullanıcı — tüm medium/high eylemler onay bekler',
  },
  balanced: {
    low: 'autonomous',
    medium: 'suggest-30m',
    high: 'approve',
    description: 'Varsayılan — düşük risk otonom, orta 30dk öneri, yüksek onay',
  },
  autopilot: {
    low: 'autonomous',
    medium: 'autonomous',
    high: 'suggest-5m',
    description: 'Güvenilir kullanıcı — düşük/orta otonom, yüksek 5dk öneri',
  },
  'full-auto': {
    low: 'autonomous',
    medium: 'autonomous',
    high: 'autonomous',
    description: 'CI/CD / hands-off — tümü otonom (safety floor hariç)',
  },
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
export function handleSetMode(root: string, preset: string): void {
  if (!(VALID_PRESETS as string[]).includes(preset)) {
    printError(
      `Invalid preset: "${preset}". Valid values: ${VALID_PRESETS.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const ns = readNervousSection(root);
  const updated: NervousConfigSection = { ...ns, mode: preset as AuthorityMode };
  writeNervousSection(root, updated);
  print(c(`  ✓ Mode set to: ${preset}`, GREEN));
}

/** `deckent config nervous override <ACTION_ID> <policy>` */
export function handleOverride(root: string, actionId: string, policy: string): void {
  // Validate action ID exists
  if (!ACTION_BY_ID.has(actionId)) {
    printError(
      `Invalid action ID: "${actionId}". Run \`deckent config nervous list\` to see all 30 actions.`,
    );
    process.exitCode = 1;
    return;
  }

  // Safety floor protection — cannot be overridden to non-approve
  if (isSafetyFloorAction(actionId) && policy !== 'approve') {
    print(
      c(
        `  ⚠ Safety floor action "${actionId}" cannot be set to "${policy}".`,
        YELLOW,
      ),
    );
    print(
      c(
        '    Safety floor actions always require explicit user approval.',
        DIM,
      ),
    );
    process.exitCode = 1;
    return;
  }

  // Validate policy
  if (!(VALID_POLICIES as string[]).includes(policy)) {
    printError(
      `Invalid policy: "${policy}". Valid values: ${VALID_POLICIES.join(', ')}`,
    );
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
  print(c(`  ✓ Override set: ${actionId} → ${policy}`, GREEN));
}

/** `deckent config nervous list` */
export function handleList(root: string): void {
  const ns = readNervousSection(root);

  print('');
  print(c('  Nervous System Authority Matrix:', BOLD));
  print('');

  // Table header
  const col1 = 'Preset'.padEnd(12);
  const col2 = 'Low Risk'.padEnd(14);
  const col3 = 'Medium Risk'.padEnd(14);
  const col4 = 'High Risk'.padEnd(14);
  const col5 = 'Description';
  print(`  ${c(col1, BOLD)}${c(col2, BOLD)}${c(col3, BOLD)}${c(col4, BOLD)}${c(col5, BOLD)}`);
  print(`  ${'-'.repeat(76)}`);

  for (const preset of VALID_PRESETS) {
    const desc = PRESET_DESCRIPTIONS[preset];
    const isActive = preset === ns.mode;
    const presetLabel = isActive
      ? c(preset.padEnd(12), MAGENTA, BOLD)
      : preset.padEnd(12);
    const activeMarker = isActive ? c(' ◀ active', MAGENTA) : '';

    print(
      `  ${presetLabel}${policyColor(desc.low).padEnd(14)}${policyColor(desc.medium).padEnd(14)}${policyColor(desc.high).padEnd(14)}${desc.description}${activeMarker}`,
    );
  }

  print('');

  // Active overrides
  const overrides = ns.actionOverrides ?? {};
  const overrideEntries = Object.entries(overrides);
  if (overrideEntries.length > 0) {
    print(c('  Active Overrides:', BOLD));
    for (const [actionId, policy] of overrideEntries) {
      print(`    ${c(actionId, CYAN)} → ${policyColor(policy)}`);
    }
    print('');
  } else {
    print(c('  No active overrides.', DIM));
    print('');
  }

  // Safety floor reminder
  print(c('  Safety Floor (always approve):', DIM));
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
export function handleReset(root: string): void {
  const ns = readNervousSection(root);
  const updated: NervousConfigSection = { ...ns, actionOverrides: {} };
  writeNervousSection(root, updated);
  print(c('  ✓ Action overrides reset to preset defaults.', GREEN));
}

/** `deckent config nervous` (interactive) */
async function handleInteractive(root: string): Promise<void> {
  const ns = readNervousSection(root);

  print('');
  print(c('  🧠 Nervous System Configuration', BOLD));
  print(c(`  Current mode: ${ns.mode}`, DIM));
  print('');
  print('  Available presets:');
  VALID_PRESETS.forEach((p, i) => {
    const active = p === ns.mode ? c(' (current)', MAGENTA) : '';
    print(`    ${i + 1}. ${c(p, CYAN)}${active} — ${PRESET_DESCRIPTIONS[p]!.description}`);
  });
  print('');

  // Check if stdin is a TTY — if not, just show current config
  if (!process.stdin.isTTY) {
    print(c('  (Non-interactive mode — use subcommands to modify config)', DIM));
    print(`  Mode: ${c(ns.mode, MAGENTA)}`);
    const overrideCount = Object.keys(ns.actionOverrides ?? {}).length;
    print(`  Overrides: ${overrideCount}`);
    print('');
    return;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      `  Select preset (1-${VALID_PRESETS.length}) or press Enter to keep "${ns.mode}": `,
    );

    const trimmed = answer.trim();
    if (trimmed === '') {
      print(c(`  No change — mode remains: ${ns.mode}`, DIM));
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= VALID_PRESETS.length) {
        const selected = VALID_PRESETS[num - 1]!;
        const updated: NervousConfigSection = { ...ns, mode: selected };
        writeNervousSection(root, updated);
        print(c(`  ✓ Mode updated to: ${selected}`, GREEN));
      } else {
        // Try as preset name
        if ((VALID_PRESETS as string[]).includes(trimmed)) {
          const updated: NervousConfigSection = { ...ns, mode: trimmed as AuthorityMode };
          writeNervousSection(root, updated);
          print(c(`  ✓ Mode updated to: ${trimmed}`, GREEN));
        } else {
          printError(`Invalid selection: "${trimmed}"`);
          process.exitCode = 1;
        }
      }
    }

    print('');
    const overrides = ns.actionOverrides ?? {};
    if (Object.keys(overrides).length > 0) {
      print(c('  Active overrides:', BOLD));
      for (const [actionId, policy] of Object.entries(overrides)) {
        print(`    ${c(actionId, CYAN)} → ${policyColor(policy)}`);
      }
      const resetAnswer = await rl.question('  Reset overrides? [y/N]: ');
      if (resetAnswer.trim().toLowerCase() === 'y') {
        const current = readNervousSection(root);
        writeNervousSection(root, { ...current, actionOverrides: {} });
        print(c('  ✓ Overrides reset.', GREEN));
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
    .action(async () => {
      const root = resolveProjectRoot();
      await handleInteractive(root);
    });

  // deckent config nervous set mode <preset>
  nervousCmd
    .command('set')
    .description('Set a nervous system configuration value')
    .argument('<key>', 'Configuration key (e.g. mode)')
    .argument('<value>', 'Value to set')
    .action((key: string, value: string) => {
      const root = resolveProjectRoot();
      if (key === 'mode') {
        handleSetMode(root, value);
      } else {
        printError(`Unknown nervous config key: "${key}". Supported: mode`);
        process.exitCode = 1;
      }
    });

  // deckent config nervous override <ACTION_ID> <policy>
  nervousCmd
    .command('override <actionId> <policy>')
    .description('Set a per-action policy override')
    .action((actionId: string, policy: string) => {
      const root = resolveProjectRoot();
      handleOverride(root, actionId, policy);
    });

  // deckent config nervous list
  nervousCmd
    .command('list')
    .description('Show current authority matrix with all presets')
    .action(() => {
      const root = resolveProjectRoot();
      handleList(root);
    });

  // deckent config nervous reset
  nervousCmd
    .command('reset')
    .description('Reset all action overrides to preset defaults')
    .action(() => {
      const root = resolveProjectRoot();
      handleReset(root);
    });
}
