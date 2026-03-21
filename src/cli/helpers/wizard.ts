// ─── TUI Wizard Framework ───────────────────────────────────────────

import { createInterface } from 'node:readline';

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
