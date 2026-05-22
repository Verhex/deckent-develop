// ─── TUI Wizard Framework ───────────────────────────────────────────

import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import type { DetectedProvider } from '../../core/provider.js';
import type { ProviderName } from '../../core/task-types.js';

export interface WizardStep {
  id: string;
  prompt: string;
  type: 'select' | 'input' | 'confirm';
  choices?: { label: string; value: string }[];
  default?: string | boolean;
  validate?: (value: string) => string | true;
}

export interface WizardResult {
  [stepId: string]: string | boolean;
}

export interface WizardOpts {
  nonInteractive?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Run a multi-step wizard.
 * In non-interactive mode, uses default values for all steps.
 */
export async function runWizard(steps: WizardStep[], opts?: WizardOpts): Promise<WizardResult> {
  const result: WizardResult = {};

  if (opts?.nonInteractive) {
    for (const step of steps) {
      result[step.id] = resolveDefault(step);
    }
    return result;
  }

  const rl = createInterface({
    input: opts?.input ?? process.stdin,
    output: opts?.output ?? process.stdout,
  });

  try {
    for (const step of steps) {
      result[step.id] = await runStep(rl, step);
    }
  } finally {
    rl.close();
  }

  return result;
}

function resolveDefault(step: WizardStep): string | boolean {
  if (step.type === 'confirm') {
    return step.default ?? false;
  }
  if (step.type === 'select' && step.choices && step.choices.length > 0) {
    return (step.default as string) ?? step.choices[0]!.value;
  }
  return (step.default as string) ?? '';
}

function askQuestion(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function runStep(
  rl: ReturnType<typeof createInterface>,
  step: WizardStep,
): Promise<string | boolean> {
  if (step.type === 'confirm') {
    return runConfirmStep(rl, step);
  }
  if (step.type === 'select') {
    return runSelectStep(rl, step);
  }
  return runInputStep(rl, step);
}

async function runConfirmStep(
  rl: ReturnType<typeof createInterface>,
  step: WizardStep,
): Promise<boolean> {
  const defaultStr = step.default === true ? 'Y/n' : 'y/N';
  const answer = await askQuestion(rl, `${step.prompt} (${defaultStr}): `);
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === '') return (step.default as boolean) ?? false;
  return trimmed === 'y' || trimmed === 'yes';
}

async function runSelectStep(
  rl: ReturnType<typeof createInterface>,
  step: WizardStep,
): Promise<string> {
  const choices = step.choices ?? [];
  const lines = choices.map((c, i) => `  ${i + 1}) ${c.label}`);
  const prompt = `${step.prompt}\n${lines.join('\n')}\nChoice [1]: `;
  const answer = await askQuestion(rl, prompt);
  const trimmed = answer.trim();
  if (trimmed === '') {
    return (step.default as string) ?? (choices[0]?.value ?? '');
  }
  const idx = parseInt(trimmed, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= choices.length) {
    return choices[idx - 1]!.value;
  }
  // Try matching by value
  const match = choices.find(c => c.value === trimmed || c.label === trimmed);
  return match?.value ?? (step.default as string) ?? '';
}

async function runInputStep(
  rl: ReturnType<typeof createInterface>,
  step: WizardStep,
): Promise<string> {
  const defaultStr = step.default !== undefined ? ` [${step.default}]` : '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const answer = await askQuestion(rl, `${step.prompt}${defaultStr}: `);
    const trimmed = answer.trim();
    const value = trimmed === '' ? ((step.default as string) ?? '') : trimmed;

    if (step.validate) {
      const result = step.validate(value);
      if (result !== true) {
        // Write validation error to output
        const output = (rl as unknown as { output: NodeJS.WritableStream }).output;
        if (output && typeof output.write === 'function') {
          output.write(`  ${result}\n`);
        }
        continue;
      }
    }

    return value;
  }
}

// ─── IDE Environment Detection ──────────────────────────────────────

export type IDEEnvironment = 'claude-code' | 'cursor' | 'terminal';

/**
 * Detect the current IDE environment.
 * - Claude Code: parent process is claude or CLAUDE_CODE env is set
 * - Cursor: CURSOR_SESSION env or .cursor/ directory exists
 * - terminal: fallback
 */
export function detectIDEEnvironment(projectRoot?: string): IDEEnvironment {
  // Claude Code detection: env var or parent process name
  if (process.env['CLAUDE_CODE'] || process.env['CLAUDE_SESSION_ID']) {
    return 'claude-code';
  }

  // Check parent process (ppid) for 'claude' in cmdline — skip on Windows (no POSIX ps)
  if (process.platform !== 'win32') {
    try {
      const ppid = process.ppid;
      if (ppid) {
        const cmdline = execSync(`ps -p ${ppid} -o comm=`, { encoding: 'utf-8', timeout: 2000 }).trim();
        if (cmdline.includes('claude')) {
          return 'claude-code';
        }
      }
    } catch {
      // ps not available or failed — skip
    }
  }

  // Cursor detection: env var or .cursor/ directory
  if (process.env['CURSOR_SESSION'] || process.env['CURSOR_TRACE_ID']) {
    return 'cursor';
  }
  if (projectRoot && existsSync(join(projectRoot, '.cursor'))) {
    return 'cursor';
  }

  return 'terminal';
}

