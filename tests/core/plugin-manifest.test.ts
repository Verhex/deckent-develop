import { describe, it, expect } from 'vitest';
import { validateManifest, PluginError } from '../../src/core/plugin.js';

// Helper to call the exported validateManifest
const pluginDir = '/test/plugins/myplugin';

describe('validateManifest — required fields', () => {
  it('accepts a valid minimal manifest', () => {
    const raw = { name: 'my-plugin', version: '1.0.0', description: 'A plugin', entrypoint: 'SKILL.md' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.name).toBe('my-plugin');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.description).toBe('A plugin');
    expect(manifest.entrypoint).toBe('SKILL.md');
    expect(manifest.enabled).toBe(true);
  });

  it('throws if raw is not an object', () => {
    expect(() => validateManifest(null, pluginDir)).toThrow(PluginError);
    expect(() => validateManifest('string', pluginDir)).toThrow(PluginError);
    expect(() => validateManifest(42, pluginDir)).toThrow(PluginError);
    expect(() => validateManifest(undefined, pluginDir)).toThrow(PluginError);
  });

  it('throws if name is missing', () => {
    const raw = { version: '1.0.0', description: 'desc', entrypoint: 'SKILL.md' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/missing or empty field "name"/);
  });

  it('throws if name is empty string', () => {
    const raw = { name: '  ', version: '1.0.0', description: 'desc', entrypoint: 'SKILL.md' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/missing or empty field "name"/);
  });

  it('throws if version is missing', () => {
    const raw = { name: 'my-plugin', description: 'desc', entrypoint: 'SKILL.md' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/missing or empty field "version"/);
  });

  it('throws if description is missing', () => {
    const raw = { name: 'my-plugin', version: '1.0.0', entrypoint: 'SKILL.md' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/missing or empty field "description"/);
  });

  it('throws if entrypoint is missing', () => {
    const raw = { name: 'my-plugin', version: '1.0.0', description: 'desc' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/missing or empty field "entrypoint"/);
  });
});

describe('validateManifest — enabled field', () => {
  it('defaults enabled to true when not specified', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.enabled).toBe(true);
  });

  it('preserves enabled=false', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', enabled: false };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.enabled).toBe(false);
  });
});

describe('validateManifest — triggers (v2)', () => {
  it('accepts valid triggers array', () => {
    const raw = {
      name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md',
      triggers: ['test', 'run-tests'],
    };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.triggers).toEqual(['test', 'run-tests']);
  });

  it('accepts empty triggers array', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', triggers: [] };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.triggers).toEqual([]);
  });

  it('throws if triggers is not an array', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', triggers: 'test' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/triggers.*must be an array/);
  });

  it('throws if triggers contains non-string values', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', triggers: [1, 2] };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/triggers.*must be an array of strings/);
  });

  it('omits triggers if not specified', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.triggers).toBeUndefined();
  });
});

describe('validateManifest — permissions (v2)', () => {
  it('accepts valid permissions array', () => {
    const raw = {
      name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md',
      permissions: ['read:tasks', 'write:results'],
    };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.permissions).toEqual(['read:tasks', 'write:results']);
  });

  it('throws if permissions is not an array', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', permissions: 'read' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/permissions.*must be an array/);
  });

  it('throws if permissions contains non-string values', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', permissions: [true] };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/permissions.*must be an array of strings/);
  });
});

describe('validateManifest — hooks (v2)', () => {
  it('accepts valid hooks with beforeSprint and afterSprint', () => {
    const raw = {
      name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md',
      hooks: { beforeSprint: 'scripts/before.sh', afterSprint: 'scripts/after.sh' },
    };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.hooks?.beforeSprint).toBe('scripts/before.sh');
    expect(manifest.hooks?.afterSprint).toBe('scripts/after.sh');
  });

  it('accepts hooks with only beforeSprint', () => {
    const raw = {
      name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md',
      hooks: { beforeSprint: 'scripts/before.sh' },
    };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.hooks?.beforeSprint).toBe('scripts/before.sh');
    expect(manifest.hooks?.afterSprint).toBeUndefined();
  });

  it('accepts hooks with only afterSprint', () => {
    const raw = {
      name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md',
      hooks: { afterSprint: 'scripts/after.sh' },
    };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.hooks?.afterSprint).toBe('scripts/after.sh');
    expect(manifest.hooks?.beforeSprint).toBeUndefined();
  });

  it('accepts empty hooks object', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', hooks: {} };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.hooks).toBeDefined();
  });

  it('throws if hooks is not an object', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', hooks: 'bad' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/hooks.*must be an object/);
  });

  it('throws if hooks is an array', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', hooks: [] };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/hooks.*must be an object/);
  });

  it('throws if hooks.beforeSprint is not a string', () => {
    const raw = {
      name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md',
      hooks: { beforeSprint: 42 },
    };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/hooks\.beforeSprint.*must be a string/);
  });

  it('throws if hooks.afterSprint is not a string', () => {
    const raw = {
      name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md',
      hooks: { afterSprint: true },
    };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/hooks\.afterSprint.*must be a string/);
  });

  it('omits hooks if not specified', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.hooks).toBeUndefined();
  });
});

