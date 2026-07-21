import { describe, expect, it, vi } from 'vitest';
import {
  terminateDockerContainerForBudget,
  type DockerSyncCommand,
  type DockerSyncCommandResult,
} from '../../src/orchestra/spawn-backend-docker.js';

function scripted(results: DockerSyncCommandResult[]) {
  const run = vi.fn((_command: string, _args: string[]) => (
    results.shift() ?? { status: 1, stderr: 'unexpected command' }
  )) as unknown as DockerSyncCommand;
  return run;
}

describe('Docker budget termination state machine', () => {
  it('accepts docker stop only after inspect proves the container is stopped', () => {
    const run = scripted([
      { status: 0 },
      { status: 0, stdout: 'false|143\n' },
    ]);
    expect(terminateDockerContainerForBudget('deckent-w-t1', 15, run)).toEqual({
      containerName: 'deckent-w-t1',
      escalation: 'docker-stop',
      terminationConfirmed: true,
    });
    expect(run.mock.calls.map(call => call[1]?.[0])).toEqual(['stop', 'inspect']);
  });

  it('escalates through TERM and verifies the post-wait state', () => {
    const run = scripted([
      { status: 1, stderr: 'stop failed' },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: 0, stdout: '143' },
      { status: 0, stdout: 'false|143' },
    ]);
    expect(terminateDockerContainerForBudget('deckent-w-t2', 3, run).escalation).toBe('sigterm');
    expect(run.mock.calls.map(call => call[1]?.join(' '))).toContain('kill --signal=SIGTERM deckent-w-t2');
  });

  it('uses SIGKILL when TERM cannot produce a verified stop', () => {
    const run = scripted([
      { status: 0 },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: null, error: new Error('wait timeout') },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: 0, stdout: '137' },
      { status: 0, stdout: 'false|137' },
    ]);
    expect(terminateDockerContainerForBudget('deckent-w-t3', 1, run).escalation).toBe('sigkill');
    expect(run.mock.calls.map(call => call[1]?.join(' '))).toContain('kill --signal=SIGKILL deckent-w-t3');
  });

  it('fails loudly after SIGKILL when Docker cannot prove Running=false', () => {
    const run = scripted([
      { status: 0 },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: null, error: new Error('wait timeout') },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: null, error: new Error('wait timeout') },
      { status: 0, stdout: 'true|0' },
    ]);
    expect(() => terminateDockerContainerForBudget('deckent-w-t4', 1, run))
      .toThrow('could not verify');
    expect(run.mock.calls.map(call => call[1]?.join(' '))).toContain('kill --signal=SIGKILL deckent-w-t4');
  });
});
