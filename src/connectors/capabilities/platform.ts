import { readFileSync } from 'node:fs';
import type { PlatformId } from './types.js';

export interface PlatformProbe { readonly platform: NodeJS.Platform; procVersion(): string }

const defaultProbe: PlatformProbe = {
  platform: process.platform,
  procVersion: () => { try { return readFileSync('/proc/version', 'utf-8'); } catch { return ''; } },
};

export function detectPlatform(probe: PlatformProbe = defaultProbe): PlatformId {
  if (probe.platform === 'win32') return 'win-native';
  if (probe.platform === 'darwin') return 'darwin';
  if (probe.platform === 'linux') return /microsoft/i.test(probe.procVersion()) ? 'win-wsl' : 'linux';
  return 'unsupported';
}