/**
 * Get MCP registration guidance tailored to the detected IDE environment.
 */
export function getMCPGuidance(ide: IDEEnvironment): string[] {
  switch (ide) {
    case 'claude-code':
      return [
        'Claude Code detected — MCP is auto-configured via .claude/ settings.',
        'No additional setup needed for deckent MCP tools.',
      ];
    case 'cursor':
      return [
        'Cursor detected — add deckent MCP to ~/.cursor/mcp.json:',
        '  { "mcpServers": { "deckent": { "command": "deckent-mcp", "args": [] } } }',
        'Or run: deckent init --cursor',
      ];
    case 'terminal':
      return [
        'Terminal mode — MCP server binary: deckent-mcp',
        'For IDE integration, run deckent init inside your IDE.',
      ];
  }
}

// ─── Provider Selection Wizard ──────────────────────────────────────

export interface ProviderConfig {
  brain_provider: ProviderName;
  worker_provider: ProviderName;
  fallback_provider?: ProviderName;
  selectedProviders: ProviderName[];
}

/**
 * Build provider wizard steps based on detected providers.
 * - Single available provider: auto-configure without questions
 * - Multiple: prompt user for brain/worker selection
 */
export function buildProviderWizardSteps(
  detected: DetectedProvider[],
): { autoConfig: ProviderConfig | null; steps: WizardStep[] } {
  const available = detected.filter(p => p.available);

  // No providers available — error state
  if (available.length === 0) {
    return {
      autoConfig: {
        brain_provider: 'claude',
        worker_provider: 'claude',
        selectedProviders: [],
      },
      steps: [],
    };
  }

  // Single provider: auto-configure
  if (available.length === 1) {
    const provider = available[0]!.name;
    return {
      autoConfig: {
        brain_provider: provider,
        worker_provider: provider,
        selectedProviders: [provider],
      },
      steps: [],
    };
  }

  // Multiple providers: build selection steps
  const providerChoices = available.map(p => ({
    label: `${p.name} (${p.authMethod})`,
    value: p.name,
  }));

  const steps: WizardStep[] = [
    {
      id: 'brain_provider',
      prompt: 'Select brain (planner) provider:',
      type: 'select',
      choices: providerChoices,
      default: available[0]!.name,
    },
    {
      id: 'worker_provider',
      prompt: 'Select worker (execution) provider:',
      type: 'select',
      choices: providerChoices,
      default: available[0]!.name,
    },
  ];

  // If 3+ providers, offer fallback selection
  if (available.length >= 3) {
    steps.push({
      id: 'fallback_provider',
      prompt: 'Select fallback provider (used when primary is unavailable):',
      type: 'select',
      choices: [
        { label: 'None', value: 'none' },
        ...providerChoices,
      ],
      default: 'none',
    });
  }

  return { autoConfig: null, steps };
}

/**
 * Resolve provider wizard results into ProviderConfig.
 */
export function resolveProviderWizardResult(
  result: WizardResult,
  _detected: DetectedProvider[],
): ProviderConfig {
  const brain = (result['brain_provider'] as string) as ProviderName;
  const worker = (result['worker_provider'] as string) as ProviderName;
  const fallbackRaw = result['fallback_provider'] as string | undefined;
  const fallback = fallbackRaw && fallbackRaw !== 'none' ? (fallbackRaw as ProviderName) : undefined;

  const selectedSet = new Set<ProviderName>([brain, worker]);
  if (fallback) selectedSet.add(fallback);

  return {
    brain_provider: brain,
    worker_provider: worker,
    fallback_provider: fallback,
    selectedProviders: [...selectedSet],
  };
}

/**
 * Check if a provider needs an API key and it's missing.
 * Returns the env var name that's needed, or null if auth is OK.
 */
export function getProviderMissingAuth(provider: DetectedProvider): string | null {
  if (provider.available) return null;
  if (provider.authMethod === 'none') {
    switch (provider.name) {
      case 'codex': return 'OPENAI_API_KEY';
      case 'gemini': return 'GOOGLE_API_KEY';
      case 'claude': return null; // session-based, can't prompt for key
    }
  }
  return null;
}

/**
 * Format provider auth guidance for providers that need API keys.
 */
export function formatProviderAuthGuidance(detected: DetectedProvider[]): string[] {
  const lines: string[] = [];
  for (const p of detected) {
    if (p.available) continue;
    const envVar = getProviderMissingAuth(p);
    if (envVar) {
      lines.push(`  ⚠ ${p.name}: Set ${envVar} environment variable to enable`);
    } else if (p.name === 'claude' && !p.available) {
      lines.push(`  ⚠ claude: Install CLI (npm i -g @anthropic-ai/claude-code) and log in`);
    }
  }
  return lines;
}
