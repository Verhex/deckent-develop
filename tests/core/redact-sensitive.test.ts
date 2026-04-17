import { describe, it, expect } from 'vitest';
import { redactSensitive } from '../../src/core/redact-sensitive.js';

describe('redactSensitive (core module)', () => {
  // ─── API Key Patterns ─────────────────────────────────────────────

  it('redacts OpenAI-style sk- API keys', () => {
    const input = 'Using key sk-proj-abc123def456ghi789jkl012mno';
    const result = redactSensitive(input);
    expect(result).toBe('Using key [REDACTED]');
    expect(result).not.toContain('sk-proj');
  });

  it('redacts Anthropic-style sk-ant- API keys', () => {
    const input = 'ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    const result = redactSensitive(input);
    expect(result).not.toContain('sk-ant-api03');
  });

  it('redacts key- prefixed API keys', () => {
    const input = 'Authorization: key-abcdef1234567890abcdef1234567890';
    const result = redactSensitive(input);
    expect(result).toBe('Authorization: [REDACTED]');
  });

  it('does not redact short sk- strings that are not API keys', () => {
    const input = 'sk-short is not a key';
    const result = redactSensitive(input);
    expect(result).toBe('sk-short is not a key');
  });

  // ─── Bearer Tokens ────────────────────────────────────────────────

  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def';
    const result = redactSensitive(input);
    expect(result).toBe('Authorization: Bearer [REDACTED]');
  });

  it('redacts bearer tokens case-insensitively', () => {
    const input = 'header: bearer my-secret-token-value';
    const result = redactSensitive(input);
    expect(result).toBe('header: bearer [REDACTED]');
  });

  // ─── URL Passwords ────────────────────────────────────────────────

  it('redacts passwords in URLs', () => {
    const input = 'connecting to https://admin:supersecret123@db.example.com/mydb';
    const result = redactSensitive(input);
    expect(result).toBe('connecting to https://admin:[REDACTED]@db.example.com/mydb');
    expect(result).not.toContain('supersecret123');
  });

  it('redacts passwords in URLs with special characters', () => {
    const input = 'mongodb://user:p%40ssw0rd!@mongo.host:27017';
    const result = redactSensitive(input);
    expect(result).toContain('://user:[REDACTED]@');
    expect(result).not.toContain('p%40ssw0rd');
  });

  // ─── Environment Variable Assignments ─────────────────────────────

  it('redacts OPENAI_API_KEY=value', () => {
    const input = 'export OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrs';
    const result = redactSensitive(input);
    expect(result).toContain('OPENAI_API_KEY=[REDACTED]');
  });

  it('redacts ANTHROPIC_API_KEY=value', () => {
    const input = 'ANTHROPIC_API_KEY=my-secret-anthropic-key-value';
    const result = redactSensitive(input);
    expect(result).toContain('ANTHROPIC_API_KEY=[REDACTED]');
  });

  it('redacts SECRET_KEY=value', () => {
    const input = 'SECRET_KEY=abcdef123456';
    const result = redactSensitive(input);
    expect(result).toBe('SECRET_KEY=[REDACTED]');
  });

  it('redacts ACCESS_TOKEN=value', () => {
    const input = 'ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const result = redactSensitive(input);
    expect(result).toBe('ACCESS_TOKEN=[REDACTED]');
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  it('returns empty string for empty input', () => {
    expect(redactSensitive('')).toBe('');
  });

  it('leaves non-sensitive text unchanged', () => {
    const input = 'Running tsc --noEmit && vitest run --reporter=verbose';
    expect(redactSensitive(input)).toBe(input);
  });

  it('redacts multiple sensitive values in one string', () => {
    const input = [
      'OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno',
      'connecting to https://user:password123@host.com',
      'Authorization: Bearer eyJtoken123',
    ].join('\n');
    const result = redactSensitive(input);
    expect(result).not.toContain('sk-proj-abc123');
    expect(result).not.toContain('password123');
    expect(result).not.toContain('eyJtoken123');
    expect(result).toContain('[REDACTED]');
  });

  it('preserves surrounding text structure', () => {
    const input = 'Before sk-proj-abcdefghijklmnopqrstuvwxyz After';
    const result = redactSensitive(input);
    expect(result).toBe('Before [REDACTED] After');
  });

  it('does not redact normal words that happen to contain "key"', () => {
    const input = 'keyboard monkey turkey keystone';
    expect(redactSensitive(input)).toBe(input);
  });

  // ─── Regression: ADR-008 Migration ───────────────────────────────
  // These tests confirm the function is importable from core/ directly
  // (i.e. agents/ no longer needs to go through cli/helpers/)

  it('regression: function is a pure utility with no side effects', () => {
    const original = 'OPENAI_API_KEY=secret123';
    const result1 = redactSensitive(original);
    const result2 = redactSensitive(original);
    // Calling twice must yield same result (pure function)
    expect(result1).toBe(result2);
    // Original must be unchanged
    expect(original).toBe('OPENAI_API_KEY=secret123');
  });

  it('regression: output.ts re-export produces same result as core import', async () => {
    // Verify that output.ts re-exports the same function (backward compat)
    const { redactSensitive: redactFromOutput } = await import('../../src/cli/helpers/output.js');
    const input = 'Bearer secret-token-value';
    expect(redactSensitive(input)).toBe(redactFromOutput(input));
  });
});
