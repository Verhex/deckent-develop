import { describe, it, expect } from 'vitest';
import {
  renderStatusLine,
  type StatusLineContext,
  type StatusLineConfigValue,
} from '../../src/cli/commands/chat-status-line.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const BASE_CTX: StatusLineContext = {
  provider: 'claude',
  activeSprint: 'sprint-221',
  dir: '/workspace',
};

const NO_SPRINT_CTX: StatusLineContext = {
  provider: 'ollama',
  dir: '/home/user/project',
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('renderStatusLine — chat-status-line.ts', () => {
  describe('full render (statusLine=true or undefined)', () => {
    it('renders provider + sprint + dir when statusLine is undefined (default)', () => {
      const result = renderStatusLine(BASE_CTX);
      expect(result).toContain('claude');
      expect(result).toContain('sprint-221');
      expect(result).toContain('/workspace');
    });

    it('renders provider + sprint + dir when statusLine=true', () => {
      const result = renderStatusLine(BASE_CTX, true);
      expect(result).toContain('claude');
      expect(result).toContain('sprint-221');
      expect(result).toContain('/workspace');
    });

    it('starts with "deckent" prefix', () => {
      const result = renderStatusLine(BASE_CTX, true);
      expect(result.startsWith('deckent')).toBe(true);
    });

    it('reflects the actual provider name', () => {
      const result = renderStatusLine({ ...BASE_CTX, provider: 'gemini' }, true);
      expect(result).toContain('gemini');
      expect(result).not.toContain('claude');
    });
  });

  describe('config-disabled (statusLine=false)', () => {
    it('returns empty string when statusLine=false', () => {
      const result = renderStatusLine(BASE_CTX, false);
      expect(result).toBe('');
    });

    it('returns empty string even with active sprint when disabled', () => {
      const result = renderStatusLine(
        { ...BASE_CTX, activeSprint: 'sprint-999', cost: '$5.00' },
        false,
      );
      expect(result).toBe('');
    });
  });

  describe('sprint absent → sade output', () => {
    it('omits sprint token when activeSprint is absent', () => {
      const result = renderStatusLine(NO_SPRINT_CTX);
      expect(result).not.toContain('sprint-');
      expect(result).toContain('ollama');
      expect(result).toContain('/home/user/project');
    });

    it('omits sprint token when activeSprint is null', () => {
      const result = renderStatusLine({ ...BASE_CTX, activeSprint: null });
      expect(result).not.toContain('sprint-221');
      expect(result).toContain('claude');
    });
  });

  describe('field-level config', () => {
    it('shows only provider when {provider:true, sprint:false, dir:false}', () => {
      const cfg: StatusLineConfigValue = { provider: true, sprint: false, dir: false };
      const result = renderStatusLine(BASE_CTX, cfg);
      expect(result).toContain('claude');
      expect(result).not.toContain('sprint-221');
      expect(result).not.toContain('/workspace');
    });

    it('shows only dir when {dir:true}', () => {
      const cfg: StatusLineConfigValue = { dir: true };
      const result = renderStatusLine(BASE_CTX, cfg);
      expect(result).toContain('/workspace');
      expect(result).not.toContain('claude');
    });

    it('shows sprint only when {sprint:true} and sprint is active', () => {
      const cfg: StatusLineConfigValue = { sprint: true };
      const result = renderStatusLine(BASE_CTX, cfg);
      expect(result).toContain('sprint-221');
      expect(result).not.toContain('claude');
    });

    it('returns empty string when all fields are false', () => {
      const cfg: StatusLineConfigValue = { provider: false, sprint: false, dir: false };
      const result = renderStatusLine(BASE_CTX, cfg);
      expect(result).toBe('');
    });
  });

  describe('cost field (opt-in only)', () => {
    it('does NOT show cost with statusLine=true (cost is opt-in)', () => {
      const result = renderStatusLine({ ...BASE_CTX, cost: '$1.23' }, true);
      expect(result).not.toContain('$1.23');
    });

    it('shows cost when fields.cost=true and ctx.cost is set', () => {
      const cfg: StatusLineConfigValue = { provider: true, cost: true };
      const result = renderStatusLine({ ...BASE_CTX, cost: '$1.23' }, cfg);
      expect(result).toContain('$1.23');
    });

    it('does NOT show cost when fields.cost=true but ctx.cost is undefined', () => {
      const cfg: StatusLineConfigValue = { cost: true };
      const result = renderStatusLine(BASE_CTX, cfg);
      expect(result).not.toContain('$');
    });
  });
});
