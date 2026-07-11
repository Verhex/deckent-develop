import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';
import { print } from './output.js';

function createRl(): Interface {
  return createInterface({ input: process.stdin, output: process.stdout });
}

/**
 * Thrown when stdin ends (EOF) before a prompt received an answer. Node's
 * readline/promises `question()` never settles on its own when the input
 * stream closes mid-question (see rl 'close' vs the question Promise) — left
 * unhandled, the awaiting caller hangs until the event loop drains with no
 * other work, and the process exits 0 silently without ever resuming. Callers
 * (e.g. `deckent init`) catch this and report an honest FAILED outcome instead.
 */
export class PromptEOFError extends Error {
  constructor() {
    super('stdin closed before an answer was provided (EOF)');
    this.name = 'PromptEOFError';
  }
}

/**
 * Ask `rl` a question, rejecting with {@link PromptEOFError} if stdin ends
 * (EOF) before an answer arrives. Listens on `process.stdin` itself — the
 * real, always-EventEmitter-capable stream `createRl()` hands to
 * `createInterface` — rather than on `rl`, so this works whether `rl` is the
 * real readline/promises Interface or (as in unit tests) a bare
 * `{ question, close }` stub with no event-emitter surface of its own.
 */
function askOrThrowOnEOF(rl: Interface, query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      reject(new PromptEOFError());
    };
    process.stdin.once('end', onEnd);
    rl.question(query).then(
      (answer) => {
        if (settled) return;
        settled = true;
        process.stdin.removeListener('end', onEnd);
        resolve(answer);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        process.stdin.removeListener('end', onEnd);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

// ─── Text Prompt ────────────────────────────────────────────────────

export async function promptText(question: string, defaultValue?: string): Promise<string> {
  const rl = createRl();
  try {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    const answer = await askOrThrowOnEOF(rl, `${question}${suffix}: `);
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
      const answer = await askOrThrowOnEOF(rl, '> ');
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
    const answer = await askOrThrowOnEOF(rl, `${question} (${hint}): `);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === '') return defaultValue;
    return trimmed === 'y' || trimmed === 'yes';
  } finally {
    rl.close();
  }
}
