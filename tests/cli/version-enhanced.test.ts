import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { buildVersionString, buildVersionJson } from '../../src/cli/version-info.js';

const mockedExecSync = vi.mocked(execSync);

describe('Enhanced --version output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildVersionString returns formatted string with version', () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'tmux -V') return Buffer.from('tmux 3.4');
      if (cmd === 'claude --version') return Buffer.from('1.0.0');
      return Buffer.from('');
    });
    const result = buildVersionString('0.1.0');
    expect(result).toContain('deckent v0.1.0');
    expect(result).toContain('Node');
  });

  it('buildVersionString shows tmux status', () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'tmux -V') return Buffer.from('tmux 3.4');
      if (cmd === 'claude --version') return Buffer.from('1.0.0');
      return Buffer.from('');
    });
    const result = buildVersionString('0.1.0');
    expect(result).toContain('tmux');
  });

  it('buildVersionString handles missing tmux gracefully', () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'tmux -V') throw new Error('not found');
      if (cmd === 'claude --version') return Buffer.from('1.0.0');
      return Buffer.from('');
    });
    const result = buildVersionString('0.1.0');
    expect(result).toContain('tmux n/a');
  });

  it('buildVersionString handles missing claude gracefully', () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'tmux -V') return Buffer.from('tmux 3.4');
      if (cmd === 'claude --version') throw new Error('not found');
      return Buffer.from('');
    });
    const result = buildVersionString('0.1.0');
    expect(result).toContain('claude n/a');
  });

  it('buildVersionJson returns structured JSON object', () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'tmux -V') return Buffer.from('tmux 3.4');
      if (cmd === 'claude --version') return Buffer.from('1.0.0');
      return Buffer.from('');
    });
    const json = buildVersionJson('0.1.0');
    expect(json.version).toBe('0.1.0');
    expect(json.node).toBe(process.version);
    expect(typeof json.os).toBe('string');
    expect(typeof json.tmux).toBe('string');
    expect(typeof json.claude).toBe('string');
  });
});
