import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ModelType } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  entrypoint: string;
  // v2 fields
  triggers?: string[];
  permissions?: string[];
  hooks?: { beforeSprint?: string; afterSprint?: string; beforeTask?: string; afterTask?: string };
  model?: ModelType;
  enabled?: boolean;
  dependencies?: string[];
}

export interface Plugin {
  manifest: PluginManifest;
  dir: string;
}

export class PluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginError';
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_MODELS: ModelType[] = ['opus', 'sonnet', 'haiku'];

export function validateManifest(raw: unknown, pluginDir: string): PluginManifest {
  if (!raw || typeof raw !== 'object') {
    throw new PluginError(`Invalid manifest in ${pluginDir}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const required = ['name', 'version', 'description', 'entrypoint'] as const;
  for (const field of required) {
    if (typeof obj[field] !== 'string' || !(obj[field] as string).trim()) {
      throw new PluginError(`Invalid manifest in ${pluginDir}: missing or empty field "${field}"`);
    }
  }

  // Validate optional array fields
  for (const field of ['triggers', 'permissions', 'dependencies'] as const) {
    if (obj[field] !== undefined) {
      if (!Array.isArray(obj[field])) {
        throw new PluginError(`Invalid manifest in ${pluginDir}: "${field}" must be an array`);
      }
      for (const item of obj[field] as unknown[]) {
        if (typeof item !== 'string') {
          throw new PluginError(`Invalid manifest in ${pluginDir}: "${field}" must be an array of strings`);
        }
      }
    }
  }

  // Validate hooks
  if (obj['hooks'] !== undefined) {
    if (typeof obj['hooks'] !== 'object' || Array.isArray(obj['hooks']) || obj['hooks'] === null) {
      throw new PluginError(`Invalid manifest in ${pluginDir}: "hooks" must be an object`);
    }
    const hooks = obj['hooks'] as Record<string, unknown>;
    for (const hookKey of ['beforeSprint', 'afterSprint'] as const) {
      if (hooks[hookKey] !== undefined && typeof hooks[hookKey] !== 'string') {
        throw new PluginError(`Invalid manifest in ${pluginDir}: "hooks.${hookKey}" must be a string`);
      }
    }
  }

  // Validate model
  if (obj['model'] !== undefined) {
    if (!VALID_MODELS.includes(obj['model'] as ModelType)) {
      throw new PluginError(
        `Invalid manifest in ${pluginDir}: "model" must be one of ${VALID_MODELS.join(', ')}`
      );
    }
  }

  const manifest: PluginManifest = {
    name: obj['name'] as string,
    version: obj['version'] as string,
    description: obj['description'] as string,
    entrypoint: obj['entrypoint'] as string,
    enabled: obj['enabled'] === false ? false : true,
  };

  if (obj['triggers'] !== undefined) manifest.triggers = obj['triggers'] as string[];
  if (obj['permissions'] !== undefined) manifest.permissions = obj['permissions'] as string[];
  if (obj['dependencies'] !== undefined) manifest.dependencies = obj['dependencies'] as string[];
  if (obj['model'] !== undefined) manifest.model = obj['model'] as ModelType;
  if (obj['hooks'] !== undefined) {
    const h = obj['hooks'] as Record<string, unknown>;
    manifest.hooks = {};
    if (typeof h['beforeSprint'] === 'string') manifest.hooks.beforeSprint = h['beforeSprint'];
    if (typeof h['afterSprint'] === 'string') manifest.hooks.afterSprint = h['afterSprint'];
  }

  return manifest;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Load a single plugin from a directory containing manifest.json.
 */
export function loadPlugin(pluginDir: string): Plugin {
  const manifestPath = path.join(pluginDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new PluginError(`No manifest.json found in ${pluginDir}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new PluginError(`Failed to parse manifest.json in ${pluginDir}: ${(err as Error).message}`);
  }
  const manifest = validateManifest(raw, pluginDir);
  return { manifest, dir: pluginDir };
}

/**
 * List all enabled plugins in a directory (each subdirectory with a manifest.json).
 * Plugins with enabled=false in their manifest are excluded.
 */
export function listPlugins(pluginsDir: string): Plugin[] {
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const plugins: Plugin[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.join(pluginsDir, entry.name);
    try {
      const plugin = loadPlugin(pluginDir);
      if (plugin.manifest.enabled !== false) {
        plugins.push(plugin);
      }
    } catch {
      // Skip invalid plugin directories silently
    }
  }
  return plugins;
}

/**
 * Scan for plugins in {projectRoot}/.deckent/plugins/.
 * Only returns enabled plugins.
 */
export function scanPlugins(projectRoot: string): Plugin[] {
  const pluginsDir = path.join(projectRoot, '.deckent', 'plugins');
  return listPlugins(pluginsDir);
}

// ─── Enable / Disable ─────────────────────────────────────────────────────────

/**
 * Enable a plugin by setting enabled=true in its manifest.json.
 * Returns true on success, false if the plugin does not exist.
 */
export function enablePlugin(pluginName: string, pluginsDir: string): boolean {
  const pluginDir = path.join(pluginsDir, pluginName);
  const manifestPath = path.join(pluginDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return false;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return false;
  }
  raw['enabled'] = true;
  fs.writeFileSync(manifestPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  return true;
}

/**
 * Disable a plugin by setting enabled=false in its manifest.json.
 * Returns true on success, false if the plugin does not exist.
 */
export function disablePlugin(pluginName: string, pluginsDir: string): boolean {
  const pluginDir = path.join(pluginsDir, pluginName);
  const manifestPath = path.join(pluginDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return false;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return false;
  }
  raw['enabled'] = false;
  fs.writeFileSync(manifestPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  return true;
}

// ─── Install ──────────────────────────────────────────────────────────────────

function isGitUrl(source: string): boolean {
  return (
    source.startsWith('https://') ||
    source.startsWith('http://') ||
    source.startsWith('git@') ||
    source.endsWith('.git')
  );
}

/**
 * Install a plugin from a local directory path or a git URL.
 * - Local path: copies the directory into pluginsDir
 * - Git URL: clones the repo into pluginsDir
 * Throws PluginError if:
 * - manifest is invalid
 * - a plugin with the same name already exists
 * - source path does not exist (local)
 * - git clone fails
 */
export async function installPlugin(source: string, pluginsDir: string): Promise<Plugin> {
  await fsp.mkdir(pluginsDir, { recursive: true });

  if (isGitUrl(source)) {
    const tmpDir = path.join(pluginsDir, `.tmp-install-${Date.now()}`);
    try {
      const result = spawnSync('git', ['clone', source, tmpDir], { encoding: 'utf8' });
      if (result.status !== 0) {
        throw new PluginError(
          `Failed to clone ${source}: ${result.stderr?.trim() || 'unknown error'}`
        );
      }
      const plugin = loadPlugin(tmpDir);
      const destDir = path.join(pluginsDir, plugin.manifest.name);
      if (fs.existsSync(destDir)) {
        throw new PluginError(`Plugin "${plugin.manifest.name}" is already installed`);
      }
      await fsp.rename(tmpDir, destDir);
      return { manifest: plugin.manifest, dir: destDir };
    } catch (err) {
      if (fs.existsSync(tmpDir)) {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      }
      throw err;
    }
  } else {
    const sourceDir = path.resolve(source);
    if (!fs.existsSync(sourceDir)) {
      throw new PluginError(`Source path does not exist: ${sourceDir}`);
    }
    const plugin = loadPlugin(sourceDir);
    const destDir = path.join(pluginsDir, plugin.manifest.name);
    if (fs.existsSync(destDir)) {
      throw new PluginError(`Plugin "${plugin.manifest.name}" is already installed`);
    }
    await fsp.cp(sourceDir, destDir, { recursive: true });
    return { manifest: plugin.manifest, dir: destDir };
  }
}

// ─── Remove ───────────────────────────────────────────────────────────────────

/**
 * Remove a plugin by name from the plugins directory.
 * Returns true if removed, false if plugin was not found.
 * Throws PluginError if the plugin is a system plugin.
 */
export function removePlugin(pluginName: string, pluginsDir: string): boolean {
  const pluginDir = path.join(pluginsDir, pluginName);
  if (!fs.existsSync(pluginDir)) {
    return false;
  }
  // Check if it's a system plugin by loading the manifest
  const manifestPath = path.join(pluginDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      raw = null;
    }
    if (raw && typeof raw === 'object' && (raw as Record<string, unknown>)['system'] === true) {
      throw new PluginError(`Cannot remove system plugin "${pluginName}"`);
    }
  }
  fs.rmSync(pluginDir, { recursive: true, force: true });
  return true;
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Scaffold a new plugin directory with manifest.json, SKILL.md, and README.md.
 * Throws PluginError if the plugin directory already exists.
 */
export async function createPlugin(name: string, pluginsDir: string): Promise<Plugin> {
  const pluginDir = path.join(pluginsDir, name);
  if (fs.existsSync(pluginDir)) {
    throw new PluginError(`Plugin "${name}" already exists at ${pluginDir}`);
  }

  await fsp.mkdir(pluginDir, { recursive: true });

  const manifest: PluginManifest = {
    name,
    version: '0.1.0',
    description: '',
    entrypoint: 'SKILL.md',
  };

  await fsp.writeFile(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  const skillMd = [
    '---',
    `name: ${name}`,
    'version: 0.1.0',
    'description: ""',
    'triggers: []',
    'model: opus',
    '---',
    '',
    `# ${name}`,
    '',
    '<!-- Describe what this skill does -->',
    '',
  ].join('\n');
  await fsp.writeFile(path.join(pluginDir, 'SKILL.md'), skillMd, 'utf8');

  const readmeMd = [
    `# ${name} Plugin`,
    '',
    '## Description',
    '',
    '<!-- Describe this plugin -->',
    '',
    '## Usage',
    '',
    '<!-- How to use this plugin -->',
    '',
    '## Configuration',
    '',
    '<!-- Configuration options -->',
    '',
  ].join('\n');
  await fsp.writeFile(path.join(pluginDir, 'README.md'), readmeMd, 'utf8');

  return { manifest, dir: pluginDir };
}
