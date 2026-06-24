import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../../../src/connectors/capabilities/platform.js';

const probe = (platform: NodeJS.Platform, proc = '') => ({ platform, procVersion: () => proc });

describe('detectPlatform', () => {
  it('win32 → win-native', () => expect(detectPlatform(probe('win32'))).toBe('win-native'));
  it('darwin → darwin', () => expect(detectPlatform(probe('darwin'))).toBe('darwin'));
  it('linux + microsoft in /proc/version → win-wsl', () =>
    expect(detectPlatform(probe('linux', 'Linux version 5.x microsoft-standard-WSL2'))).toBe('win-wsl'));
  it('plain linux → linux', () =>
    expect(detectPlatform(probe('linux', 'Linux version 6.x generic'))).toBe('linux'));
  it('other (e.g. aix) → unsupported', () => expect(detectPlatform(probe('aix' as NodeJS.Platform))).toBe('unsupported'));
});
