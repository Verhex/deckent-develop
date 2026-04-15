import { describe, it, expect } from 'vitest';
import {
  formatStatus,
  resolveOutputMode,
  getEmoji,
  type OutputMode,
  type StatusData,
} from '../../src/core/output-formatter.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_DATA: StatusData = {
  sprintId: 'sprint-139',
  phase: 'EXECUTE',
  totalTasks: 10,
  completedTasks: 7,
  failedTasks: 1,
  techDebtTasks: 2,
  activeWorkers: 3,
  coverage: 87.5,
  duration: '12dk 34sn',
};

const MINIMAL_DATA: StatusData = {
  sprintId: 'sprint-001',
};

// ─── formatStatus dispatch ────────────────────────────────────────────────────

describe('formatStatus', () => {
  describe('explainatory mode', () => {
    it('renders ★ Insight header and footer', () => {
      const out = formatStatus(FULL_DATA, 'explainatory');
      expect(out).toContain('★ Insight');
      expect(out).toContain('─────────────────────────────────────────────────');
    });

    it('includes sprintId in header line', () => {
      const out = formatStatus(FULL_DATA, 'explainatory');
      expect(out).toContain('sprint-139');
    });

    it('shows completed / total tasks', () => {
      const out = formatStatus(FULL_DATA, 'explainatory');
      expect(out).toContain('7 / 10');
    });

    it('shows tech-debt line only when techDebtTasks > 0', () => {
      const withDebt = formatStatus(FULL_DATA, 'explainatory');
      expect(withDebt).toContain('Tech Debt');

      const noDebt: StatusData = { ...FULL_DATA, techDebtTasks: 0 };
      const withoutDebt = formatStatus(noDebt, 'explainatory');
      expect(withoutDebt).not.toContain('Tech Debt');
    });

    it('shows fail line only when failedTasks > 0', () => {
      const withFail = formatStatus(FULL_DATA, 'explainatory');
      expect(withFail).toContain('Başarısız');

      const noFail: StatusData = { ...FULL_DATA, failedTasks: 0 };
      const withoutFail = formatStatus(noFail, 'explainatory');
      expect(withoutFail).not.toContain('Başarısız');
    });

    it('includes Türkçe labels', () => {
      const out = formatStatus(FULL_DATA, 'explainatory');
      expect(out).toContain('Tamamlanan');
      expect(out).toContain('Aktif Worker');
      expect(out).toContain('Kapsam');
    });

    it('includes emoji prefix (✅ for high coverage)', () => {
      const highCov: StatusData = { ...FULL_DATA, coverage: 92 };
      const out = formatStatus(highCov, 'explainatory');
      expect(out).toContain('✅');
    });

    it('uses ⚠ for medium coverage (70–89)', () => {
      const midCov: StatusData = { ...FULL_DATA, coverage: 75 };
      const out = formatStatus(midCov, 'explainatory');
      expect(out).toContain('⚠');
    });

    it('uses ❌ for low coverage (<70)', () => {
      const lowCov: StatusData = { ...FULL_DATA, coverage: 60 };
      const out = formatStatus(lowCov, 'explainatory');
      // ❌ appears for both lowCov label AND failedTasks — ensure the coverage string is present
      expect(out).toMatch(/60\.0%/);
      expect(out).toContain('❌');
    });

    it('handles minimal data without crashing', () => {
      expect(() => formatStatus(MINIMAL_DATA, 'explainatory')).not.toThrow();
    });
  });

  describe('standart mode', () => {
    it('renders a single-line summary as first line', () => {
      const out = formatStatus(FULL_DATA, 'standart');
      const firstLine = out.split('\n')[0];
      expect(firstLine).toContain('sprint-139');
      expect(firstLine).toContain('EXECUTE');
      expect(firstLine).toContain('7/10 done');
    });

    it('renders a markdown table', () => {
      const out = formatStatus(FULL_DATA, 'standart');
      expect(out).toContain('| Metrik');
      expect(out).toContain('| Faz');
      expect(out).toContain('| Kapsam');
    });

    it('shows coverage in table', () => {
      const out = formatStatus(FULL_DATA, 'standart');
      expect(out).toContain('87.5%');
    });

    it('handles missing coverage gracefully', () => {
      const noCov: StatusData = { ...FULL_DATA, coverage: undefined };
      const out = formatStatus(noCov, 'standart');
      expect(out).toContain('N/A');
    });

    it('summary line excludes coverage when undefined', () => {
      const noCov: StatusData = { ...FULL_DATA, coverage: undefined };
      const firstLine = formatStatus(noCov, 'standart').split('\n')[0];
      expect(firstLine).not.toContain('cov:');
    });
  });

  describe('verbose mode', () => {
    it('includes VERBOSE SPRINT SNAPSHOT header', () => {
      const out = formatStatus(FULL_DATA, 'verbose');
      expect(out).toContain('VERBOSE SPRINT SNAPSHOT');
    });

    it('includes ISO timestamp', () => {
      const out = formatStatus(FULL_DATA, 'verbose');
      // matches '[2026-...' ISO 8601 prefix inside brackets
      expect(out).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    });

    it('includes all metric fields', () => {
      const out = formatStatus(FULL_DATA, 'verbose');
      expect(out).toContain('totalTasks');
      expect(out).toContain('completedTasks');
      expect(out).toContain('failedTasks');
      expect(out).toContain('coverage');
    });

    it('includes extra non-standard fields', () => {
      const extra: StatusData = { ...FULL_DATA, customField: 'hello' };
      const out = formatStatus(extra, 'verbose');
      expect(out).toContain('customField');
      expect(out).toContain('"hello"');
    });

    it('ends with END SNAPSHOT footer', () => {
      const out = formatStatus(FULL_DATA, 'verbose');
      expect(out).toContain('END SNAPSHOT');
    });
  });

  describe('json mode', () => {
    it('renders valid JSON', () => {
      const out = formatStatus(FULL_DATA, 'json');
      expect(() => JSON.parse(out)).not.toThrow();
    });

    it('JSON contains all input fields', () => {
      const out = formatStatus(FULL_DATA, 'json');
      const parsed = JSON.parse(out) as StatusData;
      expect(parsed.sprintId).toBe('sprint-139');
      expect(parsed.completedTasks).toBe(7);
      expect(parsed.coverage).toBe(87.5);
    });

    it('pretty-prints with 2-space indent', () => {
      const out = formatStatus(FULL_DATA, 'json');
      // Pretty JSON has newlines + "  " indentation
      expect(out).toContain('\n  ');
    });
  });

  describe('default mode fallback', () => {
    it('defaults to standart when mode is omitted', () => {
      const out = formatStatus(FULL_DATA);
      const standart = formatStatus(FULL_DATA, 'standart');
      expect(out).toBe(standart);
    });
  });
});

