import { describe, it, expect } from 'vitest';
import { redactSensitive } from '../../src/orchestra/sensitive-redactor.js';

describe('redactSensitive', () => {
  it('redacts API key from error message', () => {
    const err = new Error('failed with api_key=sk-abc123xyz');
    const out = redactSensitive(err);
    expect(out.message).toContain('[REDACTED]');
    expect(out.message).not.toContain('sk-abc123xyz');
  });

  it('redacts Bearer token from stack', () => {
    const err = new Error('boom');
    err.stack = 'at f (x.ts:1)\nAuthorization: Bearer eyJabc.def.ghi';
    const out = redactSensitive(err);
    expect(out.stack).not.toContain('eyJabc.def.ghi');
    expect(out.stack).toContain('[REDACTED]');
  });

  it('redacts long file content (>100 chars) keeping path', () => {
    const longContent = 'x'.repeat(500);
    const err = new Error(`reading /etc/secret.conf: ${longContent}`);
    const out = redactSensitive(err);
    expect(out.message).toContain('/etc/secret.conf');
    expect(out.message).not.toContain('x'.repeat(200));
    expect(out.message).toMatch(/\[REDACTED:\d+ chars\]/);
  });

  it('redacts env var values', () => {
    const err = new Error('GITHUB_TOKEN=ghp_secrettoken process env leak');
    const out = redactSensitive(err);
    expect(out.message).not.toContain('ghp_secrettoken');
  });

  it('redacts password= patterns', () => {
    const err = new Error('connect failed: password=hunter2');
    expect(redactSensitive(err).message).not.toContain('hunter2');
  });

  it('preserves non-sensitive content unchanged', () => {
    const err = new Error('Cannot find module ./sprint-checkpoint.js');
    expect(redactSensitive(err).message).toBe('Cannot find module ./sprint-checkpoint.js');
  });
});