describe('validateManifest — model (v2)', () => {
  it('accepts opus', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', model: 'claude-opus-4-8' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.model).toBe('claude-opus-4-8');
  });

  it('accepts sonnet', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', model: 'claude-sonnet-5' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.model).toBe('claude-sonnet-5');
  });

  it('accepts haiku', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', model: 'claude-haiku-4-5-20251001' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.model).toBe('claude-haiku-4-5-20251001');
  });

  it('throws for invalid model', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', model: 'gpt-4' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/model.*canonical registered API ID/);
  });

  it('omits model if not specified', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.model).toBeUndefined();
  });
});

describe('validateManifest — dependencies (v2)', () => {
  it('accepts valid dependencies array', () => {
    const raw = {
      name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md',
      dependencies: ['test-runner', 'code-reviewer'],
    };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.dependencies).toEqual(['test-runner', 'code-reviewer']);
  });

  it('accepts empty dependencies array', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', dependencies: [] };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.dependencies).toEqual([]);
  });

  it('throws if dependencies is not an array', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', dependencies: 'dep' };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/dependencies.*must be an array/);
  });

  it('throws if dependencies contains non-string values', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md', dependencies: [1] };
    expect(() => validateManifest(raw, pluginDir)).toThrow(/dependencies.*must be an array of strings/);
  });

  it('omits dependencies if not specified', () => {
    const raw = { name: 'p', version: '1.0.0', description: 'd', entrypoint: 'SKILL.md' };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.dependencies).toBeUndefined();
  });
});

describe('validateManifest — full v2 manifest', () => {
  it('accepts a complete v2 manifest with all fields', () => {
    const raw = {
      name: 'test-runner',
      version: '2.0.0',
      description: 'Automated testing plugin',
      entrypoint: 'SKILL.md',
      enabled: true,
      triggers: ['test', 'run-tests', 'vitest'],
      permissions: ['read:tasks', 'write:results'],
      hooks: { beforeSprint: 'scripts/setup.sh', afterSprint: 'scripts/cleanup.sh' },
      model: 'claude-sonnet-5',
      dependencies: ['code-reviewer'],
    };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.name).toBe('test-runner');
    expect(manifest.version).toBe('2.0.0');
    expect(manifest.enabled).toBe(true);
    expect(manifest.triggers).toEqual(['test', 'run-tests', 'vitest']);
    expect(manifest.permissions).toEqual(['read:tasks', 'write:results']);
    expect(manifest.hooks?.beforeSprint).toBe('scripts/setup.sh');
    expect(manifest.hooks?.afterSprint).toBe('scripts/cleanup.sh');
    expect(manifest.model).toBe('claude-sonnet-5');
    expect(manifest.dependencies).toEqual(['code-reviewer']);
  });

  it('accepts manifest with only some v2 fields', () => {
    const raw = {
      name: 'doc-writer',
      version: '1.0.0',
      description: 'Documentation plugin',
      entrypoint: 'SKILL.md',
      model: 'claude-opus-4-8',
      triggers: ['doc', 'write-docs'],
    };
    const manifest = validateManifest(raw, pluginDir);
    expect(manifest.model).toBe('claude-opus-4-8');
    expect(manifest.triggers).toEqual(['doc', 'write-docs']);
    expect(manifest.permissions).toBeUndefined();
    expect(manifest.hooks).toBeUndefined();
    expect(manifest.dependencies).toBeUndefined();
  });
});
