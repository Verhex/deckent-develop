/**
 * generate-cli-docs.ts — Auto-generate CLI reference documentation
 *
 * Reads CLI command metadata and generates docs/generated/en/reference/cli.md.
 * Run: npm run docs:generate-cli
 *
 * Strategy: Reads command definitions from src/cli/commands/ source files
 * and builds a structured representation, then renders to Markdown.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelRegistry } from '../src/core/model-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const documentedModels = modelRegistry.getAllModels().map(model => model.id).join(', ');
const documentedDefaultModel = modelRegistry.getByProviderAndTier('claude', 'standard');
if (!documentedDefaultModel) throw new Error('E_CLI_DOC_DEFAULT_MODEL_UNAVAILABLE');

// ─── Types ──────────────────────────────────────────────────────────

export interface CliOption {
  flags: string;
  description: string;
  defaultValue?: string;
}

export interface CliSubcommand {
  name: string;
  description: string;
  options?: CliOption[];
  args?: string;
  examples?: string[];
}

export interface CliCommand {
  name: string;
  args?: string;
  description: string;
  options?: CliOption[];
  subcommands?: CliSubcommand[];
  examples?: string[];
  category: CommandCategory;
}

export type CommandCategory =
  | 'Project Setup'
  | 'Run Workflow'
  | 'Monitoring'
  | 'Workers & Tasks'
  | 'Configuration'
  | 'Skills & Agents'
  | 'Plugins'
  | 'Server & Dashboard'
  | 'Utilities';

// ─── Command Metadata ────────────────────────────────────────────────

export const CLI_COMMANDS: CliCommand[] = [
  // ── Project Setup ──────────────────────────────────────────────
  {
    name: 'init',
    description: 'Initialize a new Deckent project in the current directory. Creates .deckent/, .brain/, agent rules, DIRECTIVES.md, and optional IDE-specific config files.',
    category: 'Project Setup',
    options: [
      { flags: '--auto', description: 'Auto-detect system, subscription, and project to generate recommendations' },
      { flags: '--manual', description: 'Skip auto-detection, use interactive prompts only' },
      { flags: '--cursor', description: 'Configure for Cursor IDE environment' },
      { flags: '--claude-code', description: 'Configure for Claude Code environment (default)' },
      { flags: '--env <envs>', description: 'Comma-separated environments to configure (codex,cursor,gemini,vscode,shell)' },
      { flags: '--all-envs', description: 'Configure ALL environment configs' },
    ],
    examples: [
      'deckent init',
      'deckent init --auto',
      'deckent init --env codex,cursor',
      'deckent init --all-envs',
    ],
  },
  {
    name: 'onboard',
    description: 'Run the interactive onboarding wizard. Guides new users through provider setup, project configuration, and first-sprint preparation.',
    category: 'Project Setup',
    options: [
      { flags: '--non-interactive', description: 'Skip interactive prompts, use defaults' },
    ],
    examples: [
      'deckent onboard',
      'deckent onboard --non-interactive',
    ],
  },
  {
    name: 'upgrade',
    description: 'Self-update deckent to the latest version via npm.',
    category: 'Project Setup',
    options: [
      { flags: '--check', description: 'Only check for updates, do not install' },
    ],
    examples: [
      'deckent upgrade',
      'deckent upgrade --check',
    ],
  },

  // ── Run Workflow ─────────────────────────────────────────────
  {
    name: 'start',
    args: '[description]',
    description: 'Start a new sprint. Optionally pass a one-line description for zero-config mode — Deckent creates a temporary DIRECTIVES.md and starts immediately.',
    category: 'Run Workflow',
    options: [
      { flags: '--auto-approve', description: 'Auto-approve worker actions (--dangerously-skip-permissions)' },
      { flags: '--sandbox-mode', description: 'Run in sandbox mode (Docker)' },
      { flags: '--dry-run', description: 'Plan sprint without spawning workers' },
      { flags: '--force', description: 'Skip doctor pre-flight checks' },
      { flags: '--watch', description: 'Automatically open watch mode after sprint spawns workers' },
    ],
    examples: [
      'deckent start',
      'deckent start "Add JWT authentication to the Express API"',
      'deckent start --dry-run',
      'deckent start --force --watch',
    ],
  },
  {
    name: 'plan',
    description: 'Plan the next sprint without executing it. Reads DIRECTIVES.md, checks usage, and generates task files in .tasks/. Prompts for confirmation before writing.',
    category: 'Run Workflow',
    options: [
      { flags: '--no-confirm', description: 'Skip confirmation, auto-approve plan' },
      { flags: '--structured', description: 'Force structured parsing (skip AI planner)' },
    ],
    examples: [
      'deckent plan',
      'deckent plan --no-confirm',
      'deckent plan --structured',
    ],
  },
  {
    name: 'test',
    description: 'Run a test sprint — no retro, no memory update, no decay. Useful for validating DIRECTIVES.md before committing to a full sprint.',
    category: 'Run Workflow',
    options: [
      { flags: '--keep', description: 'Skip cleanup — leave task files in place after test' },
      { flags: '--timeout <ms>', description: 'Maximum sprint duration in milliseconds', defaultValue: '300000' },
    ],
    examples: [
      'deckent test',
      'deckent test --keep',
      'deckent test --timeout 60000',
    ],
  },
  {
    name: 'finalize',
    description: 'Finalize a sprint: update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md, config metadata, and optionally run memory decay.',
    category: 'Run Workflow',
    options: [
      { flags: '--skip-decay', description: 'Skip memory/debt decay phase' },
      { flags: '--skip-hooks', description: 'Skip plugin afterSprint hooks' },
    ],
    examples: [
      'deckent finalize',
      'deckent finalize --skip-decay',
    ],
  },
  {
    name: 'cleanup',
    description: 'Clean up after a sprint. Removes task files, heartbeat files, and lock files. Optionally runs memory decay.',
    category: 'Run Workflow',
    options: [
      { flags: '--decay', description: 'Force run memory decay (compress .brain/ files)' },
    ],
    examples: [
      'deckent cleanup',
      'deckent cleanup --decay',
    ],
  },
  {
    name: 'review',
    description: 'Review sprint tasks with evaluations. Shows task results, self-assessments, and lets you approve or reject outcomes.',
    category: 'Run Workflow',
    options: [
      { flags: '--auto', description: 'Auto-approve/reject based on task results' },
      { flags: '--json', description: 'Output review state as JSON' },
    ],
    examples: [
      'deckent review',
      'deckent review --auto',
      'deckent review --json',
    ],
  },
  {
    name: 'retro',
    description: 'Show the latest sprint retrospective from .brain/RETRO.md.',
    category: 'Run Workflow',
    options: [
      { flags: '--raw', description: 'Show raw RETRO.md content without formatting' },
      { flags: '--compare', description: 'Show delta comparison with previous sprint' },
    ],
    examples: [
      'deckent retro',
      'deckent retro --compare',
    ],
  },
  {
    name: 'explain',
    description: 'Explain what the last sprint did in human-friendly language. Reads sprint logs, task results, and retro to produce a plain-English summary.',
    category: 'Run Workflow',
    examples: [
      'deckent explain',
    ],
  },

  // ── Monitoring ──────────────────────────────────────────────────
  {
    name: 'status',
    description: 'Show the current sprint dashboard. Displays worker status, task progress, and phase information.',
    category: 'Monitoring',
    options: [
      { flags: '--watch', description: 'Auto-refresh every 2 seconds' },
      { flags: '--json', description: 'Output raw JSON instead of formatted dashboard' },
      { flags: '--raw', description: 'Show legacy raw dashboard (box format)' },
      { flags: '--verbose', description: 'Show detailed agent and skill assignment info' },
    ],
    examples: [
      'deckent status',
      'deckent status --watch',
      'deckent status --json',
      'deckent status --verbose',
    ],
  },
  {
    name: 'watch',
    description: 'Open a live tmux split view: dashboard pane + worker panes. Requires an active tmux session.',
    category: 'Monitoring',
    options: [
      { flags: '--follow <taskId>', description: 'Attach to a specific worker pane by task ID' },
    ],
    examples: [
      'deckent watch',
      'deckent watch --follow 001-003',
    ],
  },
  {
    name: 'dashboard',
    description: 'Show a terminal dashboard with auto-refresh (CLI rendering, no browser).',
    category: 'Monitoring',
    options: [
      { flags: '--interval <ms>', description: 'Refresh interval in milliseconds', defaultValue: '2000' },
    ],
    examples: [
      'deckent dashboard',
      'deckent dashboard --interval 5000',
    ],
  },
  {
    name: 'history',
    description: 'Show sprint history from .brain/sprints/. Displays a table of sprints with task counts, coverage, and duration.',
    category: 'Monitoring',
    options: [
      { flags: '--agent <name>', description: 'Filter by agent name' },
      { flags: '--skill <name>', description: 'Filter by skill name' },
    ],
    examples: [
      'deckent history',
      'deckent history --agent brain',
    ],
  },
  {
    name: 'usage',
    description: 'Show usage metrics (model calls, token counts, estimated cost for API mode).',
    category: 'Monitoring',
    options: [
      { flags: '--json', description: 'Output as JSON' },
      { flags: '--sprint <id>', description: 'Filter by sprint ID' },
    ],
    examples: [
      'deckent usage',
      'deckent usage --sprint sprint-042',
      'deckent usage --json',
    ],
  },
  {
    name: 'analyze',
    description: 'Analyze project stack, size, and recommended methodology. Detects framework, language, test framework, and build tool from the project.',
    category: 'Monitoring',
    options: [
      { flags: '--json', description: 'Output raw JSON' },
    ],
    examples: [
      'deckent analyze',
      'deckent analyze --json',
    ],
  },

  // ── Workers & Tasks ─────────────────────────────────────────────
  {
    name: 'spawn',
    args: '<taskId>',
    description: 'Manually spawn a tmux worker for a specific task ID. The task JSON must already exist in .tasks/.',
    category: 'Workers & Tasks',
    examples: [
      'deckent spawn 001-003',
    ],
  },
  {
    name: 'kill',
    args: '<taskId>',
    description: 'Kill a running worker by task ID. Terminates the tmux pane associated with the task.',
    category: 'Workers & Tasks',
    examples: [
      'deckent kill 001-003',
    ],
  },
  {
    name: 'attach',
    description: 'Attach to the active tmux orchestra session. Equivalent to `tmux attach -t deckent`.',
    category: 'Workers & Tasks',
    examples: [
      'deckent attach',
    ],
  },
  {
    name: 'run',
    args: '<description>',
    description: 'Run a single one-shot task without a sprint cycle. Creates a minimal task, spawns one worker, waits for the result.',
    category: 'Workers & Tasks',
    options: [
      { flags: '--model <model>', description: `Canonical provider API model ID. Registered options: ${documentedModels}`, defaultValue: documentedDefaultModel.id },
      { flags: '--scope <dir>', description: 'Worker scope directory', defaultValue: './' },
    ],
    examples: [
      'deckent run "Fix the login page redirect bug"',
      `deckent run "Add input validation" --model ${documentedDefaultModel.id} --scope src/api/`,
    ],
  },
  {
    name: 'sync',
    description: 'Sync adapter files (CLAUDE.md, AGENTS.md) and detect out-of-band changes since the last sprint.',
    category: 'Workers & Tasks',
    options: [
      { flags: '--git-only', description: 'Only detect git changes (skip adapter file sync)' },
      { flags: '--adapters-only', description: 'Only sync adapter files (skip git change detection)' },
    ],
    examples: [
      'deckent sync',
      'deckent sync --git-only',
    ],
  },

  // ── Configuration ────────────────────────────────────────────────
  {
    name: 'config',
    description: 'Show or modify project configuration (.deckent/config.json).',
    category: 'Configuration',
    subcommands: [
      {
        name: 'set',
        args: '<key> <value>',
        description: 'Set a configuration value by key.',
        examples: [
          'deckent config set brain_provider claude',
          'deckent config set max_workers 5',
        ],
      },
      {
        name: 'export',
        args: '[file]',
        description: 'Export config to stdout or a file (strips comments, validates JSON).',
        examples: [
          'deckent config export',
          'deckent config export config-backup.json',
        ],
      },
      {
        name: 'import',
        args: '<file>',
        description: 'Import config from a JSON file, merging over existing config.',
        examples: [
          'deckent config import config-backup.json',
        ],
      },
    ],
    examples: [
      'deckent config',
      'deckent config set max_workers 8',
      'deckent config export',
      'deckent config import my-config.json',
    ],
  },
  {
    name: 'archive-debt',
    description: 'Archive resolved debt items from .brain/DEBT.md to .brain/archive/.',
    category: 'Configuration',
    examples: [
      'deckent archive-debt',
    ],
  },
  {
    name: 'doctor',
    description: 'Check system dependencies and health. Verifies Node.js version, Claude CLI, tmux, and project configuration.',
    category: 'Configuration',
    options: [
      { flags: '--profile', description: 'Show system profile information' },
      { flags: '--legacy', description: 'Use legacy output format' },
    ],
    examples: [
      'deckent doctor',
      'deckent doctor --profile',
    ],
  },

  // ── Skills & Agents ─────────────────────────────────────────────
  {
    name: 'skill',
    description: 'Manage the skill pool (.deckent/skills/).',
    category: 'Skills & Agents',
    subcommands: [
      {
        name: 'list',
        description: 'List all installed skills.',
        options: [
          { flags: '--json', description: 'Output as JSON' },
          { flags: '--category <cat>', description: 'Filter by category' },
        ],
        examples: ['deckent skill list', 'deckent skill list --category testing'],
      },
      {
        name: 'create',
        args: '<name>',
        description: 'Create a new custom skill scaffold.',
        examples: ['deckent skill create my-skill'],
      },
      {
        name: 'install',
        args: '<source>',
        description: 'Install a skill from a local path or git URL.',
        options: [
          { flags: '--force', description: 'Overwrite existing skill' },
        ],
        examples: ['deckent skill install ./path/to/skill', 'deckent skill install https://github.com/org/skill'],
      },
      {
        name: 'search',
        args: '<query>',
        description: 'Search skills in the marketplace registry.',
        options: [
          { flags: '--category <cat>', description: 'Filter by category' },
          { flags: '--json', description: 'Output as JSON' },
          { flags: '--limit <n>', description: 'Max results per page', defaultValue: '20' },
        ],
        examples: ['deckent skill search "react testing"', 'deckent skill search api --category backend'],
      },
      {
        name: 'publish',
        description: 'Publish a skill to the marketplace registry.',
        options: [
          { flags: '--dry-run', description: 'Validate without publishing' },
        ],
        examples: ['deckent skill publish', 'deckent skill publish --dry-run'],
      },
    ],
    examples: [
      'deckent skill list',
      'deckent skill create my-skill',
      'deckent skill install ./my-skill',
    ],
  },
  {
    name: 'agent',
    description: 'Manage the agent pool (.deckent/agents/).',
    category: 'Skills & Agents',
    subcommands: [
      {
        name: 'list',
        description: 'List all agents in the pool.',
        options: [
          { flags: '--json', description: 'Output as JSON' },
        ],
        examples: ['deckent agent list'],
      },
      {
        name: 'create',
        args: '<name>',
        description: 'Create a new custom agent.',
        examples: ['deckent agent create my-agent'],
      },
      {
        name: 'enable',
        args: '<name>',
        description: 'Enable a disabled agent.',
        examples: ['deckent agent enable my-agent'],
      },
      {
        name: 'disable',
        args: '<name>',
        description: 'Disable an active agent.',
        examples: ['deckent agent disable my-agent'],
      },
    ],
    examples: [
      'deckent agent list',
      'deckent agent create my-agent',
      'deckent agent enable my-agent',
    ],
  },

  // ── Plugins ──────────────────────────────────────────────────────
  {
    name: 'plugin',
    description: 'Manage plugins (.deckent/plugins/).',
    category: 'Plugins',
    subcommands: [
      {
        name: 'install',
        args: '<source>',
        description: 'Install a plugin from npm, git URL, or local path.',
        examples: ['deckent plugin install deckent-plugin-slack', 'deckent plugin install ./my-plugin'],
      },
      {
        name: 'list',
        description: 'List all installed plugins.',
        examples: ['deckent plugin list'],
      },
      {
        name: 'info',
        args: '<dir>',
        description: 'Show plugin info from a directory.',
        examples: ['deckent plugin info .deckent/plugins/slack'],
      },
      {
        name: 'create',
        args: '<name>',
        description: 'Create a new plugin scaffold.',
        examples: ['deckent plugin create my-plugin'],
      },
    ],
    examples: [
      'deckent plugin list',
      'deckent plugin install deckent-plugin-slack',
      'deckent plugin create my-plugin',
    ],
  },

  // ── Server & Dashboard ───────────────────────────────────────────
  {
    name: 'serve',
    description: 'Start the HTTP API server with SSE support. Exposes REST endpoints for dashboard and external integrations.',
    category: 'Server & Dashboard',
    options: [
      { flags: '--port <number>', description: 'Port to listen on', defaultValue: '3100' },
    ],
    examples: [
      'deckent serve',
      'deckent serve --port 8080',
    ],
  },
  {
    name: 'web',
    description: 'Start the web dashboard with API server. Serves the built React dashboard alongside the API.',
    category: 'Server & Dashboard',
    options: [
      { flags: '--port <number>', description: 'Port to listen on', defaultValue: '3100' },
      { flags: '--dev', description: 'Development mode — use Vite dev server for frontend' },
    ],
    examples: [
      'deckent web',
      'deckent web --port 8080',
      'deckent web --dev',
    ],
  },
];

// ─── Renderer ────────────────────────────────────────────────────────

function renderOption(opt: CliOption): string {
  const def = opt.defaultValue ? ` _(default: \`${opt.defaultValue}\`)_` : '';
  return `| \`${opt.flags}\` | ${opt.description}${def} |`;
}

function renderOptionsTable(options: CliOption[]): string {
  const lines = [
    '| Flag | Description |',
    '|------|-------------|',
    ...options.map(renderOption),
  ];
  return lines.join('\n');
}

function renderSubcommand(sub: CliSubcommand, parentName: string): string {
  const usage = `deckent ${parentName} ${sub.name}${sub.args ? ` ${sub.args}` : ''}`;
  const lines: string[] = [
    `#### \`${sub.name}${sub.args ? ` ${sub.args}` : ''}\``,
    '',
    sub.description,
    '',
    `**Usage:** \`${usage}\``,
  ];

  if (sub.options && sub.options.length > 0) {
    lines.push('', '**Options:**', '', renderOptionsTable(sub.options));
  }

  if (sub.examples && sub.examples.length > 0) {
    lines.push('', '**Examples:**', '', '```bash', ...sub.examples, '```');
  }

  return lines.join('\n');
}

function renderCommand(cmd: CliCommand): string {
  const usageArgs = cmd.args ? ` ${cmd.args}` : '';
  const usage = `deckent ${cmd.name}${usageArgs}`;

  const lines: string[] = [
    `## \`${cmd.name}${usageArgs}\``,
    '',
    cmd.description,
    '',
    `**Usage:** \`${usage}\``,
  ];

  if (cmd.options && cmd.options.length > 0) {
    lines.push('', '**Options:**', '', renderOptionsTable(cmd.options));
  }

  if (cmd.subcommands && cmd.subcommands.length > 0) {
    lines.push('', '**Subcommands:**');
    for (const sub of cmd.subcommands) {
      lines.push('', renderSubcommand(sub, cmd.name));
    }
  }

  if (cmd.examples && cmd.examples.length > 0) {
    lines.push('', '**Examples:**', '', '```bash', ...cmd.examples, '```');
  }

  return lines.join('\n');
}

export function generateCliDocs(commands: CliCommand[]): string {
  const categories = [...new Set(commands.map((c) => c.category))];

  const sections: string[] = [
    '# CLI Reference',
    '',
    '> Auto-generated from Deckent CLI source. Run `npm run docs:generate-cli` to regenerate.',
    '',
    '## Overview',
    '',
    'Deckent CLI (`deckent`) orchestrates AI agents for your development workflow.',
    '',
    '```bash',
    'deckent <command> [options]',
    '```',
    '',
    '## Command Index',
    '',
  ];

  // Build table of contents
  for (const category of categories) {
    sections.push(`### ${category}`);
    sections.push('');
    const cmds = commands.filter((c) => c.category === category);
    for (const cmd of cmds) {
      const args = cmd.args ? ` ${cmd.args}` : '';
      sections.push(`- [\`deckent ${cmd.name}${args}\`](#${cmd.name.replace(/[^a-z0-9]/g, '-')}) — ${cmd.description.split('.')[0]}`);
    }
    sections.push('');
  }

  sections.push('---', '');

  // Build command sections grouped by category
  for (const category of categories) {
    sections.push(`# ${category}`, '');
    const cmds = commands.filter((c) => c.category === category);
    for (const cmd of cmds) {
      sections.push(renderCommand(cmd), '', '---', '');
    }
  }

  return sections.join('\n');
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────

function main(): void {
  const projectRoot = join(__dirname, '..');
  const outputDir = join(projectRoot, 'docs', 'generated', 'en', 'reference');
  const outputPath = join(outputDir, 'cli.md');

  mkdirSync(outputDir, { recursive: true });

  const content = generateCliDocs(CLI_COMMANDS);
  writeFileSync(outputPath, content, 'utf-8');

  const totalCommands = CLI_COMMANDS.length;
  const totalSubcommands = CLI_COMMANDS.reduce((n, c) => n + (c.subcommands?.length ?? 0), 0);
  console.log(`✓ Generated docs/generated/en/reference/cli.md`);
  console.log(`  ${totalCommands} top-level commands, ${totalSubcommands} subcommands`);
  console.log(`  Output: ${outputPath}`);
}

// Gate side-effect on direct invocation so importing this module (e.g. from
// tests/docs/cli-reference.test.ts) does NOT overwrite the generated cli.md.
// The previous unconditional main() call clobbered AUTOGEN blocks maintained
// by scripts/gen-reference-docs.mjs whenever the test suite imported this file.
const __invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           __filename === process.argv[1];
  } catch {
    return false;
  }
})();

if (__invokedDirectly) {
  main();
}
