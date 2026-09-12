import { afterEach, describe, expect, it, vi } from 'vitest';
import { print, printError } from '../../src/cli/helpers/output.js';
import { reportDetachedStartTerminalState } from '../../src/cli/commands/start.js';

vi.mock('../../src/cli/helpers/output.js', () => ({ print: vi.fn(), printError: vi.fn(), formatSprintSummary: vi.fn(), formatTable: vi.fn() }));
const priorExitCode = process.exitCode;
afterEach(() => { process.exitCode = priorExitCode; vi.clearAllMocks(); });

describe('detached parent observes terminal child before admission handshake', () => {
  it.each([['FAILED', 1], ['CANCELLED', 1], ['BLOCKED', 2], ['UNKNOWN', 1]] as const)(
    'reports %s as a non-success outcome', (state, exitCode) => {
      expect(reportDetachedStartTerminalState(state, 'flow-fixture', 'en')).toBe(true);
      expect(process.exitCode).toBe(exitCode);
      expect(print).not.toHaveBeenCalled();
      expect(printError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(state) }));
    },
  );
  it('reports completion instead of pretending execution just started', () => {
    expect(reportDetachedStartTerminalState('COMPLETED', 'flow-fixture', 'tr')).toBe(true);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('COMPLETED'));
    expect(printError).not.toHaveBeenCalled();
  });
  it('leaves an unsettled child to the admission/liveness checks', () => {
    expect(reportDetachedStartTerminalState(null, 'flow-fixture', 'en')).toBe(false);
    expect(print).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });
});
