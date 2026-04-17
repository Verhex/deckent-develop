import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebugLog } from '../../src/core/debug-log.js';

describe('createDebugLog', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env['DECKENT_DEBUG'];
  });

  it('stays silent when DECKENT_DEBUG is unset', () => {
    delete process.env['DECKENT_DEBUG'];
    const log = createDebugLog('test');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('outputs info/warn/error when DECKENT_DEBUG=1', () => {
    process.env['DECKENT_DEBUG'] = '1';
    const log = createDebugLog('mymod');
    log.debug('should not show');
    log.info('hello info');
    log.warn('hello warn');
    log.error('hello error');
    // debug should be skipped (3 calls, not 4)
    expect(stderrSpy).toHaveBeenCalledTimes(3);
    const calls = stderrSpy.mock.calls.map(c => String(c[0]));
    expect(calls[0]).toContain('[INF]');
    expect(calls[0]).toContain('[mymod]');
    expect(calls[1]).toContain('[WRN]');
    expect(calls[2]).toContain('[ERR]');
  });

  it('outputs all levels including debug when DECKENT_DEBUG=debug', () => {
    process.env['DECKENT_DEBUG'] = 'debug';
    const log = createDebugLog('fts5');
    log.debug('trace');
    log.info('info');
    log.warn('warn');
    log.error('err');
    expect(stderrSpy).toHaveBeenCalledTimes(4);
    const first = String(stderrSpy.mock.calls[0]![0]);
    expect(first).toContain('[DBG]');
    expect(first).toContain('[fts5]');
    expect(first).toContain('trace');
  });

  it('formats messages with ISO timestamp', () => {
    process.env['DECKENT_DEBUG'] = '1';
    const log = createDebugLog('fmt');
    log.error('test msg');
    const output = String(stderrSpy.mock.calls[0]![0]);
    // Should contain ISO timestamp pattern
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(output).toContain('[ERR]');
    expect(output).toContain('[fmt]');
    expect(output).toContain('test msg');
  });
});
