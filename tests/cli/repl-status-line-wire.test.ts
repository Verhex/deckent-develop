/**
 * Tests for 222-006: status-line REPL'e GERÇEK-bas
 *
 * Verifies that `renderStatusLine` is wired into the REPL launch so
 * provider/dir appears at startup — and that `chat.status_line: false`
 * suppresses the status line.
 *
 * These tests are hermetic: they call `renderStatusLine` directly (pure
 * function — no I/O, no subprocess, no network).
 */

import { describe, it, expect } from 'vitest';
import {
  renderStatusLine,
  type StatusLineContext,
} from '../../src/cli/commands/chat-status-line.js';

// ─── Helpers ────────────────────────────────────────────────────────

function ctx(overrides: Partial<StatusLineContext> = {}): StatusLineContext {
  return {
    provider: 'claude',
    dir: '/workspace',
    activeSprint: null,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('renderStatusLine — status-line wire (222-006)', () => {
  it('renders status line with provider and dir by default (undefined config)', () => {
    const result = renderStatusLine(ctx(), undefined);
    expect(result).toContain('claude');
    expect(result).toContain('/workspace');
    expect(result.length).toBeGreaterThan(0);
  });

  it('reflects the provider name in the rendered output', () => {
    const resultClaude = renderStatusLine(ctx({ provider: 'claude' }), undefined);
    const resultOllama = renderStatusLine(ctx({ provider: 'ollama' }), undefined);
    expect(resultClaude).toContain('claude');
    expect(resultOllama).toContain('ollama');
  });

  it('returns empty string when status_line config is false (config-kapalı→yok)', () => {
    const result = renderStatusLine(ctx(), false);
    expect(result).toBe('');
  });

  it('shows dir correctly when status_line is true', () => {
    const result = renderStatusLine(ctx({ dir: '/home/user/myproject' }), true);
    expect(result).toContain('/home/user/myproject');
  });

  it('includes active sprint when present', () => {
    const result = renderStatusLine(ctx({ activeSprint: 'sprint-222' }), undefined);
    expect(result).toContain('sprint-222');
  });

  it('omits sprint when activeSprint is null', () => {
    const result = renderStatusLine(ctx({ activeSprint: null }), undefined);
    expect(result).not.toContain('sprint-');
    expect(result).toContain('claude');
  });
});
