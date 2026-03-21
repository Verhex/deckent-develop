import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setOutputMode,
  getOutputMode,
  resetOutputMode,
  shouldOutput,
  wrapLogger,
} from '../../../src/cli/helpers/output-mode.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('OutputMode', () => {
  beforeEach(() => {
    resetOutputMode();
  });

  // ─── setOutputMode / getOutputMode ────────────────────────────────

  describe('setOutputMode / getOutputMode', () => {
    it('default mode is normal', () => {
      expect(getOutputMode()).toBe('normal');
    });

    it('sets mode to quiet', () => {
      setOutputMode('quiet');
      expect(getOutputMode()).toBe('quiet');
    });

    it('sets mode to verbose', () => {
      setOutputMode('verbose');
      expect(getOutputMode()).toBe('verbose');
    });

    it('sets mode to normal', () => {
      setOutputMode('verbose');
      setOutputMode('normal');
      expect(getOutputMode()).toBe('normal');
    });
  });

  // ─── resetOutputMode ──────────────────────────────────────────────

  describe('resetOutputMode', () => {
    it('resets to normal', () => {
      setOutputMode('verbose');
      resetOutputMode();
      expect(getOutputMode()).toBe('normal');
    });
  });

  // ─── shouldOutput ─────────────────────────────────────────────────

  describe('shouldOutput', () => {
    it('quiet mode: allows quiet messages', () => {
      setOutputMode('quiet');
      expect(shouldOutput('quiet')).toBe(true);
    });

    it('quiet mode: blocks normal messages', () => {
      setOutputMode('quiet');
      expect(shouldOutput('normal')).toBe(false);
    });

    it('quiet mode: blocks verbose messages', () => {
      setOutputMode('quiet');
      expect(shouldOutput('verbose')).toBe(false);
    });

    it('normal mode: allows quiet messages', () => {
      setOutputMode('normal');
      expect(shouldOutput('quiet')).toBe(true);
    });

    it('normal mode: allows normal messages', () => {
      setOutputMode('normal');
      expect(shouldOutput('normal')).toBe(true);
    });

    it('normal mode: blocks verbose messages', () => {
      setOutputMode('normal');
      expect(shouldOutput('verbose')).toBe(false);
    });

    it('verbose mode: allows quiet messages', () => {
      setOutputMode('verbose');
      expect(shouldOutput('quiet')).toBe(true);
    });

    it('verbose mode: allows normal messages', () => {
      setOutputMode('verbose');
      expect(shouldOutput('normal')).toBe(true);
    });

    it('verbose mode: allows verbose messages', () => {
      setOutputMode('verbose');
      expect(shouldOutput('verbose')).toBe(true);
    });
  });

  // ─── wrapLogger ───────────────────────────────────────────────────

  describe('wrapLogger', () => {
    it('quiet method calls writeFn when mode is quiet', () => {
      setOutputMode('quiet');
      const writeFn = vi.fn();
      const logger = wrapLogger(writeFn);
      logger.quiet('error message');
      expect(writeFn).toHaveBeenCalledWith('error message');
    });

    it('normal method does not call writeFn when mode is quiet', () => {
      setOutputMode('quiet');
      const writeFn = vi.fn();
      const logger = wrapLogger(writeFn);
      logger.normal('info message');
      expect(writeFn).not.toHaveBeenCalled();
    });

    it('verbose method does not call writeFn when mode is normal', () => {
      setOutputMode('normal');
      const writeFn = vi.fn();
      const logger = wrapLogger(writeFn);
      logger.verbose('debug message');
      expect(writeFn).not.toHaveBeenCalled();
    });

    it('verbose method calls writeFn when mode is verbose', () => {
      setOutputMode('verbose');
      const writeFn = vi.fn();
      const logger = wrapLogger(writeFn);
      logger.verbose('debug message');
      expect(writeFn).toHaveBeenCalledWith('debug message');
    });

    it('all methods call writeFn when mode is verbose', () => {
      setOutputMode('verbose');
      const writeFn = vi.fn();
      const logger = wrapLogger(writeFn);
      logger.quiet('a');
      logger.normal('b');
      logger.verbose('c');
      expect(writeFn).toHaveBeenCalledTimes(3);
    });
  });
});
