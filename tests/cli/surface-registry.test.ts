import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli/index.js';
import { MESSAGE_KEYS, getMessageLanguages } from '../../src/cli/helpers/messages.js';
import {
  SURFACE_GROUPS,
  SURFACE_REGISTRY,
  SURFACE_STATUSES,
  deprecatedSet,
  findCommand,
  listByGroup,
} from '../../src/cli/surface-registry.js';

const VISIBLE_BY_GROUP = {
  run: ['do', 'run', 'plan', 'start', 'runs', 'review'],
  observe: ['status', 'watch', 'inspect', 'history', 'intelligence', 'retro'],
  control: ['approvals', 'kill', 'recover', 'cleanup', 'autonomous', 'nervous', 'xverify'],
  system: [
    'init', 'config', 'doctor',
      'help', 'sync', 'upgrade', 'connect', 'limits', 'usage',
    'agent', 'skill', 'models', 'memory', 'serve', 'bot', 'mcp',
  ],
  advanced: [],
} as const;

describe('CLI surface registry', () => {
  it('has unique, well-formed typed rows and safe accessors', () => {
    expect(new Set(SURFACE_REGISTRY.map(({ name }) => name)).size).toBe(SURFACE_REGISTRY.length);

    for (const command of SURFACE_REGISTRY) {
      expect(command.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(SURFACE_GROUPS).toContain(command.group);
      expect(SURFACE_STATUSES).toContain(command.status);
      expect(command.summaryKey.length).toBeGreaterThan(0);
      expect(new Set(command.aliases).size).toBe(command.aliases.length);
      expect(command.status === 'deprecated').toBe(command.deprecation !== undefined);
      expect(findCommand(command.name)).toBe(command);
      for (const alias of command.aliases) expect(findCommand(alias)).toBe(command);
    }

    for (const group of SURFACE_GROUPS) {
      expect(listByGroup(group)).toEqual(
        SURFACE_REGISTRY.filter((command) => command.group === group),
      );
    }
    expect(findCommand('not-a-command')).toBeUndefined();
  });

  it('implements the owner-approved v2.1 visible groups', () => {
    for (const [group, expected] of Object.entries(VISIBLE_BY_GROUP)) {
      const actual = listByGroup(group as keyof typeof VISIBLE_BY_GROUP)
        .filter(({ status }) => status === 'visible')
        .map(({ name }) => name);
      expect(actual).toEqual(expected);
    }
    expect(SURFACE_REGISTRY.filter(({ status }) => status === 'advanced').length)
      .toBeGreaterThan(0);
  });

  it('covers the complete live Commander top-level universe, including hidden entries', () => {
    const registered = buildProgram().commands.map((command) => command.name());
    const registryNames = new Set(SURFACE_REGISTRY.map(({ name }) => name));

    expect(registered.filter((name) => !registryNames.has(name))).toEqual([]);
    expect(findCommand('gateway-runtime')).toMatchObject({
      group: 'advanced',
      status: 'advanced',
      summaryKey: 'gateway.runtime_desc',
    });
  });

  it('keeps every deprecated replacement resolvable and complete', () => {
    const names = deprecatedSet();
    const deprecated = SURFACE_REGISTRY.filter(({ status }) => status === 'deprecated');

    expect([...names].sort()).toEqual(deprecated.map(({ name }) => name).sort());
    expect(names.size).toBe(12);
    for (const command of deprecated) {
      const replacementRoot = command.deprecation?.replacement.split(' ')[0];
      expect(replacementRoot).toBeTruthy();
      expect(findCommand(replacementRoot as string)).toBeDefined();
      expect(command.deprecation?.removalNote.length).toBeGreaterThan(0);
    }
  });

  it('points every summary at a real English catalog row', () => {
    const keys = new Set(MESSAGE_KEYS);
    for (const command of SURFACE_REGISTRY) {
      expect(keys.has(command.summaryKey), command.name).toBe(true);
      expect(getMessageLanguages(command.summaryKey), command.name).toContain('en');
    }
  });
});
