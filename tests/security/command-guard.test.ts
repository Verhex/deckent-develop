import { describe, it, expect } from 'vitest';
import {
  checkCommandGuard,
  matchCommandPatterns,
  formatCommandGuardDetail,
  COMMAND_GUARD_LOCALHOST_HOSTS,
} from '../../src/api/terminal/command-guard.js';

describe('command-guard (I3 default-deny remote)', () => {
  it('(a) localhost bypass: no block even on rm -rf /', () => {
    const matches = checkCommandGuard('rm -rf /', { kind: 'shell', host: '127.0.0.1' });
    expect(matches).toEqual([]);
  });

  it('(b) localhost ::1 bypass', () => {
    const matches = checkCommandGuard('mkfs.ext4 /dev/sda', { kind: 'shell', host: '::1' });
    expect(matches).toEqual([]);
  });

  it('(c) non-shell bypass: ai kind never blocked', () => {
    const matches = checkCommandGuard('rm -rf /', { kind: 'ai', host: '0.0.0.0' });
    expect(matches).toEqual([]);
  });

  it('(d) remote rm_rf_root: matched', () => {
    const matches = checkCommandGuard('rm -rf /', { kind: 'shell', host: '0.0.0.0' });
    expect(matches.map((m) => m.patternId)).toContain('rm_rf_root');
  });

  it('(e) remote mkfs: matched', () => {
    const matches = checkCommandGuard('mkfs.xfs /dev/sda1', { kind: 'shell', host: 'remote.example' });
    expect(matches.map((m) => m.patternId)).toContain('mkfs');
  });

  it('(f) remote dd_of_dev: matched', () => {
    const matches = checkCommandGuard('dd if=/dev/zero of=/dev/sda bs=1M', { kind: 'shell', host: 'remote' });
    expect(matches.map((m) => m.patternId)).toContain('dd_of_dev');
  });

  it('(g) remote fork_bomb: matched', () => {
    const matches = checkCommandGuard(':(){ :|: & };:', { kind: 'shell', host: 'remote' });
    expect(matches.map((m) => m.patternId)).toContain('fork_bomb');
  });

  it('(h) remote authorized_keys_write: matched', () => {
    const matches = checkCommandGuard('echo pubkey >> ~/.ssh/authorized_keys', { kind: 'shell', host: 'remote' });
    expect(matches.map((m) => m.patternId)).toContain('authorized_keys_write');
  });

  it('(i) remote benign command: no match', () => {
    const matches = checkCommandGuard('ls -la /tmp', { kind: 'shell', host: 'remote' });
    expect(matches).toEqual([]);
  });

  it('(j) default-deny on host=undefined: matches enforced', () => {
    const matches = checkCommandGuard('rm -rf /', { kind: 'shell' });
    expect(matches.length).toBeGreaterThan(0);
  });

  it('(k) formatCommandGuardDetail: matches I2 regex', () => {
    const detail = formatCommandGuardDetail({ patternId: 'rm_rf_root', offset: 0 });
    expect(detail).toMatch(/^[a-z_]+:[0-9]+(:[a-z_]+)?$/);
    expect(detail).toBe('rm_rf_root:0:cmd');
  });

  it('(l) LOCALHOST_HOSTS export includes 127.0.0.1 + ::1 + localhost', () => {
    expect(COMMAND_GUARD_LOCALHOST_HOSTS.has('127.0.0.1')).toBe(true);
    expect(COMMAND_GUARD_LOCALHOST_HOSTS.has('::1')).toBe(true);
    expect(COMMAND_GUARD_LOCALHOST_HOSTS.has('localhost')).toBe(true);
  });
});
