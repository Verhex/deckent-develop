import { createInterface } from 'node:readline/promises';
import { print } from './output.js';

function createRl(): import('node:readline/promises').Interface {
  return createInterface({ input: process.stdin, output: process.stdout });
}

// ─── Text Prompt ────────────────────────────────────────────────────

export async function promptText(question: string, defaultValue?: string): Promise<string> {
  const rl = createRl();
  try {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue || '';
  } finally {
    rl.close();
  }
}

// ─── Select Prompt ──────────────────────────────────────────────────

export async function promptSelect<T extends string>(
  question: string,
  options: { label: string; value: T }[],
): Promise<T> {
  const rl = createRl();
  try {
    print(`? ${question}`);
    for (let i = 0; i < options.length; i++) {
      print(`  ${i + 1}) ${options[i]?.label ?? ''}`);
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = await rl.question('> ');
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < options.length) {
        return options[idx]?.value as T; // narrowed: idx range checked above
      }
      print(`Please enter a number between 1 and ${options.length}`);
    }
  } finally {
    rl.close();
  }
}

// ─── Confirm Prompt ─────────────────────────────────────────────────

export async function promptConfirm(question: string, defaultValue = true): Promise<boolean> {
  const rl = createRl();
  try {
    const hint = defaultValue ? 'Y/n' : 'y/N';
    const answer = await rl.question(`${question} (${hint}): `);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === '') return defaultValue;
    return trimmed === 'y' || trimmed === 'yes';
  } finally {
    rl.close();
  }
}
