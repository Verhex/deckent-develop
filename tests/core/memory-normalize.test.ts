import { describe, it, expect } from 'vitest';
import { turkishNormalize } from '../../src/core/memory-normalize.js';

describe('turkishNormalize', () => {
  it('converts Turkish I to ı then to i', () => {
    expect(turkishNormalize('IŞIK')).toBe('isik');
  });

  it('converts Turkish İ to i', () => {
    expect(turkishNormalize('İstanbul')).toBe('istanbul');
  });

  it('handles all Turkish special chars lowercase', () => {
    expect(turkishNormalize('ığüşöç')).toBe('igusoc');
  });

  it('handles all Turkish special chars uppercase', () => {
    expect(turkishNormalize('IĞÜŞÖÇ')).toBe('igusoc');
  });

  it('normalizes German umlauts', () => {
    expect(turkishNormalize('Lösung über')).toBe('losung uber');
  });

  it('preserves ASCII text unchanged', () => {
    expect(turkishNormalize('docker heartbeat')).toBe('docker heartbeat');
  });

  it('handles mixed case', () => {
    expect(turkishNormalize('Güvenlik Protokolü')).toBe('guvenlik protokolu');
  });

  it('handles empty string', () => {
    expect(turkishNormalize('')).toBe('');
  });

  it('preserves technical terms lowercased', () => {
    expect(turkishNormalize('spawnSync')).toBe('spawnsync');
  });

  it('handles Spanish accents', () => {
    expect(turkishNormalize('señor café')).toBe('senor cafe');
  });

  it('handles French accents', () => {
    expect(turkishNormalize('résumé naïve')).toBe('resume naive');
  });

  it('converts ÇÖKME to cokme', () => {
    expect(turkishNormalize('ÇÖKME')).toBe('cokme');
  });

  it('normalizes öğrenci', () => {
    expect(turkishNormalize('öğrenci')).toBe('ogrenci');
  });

  it('normalizes üzüm', () => {
    expect(turkishNormalize('üzüm')).toBe('uzum');
  });

  it('handles numbers and special chars', () => {
    expect(turkishNormalize('Sprint-139: Docker')).toBe('sprint-139: docker');
  });
});
