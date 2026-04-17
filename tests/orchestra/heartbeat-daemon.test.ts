import { describe, it, expect } from 'vitest';
import { validateCommand } from '../../src/orchestra/heartbeat-daemon.js';
import { ValidationError } from '../../src/core/validators.js';

describe('heartbeat-daemon validateCommand', () => {
  // ─── Allowed commands ─────────────────────────────────────────────

  it('allows whitelisted commands', () => {
    expect(validateCommand('ps aux')).toBe('ps aux');
    expect(validateCommand('kill -9 1234')).toBe('kill -9 1234');
    expect(validateCommand('uptime')).toBe('uptime');
    expect(validateCommand('date')).toBe('date');
    expect(validateCommand('tsc --noEmit')).toBe('tsc --noEmit');
    expect(validateCommand('npx vitest run')).toBe('npx vitest run');
    expect(validateCommand('node --version')).toBe('node --version');
    expect(validateCommand('npm test')).toBe('npm test');
  });

  // ─── Shell metacharacter injection ────────────────────────────────

  it('rejects semicolon injection', () => {
    expect(() => validateCommand('ps ; rm -rf /')).toThrow(ValidationError);
    expect(() => validateCommand('ps ; rm -rf /')).toThrow('Shell metacharacter detected');
  });

  it('rejects ampersand injection', () => {
    expect(() => validateCommand('ps & whoami')).toThrow(ValidationError);
    expect(() => validateCommand('ps & whoami')).toThrow('Shell metacharacter detected');
  });

  it('rejects pipe injection', () => {
    expect(() => validateCommand('ps | cat /etc/passwd')).toThrow(ValidationError);
  });

  it('rejects backtick injection', () => {
    expect(() => validateCommand('ps `whoami`')).toThrow(ValidationError);
  });

  it('rejects dollar sign injection', () => {
    expect(() => validateCommand('ps $(whoami)')).toThrow(ValidationError);
  });

  it('rejects parenthesis injection', () => {
    expect(() => validateCommand('ps (subshell)')).toThrow(ValidationError);
  });

  // ─── Non-whitelisted commands ─────────────────────────────────────

  it('rejects commands not in whitelist', () => {
    expect(() => validateCommand('rm -rf /')).toThrow(ValidationError);
    expect(() => validateCommand('rm -rf /')).toThrow('Command not in whitelist');
  });

  it('rejects curl (not whitelisted)', () => {
    expect(() => validateCommand('curl http://evil.com')).toThrow(ValidationError);
  });

  it('rejects wget (not whitelisted)', () => {
    expect(() => validateCommand('wget http://evil.com')).toThrow(ValidationError);
  });

  // ─── Empty and null byte ──────────────────────────────────────────

  it('rejects empty command', () => {
    expect(() => validateCommand('')).toThrow(ValidationError);
    expect(() => validateCommand('')).toThrow('cannot be empty');
  });

  it('rejects whitespace-only command', () => {
    expect(() => validateCommand('   ')).toThrow(ValidationError);
  });

  it('rejects null byte injection', () => {
    expect(() => validateCommand('ps\0 --help')).toThrow(ValidationError);
    expect(() => validateCommand('ps\0 --help')).toThrow('null bytes');
  });

  // ─── Path prefix stripping ────────────────────────────────────────

  it('allows commands with path prefix if base name is whitelisted', () => {
    expect(validateCommand('/usr/bin/ps aux')).toBe('/usr/bin/ps aux');
    expect(validateCommand('/bin/date')).toBe('/bin/date');
  });

  it('rejects commands with path prefix if base name is not whitelisted', () => {
    expect(() => validateCommand('/usr/bin/rm -rf /')).toThrow(ValidationError);
  });
});