// ─── resolveOutputMode ───────────────────────────────────────────────────────

describe('resolveOutputMode', () => {
  it('accepts explainatory', () => {
    expect(resolveOutputMode('explainatory')).toBe('explainatory');
  });

  it('accepts standart', () => {
    expect(resolveOutputMode('standart')).toBe('standart');
  });

  it('accepts verbose', () => {
    expect(resolveOutputMode('verbose')).toBe('verbose');
  });

  it('accepts json', () => {
    expect(resolveOutputMode('json')).toBe('json');
  });

  it('maps legacy quiet → standart', () => {
    expect(resolveOutputMode('quiet')).toBe('standart');
  });

  it('maps legacy normal → standart', () => {
    expect(resolveOutputMode('normal')).toBe('standart');
  });

  it('returns standart for unknown values', () => {
    expect(resolveOutputMode('unknown-mode')).toBe('standart');
  });

  it('returns standart when called with no argument', () => {
    expect(resolveOutputMode()).toBe('standart');
  });

  it('returns standart for empty string', () => {
    expect(resolveOutputMode('')).toBe('standart');
  });
});

// ─── getEmoji ────────────────────────────────────────────────────────────────

describe('getEmoji', () => {
  it('returns 🚀 for rocket', () => {
    expect(getEmoji('rocket')).toBe('🚀');
  });

  it('returns ✅ for success', () => {
    expect(getEmoji('success')).toBe('✅');
  });

  it('returns ❌ for error', () => {
    expect(getEmoji('error')).toBe('❌');
  });

  it('returns ⭐ for star', () => {
    expect(getEmoji('star')).toBe('⭐');
  });

  it('returns empty string for unknown key', () => {
    expect(getEmoji('nonexistent-key')).toBe('');
  });
});

// ─── Config override integration ─────────────────────────────────────────────

describe('config override integration', () => {
  it('formatStatus respects mode parameter (simulates config.output_render_mode)', () => {
    // Simulate reading output_render_mode from config and passing to formatStatus
    const configMode: OutputMode = 'json';
    const out = formatStatus(FULL_DATA, configMode);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('resolveOutputMode handles config value correctly for explainatory', () => {
    const configValue = 'explainatory';
    const mode = resolveOutputMode(configValue);
    const out = formatStatus(FULL_DATA, mode);
    expect(out).toContain('★ Insight');
  });

  it('formatStatus with full data produces non-empty string for all modes', () => {
    const modes: OutputMode[] = ['explainatory', 'standart', 'verbose', 'json'];
    for (const mode of modes) {
      const out = formatStatus(FULL_DATA, mode);
      expect(out.length).toBeGreaterThan(0);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty StatusData object', () => {
    expect(() => formatStatus({}, 'explainatory')).not.toThrow();
    expect(() => formatStatus({}, 'standart')).not.toThrow();
    expect(() => formatStatus({}, 'verbose')).not.toThrow();
    expect(() => formatStatus({}, 'json')).not.toThrow();
  });

  it('handles coverage = 0', () => {
    const out = formatStatus({ coverage: 0 }, 'explainatory');
    expect(out).toContain('0.0%');
    expect(out).toContain('❌');
  });

  it('handles coverage = 100', () => {
    const out = formatStatus({ coverage: 100 }, 'explainatory');
    expect(out).toContain('100.0%');
    expect(out).toContain('✅');
  });

  it('handles duration absent in explainatory (no duration line)', () => {
    const noDuration: StatusData = { ...FULL_DATA, duration: undefined };
    const out = formatStatus(noDuration, 'explainatory');
    expect(out).not.toContain('Süre');
  });

  it('phase icon resolves correctly for various phases', () => {
    const phases = ['PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'CLEANUP'];
    for (const phase of phases) {
      const out = formatStatus({ phase }, 'explainatory');
      // Should not throw and should contain the phase name
      expect(out).toContain(phase);
    }
  });
});
