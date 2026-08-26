import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
const outputMocks = vi.hoisted(() => ({ print: vi.fn(), printError: vi.fn() }));
const derivationMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  ...fsMocks,
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(),
  cpSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
}));
vi.mock('../../src/cli/helpers/output.js', () => ({
  ...outputMocks,
  formatTable: vi.fn(),
}));
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/project'),
}));
vi.mock('../../src/core/skill-profile-derivation.js', () => ({
  deriveCanonicalSkillProfile: derivationMock,
}));
vi.mock('../../src/core/skill-pool.js', () => ({ snapshotSkillCatalog: vi.fn() }));
vi.mock('../../src/core/catalog-stats-read-model.js', () => ({ readCatalogStats: vi.fn() }));
vi.mock('../../src/orchestra/ecosystem-intelligence.js', () => ({
  analyzeNewSkill: vi.fn(),
  persistSkillActivation: vi.fn(),
}));
vi.mock('../../src/cli/commands/skill-marketplace.js', () => ({
  registerSkillMarketplace: vi.fn(),
}));

import { registerSkill, SkillCreateProfileError } from '../../src/cli/commands/skill.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

async function create(name: string): Promise<void> {
  const program = new Command().exitOverride();
  registerSkill(program);
  await program.parseAsync(['node', 'test', 'skill', 'create', name]);
}

describe('skill create routing-profile gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    delete process.env['DECKENT_LANGUAGE'];
  });

  it('persists the generated canonical profile before writing the skill', async () => {
    derivationMock.mockReturnValue({
      status: 'routable',
      origin: 'derived-profile',
      profile: {
        profileVersion: 3,
        workTypes: [{ type: 'build', proficiency: 'primary' }],
        domains: [],
        expertise: ['custom skill'],
        deliverables: ['code-src'],
      },
      provenance: { derivationVersion: 2, fields: {} },
    });

    await create('profiled-skill');

    const manifestWrite = fsMocks.writeFileSync.mock.calls.find(([path]) =>
      String(path).endsWith('manifest.json'));
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(String(manifestWrite?.[1]))).toMatchObject({
      profile: { profileVersion: 3 },
      profileProvenance: { derivationVersion: 2 },
    });
  });

  it.each([
    ['en', 'was not created'],
    ['tr', 'olu\u015fturulmad\u0131'],
  ])('fails before every filesystem write with typed, localized guidance (%s)', async (lang, text) => {
    process.env['DECKENT_LANGUAGE'] = lang;
    derivationMock.mockReturnValue({
      status: 'unroutable',
      origin: 'derived-profile',
      profile: null,
      diagnostic: {
        disposition: 'HOLD',
        reasonCode: 'insufficient-source-metadata',
        message: 'not enough metadata',
        issues: [],
      },
    });

    await create('unroutable-skill');

    expect(fsMocks.mkdirSync).not.toHaveBeenCalled();
    expect(fsMocks.writeFileSync).not.toHaveBeenCalled();
    expect(outputMocks.printError).toHaveBeenCalledWith(expect.any(SkillCreateProfileError));
    const error = outputMocks.printError.mock.calls[0]?.[0] as SkillCreateProfileError;
    expect(error.code).toBe('SKILL_CREATE_PROFILE_REQUIRED');
    expect(error.message).toContain(text);
    expect(error.message).toBe(getMessage(
      'cli.skill.create.profile_required',
      lang,
      { name: 'unroutable-skill', reason: 'insufficient-source-metadata' },
    ));
    expect(process.exitCode).toBe(1);
  });
});
