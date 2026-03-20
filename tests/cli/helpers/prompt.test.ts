import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promptText, promptSelect, promptConfirm } from '../../../src/cli/helpers/prompt.js';

// ─── Mock readline ────────────────────────────────────────────────────

const mockQuestion = vi.fn<[string], Promise<string>>();
const mockClose = vi.fn();

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

// We also need to mock output.ts to avoid stdout writes in select tests
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── promptText ───────────────────────────────────────────────────────

describe('promptText', () => {
  it('returns trimmed answer from readline', async () => {
    mockQuestion.mockResolvedValueOnce('  my answer  ');
    const result = await promptText('Enter name');
    expect(result).toBe('my answer');
  });

  it('returns defaultValue when answer is empty', async () => {
    mockQuestion.mockResolvedValueOnce('');
    const result = await promptText('Enter name', 'default-val');
    expect(result).toBe('default-val');
  });

  it('returns empty string when no answer and no default', async () => {
    mockQuestion.mockResolvedValueOnce('');
    const result = await promptText('Enter name');
    expect(result).toBe('');
  });

  it('appends defaultValue hint to question', async () => {
    mockQuestion.mockResolvedValueOnce('user-input');
    await promptText('Enter name', 'fallback');
    expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining('fallback'));
  });

  it('closes readline interface after resolving', async () => {
    mockQuestion.mockResolvedValueOnce('hello');
    await promptText('Q');
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes readline interface even if answer is empty', async () => {
    mockQuestion.mockResolvedValueOnce('');
    await promptText('Q', 'def');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ─── promptSelect ─────────────────────────────────────────────────────

describe('promptSelect', () => {
  it('returns selected option value', async () => {
    mockQuestion.mockResolvedValueOnce('1');
    const result = await promptSelect('Pick one', [
      { label: 'Option A', value: 'a' },
      { label: 'Option B', value: 'b' },
    ]);
    expect(result).toBe('a');
  });

  it('returns second option when 2 selected', async () => {
    mockQuestion.mockResolvedValueOnce('2');
    const result = await promptSelect('Pick', [
      { label: 'X', value: 'x' },
      { label: 'Y', value: 'y' },
    ]);
    expect(result).toBe('y');
  });

  it('retries on invalid input then accepts valid', async () => {
    mockQuestion
      .mockResolvedValueOnce('5')   // invalid
      .mockResolvedValueOnce('abc') // invalid
      .mockResolvedValueOnce('2');  // valid

    const result = await promptSelect('Pick', [
      { label: 'Alpha', value: 'alpha' },
      { label: 'Beta', value: 'beta' },
    ]);
    expect(result).toBe('beta');
    expect(mockQuestion).toHaveBeenCalledTimes(3);
  });

  it('closes readline interface after selection', async () => {
    mockQuestion.mockResolvedValueOnce('1');
    await promptSelect('Pick', [{ label: 'A', value: 'a' }]);
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ─── promptConfirm ────────────────────────────────────────────────────

describe('promptConfirm', () => {
  it('returns true for "y"', async () => {
    mockQuestion.mockResolvedValueOnce('y');
    const result = await promptConfirm('Are you sure?');
    expect(result).toBe(true);
  });

  it('returns true for "yes"', async () => {
    mockQuestion.mockResolvedValueOnce('yes');
    const result = await promptConfirm('Proceed?');
    expect(result).toBe(true);
  });

  it('returns false for "n"', async () => {
    mockQuestion.mockResolvedValueOnce('n');
    const result = await promptConfirm('Sure?');
    expect(result).toBe(false);
  });

  it('returns false for "no"', async () => {
    mockQuestion.mockResolvedValueOnce('no');
    const result = await promptConfirm('Sure?');
    expect(result).toBe(false);
  });

  it('returns defaultValue (true) for empty answer', async () => {
    mockQuestion.mockResolvedValueOnce('');
    const result = await promptConfirm('Sure?', true);
    expect(result).toBe(true);
  });

  it('returns defaultValue (false) for empty answer', async () => {
    mockQuestion.mockResolvedValueOnce('');
    const result = await promptConfirm('Sure?', false);
    expect(result).toBe(false);
  });

  it('default is true when not specified', async () => {
    mockQuestion.mockResolvedValueOnce('');
    const result = await promptConfirm('Sure?');
    expect(result).toBe(true);
  });

  it('is case-insensitive: "Y" → true', async () => {
    mockQuestion.mockResolvedValueOnce('Y');
    const result = await promptConfirm('Sure?');
    expect(result).toBe(true);
  });

  it('returns false for unrecognized input', async () => {
    mockQuestion.mockResolvedValueOnce('maybe');
    const result = await promptConfirm('Sure?');
    expect(result).toBe(false);
  });

  it('closes readline interface after answering', async () => {
    mockQuestion.mockResolvedValueOnce('y');
    await promptConfirm('Q?');
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('includes Y/n hint when defaultValue is true', async () => {
    mockQuestion.mockResolvedValueOnce('y');
    await promptConfirm('Continue?', true);
    expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining('Y/n'));
  });

  it('includes y/N hint when defaultValue is false', async () => {
    mockQuestion.mockResolvedValueOnce('n');
    await promptConfirm('Continue?', false);
    expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining('y/N'));
  });
});
