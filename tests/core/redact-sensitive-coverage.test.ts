import { describe, it, expect } from 'vitest';
import { redactSensitive } from '../../src/core/redact-sensitive.js';

// REDACT-COVERAGE (ADR-G-025): extends the allowlist beyond sk-/key-/Bearer/URL/ENV_VAR=
// with AWS access keys, GitHub tokens, JWTs, and generic password/token/secret= assignments.

describe('redactSensitive — REDACT-COVERAGE extensions', () => {
  // ─── AWS Access Keys ──────────────────────────────────────────────

  it('redacts an AWS access key ID', () => {
    const input = 'AWS credentials: AKIAIOSFODNN7EXAMPLE in config';
    const result = redactSensitive(input);
    expect(result).toBe('AWS credentials: [REDACTED] in config');
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('does not redact a string that merely starts with AKIA but is the wrong length', () => {
    const input = 'AKIASHORT is not a real key';
    const result = redactSensitive(input);
    expect(result).toBe(input);
  });

  // ─── GitHub Tokens ────────────────────────────────────────────────

  it('redacts a classic ghp_ GitHub token', () => {
    const secret = 'ghp_16C7e42F292c6912E7710c838347Ae178B4a';
    const result = redactSensitive(`Authorization: token ${secret}`);
    expect(result).not.toContain(secret);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts a classic gho_ GitHub OAuth token', () => {
    const secret = 'gho_16C7e42F292c6912E7710c838347Ae178B4a';
    const result = redactSensitive(`env GH_TOKEN=${secret}`);
    expect(result).not.toContain(secret);
  });

  it('redacts a fine-grained github_pat_ token', () => {
    const secret =
      'github_pat_11AAAAAAA0aaaaaaaaaaaa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const result = redactSensitive(`using ${secret} for CI`);
    expect(result).not.toContain(secret);
    expect(result).toContain('[REDACTED]');
  });

  // ─── JWTs ─────────────────────────────────────────────────────────

  it('redacts a real-shaped standalone JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const result = redactSensitive(`session token: ${jwt}`);
    expect(result).toBe('session token: [REDACTED]');
    expect(result).not.toContain(jwt);
  });

  // ─── Generic password/token/secret= assignments ──────────────────

  it('redacts a generic password= assignment', () => {
    const result = redactSensitive('config: password=hunter2 loaded');
    expect(result).toBe('config: password=[REDACTED] loaded');
    expect(result).not.toContain('hunter2');
  });

  it('redacts a generic passwd= assignment', () => {
    const result = redactSensitive('passwd=s3cr3tValue');
    expect(result).toBe('passwd=[REDACTED]');
  });

  it('redacts a generic token= assignment (lowercase, not an ALL-CAPS env var)', () => {
    const result = redactSensitive('token=abc123def456');
    expect(result).toBe('token=[REDACTED]');
  });

  it('redacts a generic secret= assignment', () => {
    const result = redactSensitive('secret=topSecretValue123');
    expect(result).toBe('secret=[REDACTED]');
  });

  it('redacts generic assignments case-insensitively', () => {
    const result = redactSensitive('Password=Value123 Token=xyz789');
    expect(result).not.toContain('Value123');
    expect(result).not.toContain('xyz789');
  });

  // ─── Ordinary Prose Pass-Through (no over-redaction) ─────────────

  it('leaves prose containing "password" without "=" unchanged', () => {
    const input = 'password field validation must reject weak passwords';
    expect(redactSensitive(input)).toBe(input);
  });

  it('leaves prose containing "token" without "=" unchanged', () => {
    const input = 'the token bucket algorithm rate-limits requests';
    expect(redactSensitive(input)).toBe(input);
  });

  it('leaves prose containing "secret" without "=" unchanged', () => {
    const input = 'this recipe has a secret ingredient';
    expect(redactSensitive(input)).toBe(input);
  });

  it('leaves ordinary AWS/GitHub-adjacent prose unchanged', () => {
    const input = 'deploy via GitHub Actions to an AWS account';
    expect(redactSensitive(input)).toBe(input);
  });

  it('redacts multiple new-family secrets in one string while preserving surrounding text', () => {
    const input = [
      'AKIAIOSFODNN7EXAMPLE',
      'ghp_16C7e42F292c6912E7710c838347Ae178B4a',
      'password=hunter2',
    ].join(' | ');
    const result = redactSensitive(input);
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result).not.toContain('ghp_16C7e42F292c6912E7710c838347Ae178B4a');
    expect(result).not.toContain('hunter2');
    expect(result).toContain('password=[REDACTED]');
  });

  // ─── Regression spot-check on existing families ──────────────────

  it('still redacts pre-existing sk- keys and ENV_VAR= assignments unaffected by new patterns', () => {
    const input = 'OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno';
    const result = redactSensitive(input);
    expect(result).toBe('OPENAI_API_KEY=[REDACTED]');
  });
});
