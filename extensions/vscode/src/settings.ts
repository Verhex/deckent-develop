// VS Code extension settings bridge: vscode deckent.* ↔ .deckent/config.json.
// Dependency-injected (SettingsFs, SettingsVsCodeApi) — testable without a vscode runtime.
// Bridges max_workers, brain_provider, worker_provider.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeckentSettings {
  max_workers: number;
  brain_provider: string;
  worker_provider: string;
}

export interface SettingsFs {
  readJson(filePath: string): unknown;
  writeJson(filePath: string, data: unknown): void;
}

export interface WorkspaceConfiguration {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): void;
}

export interface SettingsVsCodeApi {
  workspace: {
    getConfiguration(section: string): WorkspaceConfiguration;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULTS: Readonly<DeckentSettings> = {
  max_workers: 4,
  brain_provider: 'claude',
  worker_provider: 'claude',
};

// ─── Default fs implementation ────────────────────────────────────────────────

export function createNodeFs(): SettingsFs {
  return {
    readJson: (filePath) => JSON.parse(readFileSync(filePath, 'utf8')),
    writeJson: (filePath, data) => writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'),
  };
}

// ─── Config file I/O ─────────────────────────────────────────────────────────

function configPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.deckent', 'config.json');
}

export function readDeckentConfig(workspaceRoot: string, fs: SettingsFs): DeckentSettings {
  try {
    const raw = fs.readJson(configPath(workspaceRoot)) as Record<string, unknown>;
    return {
      max_workers:
        typeof raw['max_workers'] === 'number' ? raw['max_workers'] : DEFAULTS.max_workers,
      brain_provider:
        typeof raw['brain_provider'] === 'string' ? raw['brain_provider'] : DEFAULTS.brain_provider,
      worker_provider:
        typeof raw['worker_provider'] === 'string'
          ? raw['worker_provider']
          : DEFAULTS.worker_provider,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeDeckentConfig(
  workspaceRoot: string,
  updates: Partial<DeckentSettings>,
  fs: SettingsFs,
): void {
  let current: Record<string, unknown> = {};
  try {
    current = fs.readJson(configPath(workspaceRoot)) as Record<string, unknown>;
  } catch {
    // fresh config — start empty
  }
  fs.writeJson(configPath(workspaceRoot), { ...current, ...updates });
}

// ─── VS Code settings sync ───────────────────────────────────────────────────

export function readVsCodeSettings(vscode: SettingsVsCodeApi): DeckentSettings {
  const cfg = vscode.workspace.getConfiguration('deckent');
  return {
    max_workers: cfg.get('max_workers', DEFAULTS.max_workers),
    brain_provider: cfg.get('brain_provider', DEFAULTS.brain_provider),
    worker_provider: cfg.get('worker_provider', DEFAULTS.worker_provider),
  };
}

export function applyToVsCode(settings: Partial<DeckentSettings>, vscode: SettingsVsCodeApi): void {
  const cfg = vscode.workspace.getConfiguration('deckent');
  for (const [key, value] of Object.entries(settings)) {
    cfg.update(key, value);
  }
}
