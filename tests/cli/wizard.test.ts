import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { runWizard } from '../../src/cli/helpers/wizard.js';
import type { WizardStep } from '../../src/cli/helpers/wizard.js';

// ─── Helper: create readable stream from lines ─────────────────────

function createInput(lines: string[]): Readable {
  const data = lines.join('\n') + '\n';
  return Readable.from([data]);
}

function createOutput(): Writable {
  return new Writable({ write(_chunk, _enc, cb) { cb(); } });
}

// ─── Non-interactive mode ───────────────────────────────────────────

describe('runWizard — non-interactive mode', () => {
  it('returns defaults for all steps', async () => {
    const steps: WizardStep[] = [
      { id: 'name', prompt: 'Name?', type: 'input', default: 'deckent' },
      { id: 'confirm', prompt: 'OK?', type: 'confirm', default: true },
    ];
    const result = await runWizard(steps, { nonInteractive: true });
    expect(result['name']).toBe('deckent');
    expect(result['confirm']).toBe(true);
  });

  it('uses first choice for select without default', async () => {
    const steps: WizardStep[] = [
      {
        id: 'lang',
        prompt: 'Language?',
        type: 'select',
        choices: [
          { label: 'English', value: 'en' },
          { label: 'Turkish', value: 'tr' },
        ],
      },
    ];
    const result = await runWizard(steps, { nonInteractive: true });
    expect(result['lang']).toBe('en');
  });

  it('uses specified default for select', async () => {
    const steps: WizardStep[] = [
      {
        id: 'lang',
        prompt: 'Language?',
        type: 'select',
        choices: [
          { label: 'English', value: 'en' },
          { label: 'Turkish', value: 'tr' },
        ],
        default: 'tr',
      },
    ];
    const result = await runWizard(steps, { nonInteractive: true });
    expect(result['lang']).toBe('tr');
  });

  it('confirm defaults to false when no default specified', async () => {
    const steps: WizardStep[] = [
      { id: 'ok', prompt: 'OK?', type: 'confirm' },
    ];
    const result = await runWizard(steps, { nonInteractive: true });
    expect(result['ok']).toBe(false);
  });

  it('input defaults to empty string when no default', async () => {
    const steps: WizardStep[] = [
      { id: 'val', prompt: 'Value?', type: 'input' },
    ];
    const result = await runWizard(steps, { nonInteractive: true });
    expect(result['val']).toBe('');
  });

  it('returns empty result for empty steps', async () => {
    const result = await runWizard([], { nonInteractive: true });
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ─── Interactive mode (with mocked streams) ─────────────────────────

describe('runWizard — interactive mode', () => {
  it('reads input for text step', async () => {
    const steps: WizardStep[] = [
      { id: 'name', prompt: 'Name?', type: 'input', default: 'default' },
    ];
    const result = await runWizard(steps, {
      input: createInput(['myproject']),
      output: createOutput(),
    });
    expect(result['name']).toBe('myproject');
  });

  it('uses default when input is empty', async () => {
    const steps: WizardStep[] = [
      { id: 'name', prompt: 'Name?', type: 'input', default: 'fallback' },
    ];
    const result = await runWizard(steps, {
      input: createInput(['']),
      output: createOutput(),
    });
    expect(result['name']).toBe('fallback');
  });

  it('handles confirm step with y', async () => {
    const steps: WizardStep[] = [
      { id: 'ok', prompt: 'Continue?', type: 'confirm', default: false },
    ];
    const result = await runWizard(steps, {
      input: createInput(['y']),
      output: createOutput(),
    });
    expect(result['ok']).toBe(true);
  });

  it('handles confirm step with empty (uses default)', async () => {
    const steps: WizardStep[] = [
      { id: 'ok', prompt: 'Continue?', type: 'confirm', default: true },
    ];
    const result = await runWizard(steps, {
      input: createInput(['']),
      output: createOutput(),
    });
    expect(result['ok']).toBe(true);
  });

  it('handles select step with numeric choice', async () => {
    const steps: WizardStep[] = [
      {
        id: 'mode',
        prompt: 'Mode?',
        type: 'select',
        choices: [
          { label: 'Fast', value: 'fast' },
          { label: 'Full', value: 'full' },
        ],
      },
    ];
    const result = await runWizard(steps, {
      input: createInput(['2']),
      output: createOutput(),
    });
    expect(result['mode']).toBe('full');
  });

  it('handles multiple steps sequentially', async () => {
    const steps: WizardStep[] = [
      { id: 'name', prompt: 'Name?', type: 'input', default: '' },
      { id: 'ok', prompt: 'OK?', type: 'confirm', default: false },
    ];
    // Use a PassThrough to keep stream open between reads
    const { PassThrough } = await import('node:stream');
    const input = new PassThrough();
    const resultPromise = runWizard(steps, {
      input,
      output: createOutput(),
    });
    // Feed lines with slight delay
    input.write('myapp\n');
    await new Promise(r => setTimeout(r, 10));
    input.write('yes\n');
    input.end();
    const result = await resultPromise;
    expect(result['name']).toBe('myapp');
    expect(result['ok']).toBe(true);
  });
});
