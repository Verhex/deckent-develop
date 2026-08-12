import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  AgentPoolManager,
  getAgentPrompt,
  resolvePrompt,
  __setBuiltinAgentsDirForTests,
} from '../../src/core/agent-pool.js';
import type { ResolvedAgentPrompt } from '../../src/core/agent-pool.js';
import { classifyAgentManifest } from '../../src/core/agent-types.js';

// Slice S3 of follow-up-works/agent-catalog-authority-design-2026-08-11.md (row 7011):
// "Resolve AgentPromptResolution in the same pass; keep getAgentPrompt() as a thin delegate."
//
// The design's §1.3 finding is that prompt resolution was a SECOND chain with its own
// builtin-fallback condition, so this file pins the fold: ONE resolvePrompt() path honoring
// the owner-approved D1 layer precedence (L1 project > L2 runtime > L0 builtin, and the same
// order again inside the degraded tier), the D4-aligned typed classification reusing S1's
// AgentPromptAvailability / AgentRoutabilityBlocker vocabulary verbatim, and byte-identical
// output for every case that resolved before this slice.
//
// Hermetic by construction: every layer — including the "builtin" tree, which production
// resolves relative to the running module's own location — is a tmpdir fixture built here.
// Nothing reads this repository's real .deckent/ or src/core/builtins/ tree, so the file
// passes on a fresh checkout and on a long-lived machine identically (design §2.3).

const PROJECT_LAYER = join('.deckent', 'agents');
const RUNTIME_LAYER = join('.tasks', 'agents');

let root: string;
let builtinDir: string;
let warnSpy: ReturnType<typeof vi.spyOn>;

/** Seed an agent directory in one layer. `prompt`/`systemPrompt` are independently optional. */
function seedAgent(
  layerDir: string,
  id: string,
  content: { prompt?: string; systemPrompt?: string; extraManifest?: Record<string, unknown> },
): void {
  const dir = join(layerDir, id);
  mkdirSync(dir, { recursive: true });
  if (content.prompt !== undefined) {
    writeFileSync(join(dir, 'PROMPT.md'), content.prompt, 'utf8');
  }
  if (content.systemPrompt !== undefined || content.extraManifest !== undefined) {
    writeFileSync(
      join(dir, 'agent.json'),
      JSON.stringify({
        id,
        name: id,
        systemPrompt: content.systemPrompt ?? '',
        manifestVersion: 2,
        source: 'user',
        enabled: true,
        ...content.extraManifest,
      }, null, 2),
      'utf8',
    );
  }
}

const projectDir = (): string => join(root, PROJECT_LAYER);
const runtimeDir = (): string => join(root, RUNTIME_LAYER);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-prompt-s3-'));
  builtinDir = mkdtempSync(join(tmpdir(), 'deckent-prompt-s3-builtin-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ version: 1 }), 'utf8');
  __setBuiltinAgentsDirForTests(builtinDir);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __setBuiltinAgentsDirForTests(null);
  warnSpy.mockRestore();
  rmSync(root, { recursive: true, force: true });
  rmSync(builtinDir, { recursive: true, force: true });
});

describe('resolvePrompt — layer precedence (D1: L1 project > L2 runtime > L0 builtin)', () => {
  it('L1 project PROMPT.md wins over both the runtime and the builtin layer', () => {
    seedAgent(projectDir(), 'alpha', { prompt: '# Alpha\nproject layer body' });
    seedAgent(runtimeDir(), 'alpha', { prompt: '# Alpha\nruntime layer body' });
    seedAgent(builtinDir, 'alpha', { prompt: '# Alpha\nbuiltin layer body' });

    const resolved = resolvePrompt('alpha', root);

    expect(resolved.content).toBe('# Alpha\nproject layer body');
    expect(resolved.source).toBe('prompt-md');
    expect(resolved.layer).toBe('project');
    expect(resolved.resolvedFrom).toBe(join(projectDir(), 'alpha', 'PROMPT.md'));
    expect(resolved.degraded).toBe(false);
    expect(resolved.availability).toBe('prompt-file');
    expect(resolved.blocker).toBeNull();
  });

  it('L2 runtime PROMPT.md wins over the builtin layer when the project layer has no record', () => {
    seedAgent(runtimeDir(), 'beta', { prompt: 'runtime body' });
    seedAgent(builtinDir, 'beta', { prompt: 'builtin body' });

    const resolved = resolvePrompt('beta', root);

    expect(resolved.content).toBe('runtime body');
    expect(resolved.source).toBe('prompt-md');
    expect(resolved.layer).toBe('runtime');
    expect(resolved.resolvedFrom).toBe(join(runtimeDir(), 'beta', 'PROMPT.md'));
  });

  it('L0 builtin PROMPT.md resolves only when no project/runtime record exists at all', () => {
    seedAgent(builtinDir, 'gamma', { prompt: 'builtin body' });

    const resolved = resolvePrompt('gamma', root);

    expect(resolved.content).toBe('builtin body');
    expect(resolved.source).toBe('prompt-md-builtin');
    expect(resolved.layer).toBe('builtin');
    expect(resolved.degraded).toBe(false);
    expect(resolved.availability).toBe('prompt-file');
  });

  it('a project agent.json with no PROMPT.md BLOCKS the builtin tier and degrades instead', () => {
    // Design §2.4, the temp-react-specialist case: an id that already went through the
    // override path must not silently inherit the shipped builtin's persona (ADR-048).
    seedAgent(projectDir(), 'delta', { systemPrompt: 'inline persona' });
    seedAgent(builtinDir, 'delta', { prompt: 'builtin body that must NOT be reached' });

    const resolved = resolvePrompt('delta', root);

    expect(resolved.source).toBe('system-prompt');
    expect(resolved.content).toBe('inline persona');
    expect(resolved.layer).toBe('project');
  });

  it('a runtime agent.json alone also blocks the builtin tier', () => {
    seedAgent(runtimeDir(), 'epsilon', { systemPrompt: 'runtime inline persona' });
    seedAgent(builtinDir, 'epsilon', { prompt: 'builtin body that must NOT be reached' });

    const resolved = resolvePrompt('epsilon', root);

    expect(resolved.source).toBe('system-prompt');
    expect(resolved.content).toBe('runtime inline persona');
    expect(resolved.layer).toBe('runtime');
  });

  it('the degraded tier honors the SAME layer precedence: project systemPrompt beats runtime', () => {
    seedAgent(projectDir(), 'zeta', { systemPrompt: 'project inline' });
    seedAgent(runtimeDir(), 'zeta', { systemPrompt: 'runtime inline' });

    const resolved = resolvePrompt('zeta', root);

    expect(resolved.content).toBe('project inline');
    expect(resolved.layer).toBe('project');
    expect(resolved.resolvedFrom).toBe(join(projectDir(), 'zeta', 'agent.json'));
  });

  it('a PROMPT.md in ANY layer outranks an inline systemPrompt in the project layer', () => {
    seedAgent(projectDir(), 'eta', { systemPrompt: 'inline persona' });
    seedAgent(runtimeDir(), 'eta', { prompt: 'runtime file persona' });

    const resolved = resolvePrompt('eta', root);

    expect(resolved.source).toBe('prompt-md');
    expect(resolved.content).toBe('runtime file persona');
    expect(resolved.degraded).toBe(false);
  });

  it('a whitespace-only PROMPT.md is not a hit — resolution falls through to the next layer', () => {
    seedAgent(projectDir(), 'theta', { prompt: '   \n\t\n' });
    seedAgent(runtimeDir(), 'theta', { prompt: 'runtime body' });

    const resolved = resolvePrompt('theta', root);

    expect(resolved.content).toBe('runtime body');
    expect(resolved.layer).toBe('runtime');
  });

  it('the builtin tier stays gated on an initialized project (no .deckent/config.json → no leak)', () => {
    const bareRoot = mkdtempSync(join(tmpdir(), 'deckent-prompt-s3-bare-'));
    try {
      seedAgent(builtinDir, 'iota', { prompt: 'builtin body' });

      const resolved = resolvePrompt('iota', bareRoot);

      expect(resolved.source).toBe('none');
      expect(resolved.layer).toBeNull();
    } finally {
      rmSync(bareRoot, { recursive: true, force: true });
    }
  });
});

describe('resolvePrompt — degraded classification (D4 alignment)', () => {
  it('classifies a systemPrompt fallback as degraded but NOT a routability blocker', () => {
    seedAgent(projectDir(), 'kappa', { systemPrompt: 'inline persona' });

    const resolved = resolvePrompt('kappa', root);

    expect(resolved).toEqual({
      content: 'inline persona',
      source: 'system-prompt',
      degraded: true,
      resolvedFrom: join(projectDir(), 'kappa', 'agent.json'),
      availability: 'system-prompt',
      layer: 'project',
      // D4: a present-but-degraded persona still routes; only 'none' blocks.
      blocker: null,
      // 524-012: the resolver now carries the declared/actual digest pair.
      declaredDigest: null,
      actualDigest: `sha256:${createHash('sha256').update('inline persona', 'utf8').digest('hex')}`,
    } satisfies ResolvedAgentPrompt);
  });

  it('emits the degraded warning exactly once per resolution', () => {
    seedAgent(projectDir(), 'lambda', { systemPrompt: 'inline persona' });

    resolvePrompt('lambda', root);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('PROMPT.md missing');
  });

  it('does not warn when a PROMPT.md resolves in any layer', () => {
    seedAgent(projectDir(), 'mu', { prompt: 'file persona', systemPrompt: 'inline persona' });

    const resolved = resolvePrompt('mu', root);

    expect(resolved.availability).toBe('prompt-file');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('agrees with classifyAgentManifest (S1) on the availability facet for both prompt states', () => {
    seedAgent(projectDir(), 'nu-file', { prompt: 'file persona', systemPrompt: 'inline' });
    seedAgent(projectDir(), 'nu-inline', { systemPrompt: 'inline' });

    const manifestOf = (id: string, hasPromptFile: boolean) => classifyAgentManifest({
      directoryName: id,
      resolvedFrom: join(projectDir(), id, 'agent.json'),
      layer: 'project',
      manifest: { ok: true, value: { id, name: id, systemPrompt: 'inline', manifestVersion: 2, source: 'user' } },
      hasPromptFile,
    });

    expect(resolvePrompt('nu-file', root).availability).toBe(manifestOf('nu-file', true).prompt);
    expect(resolvePrompt('nu-inline', root).availability).toBe(manifestOf('nu-inline', false).prompt);
  });
});

describe('resolvePrompt — absent prompt', () => {
  it('returns the typed unresolvable record when no layer holds a persona', () => {
    const resolved = resolvePrompt('nowhere-to-be-found', root);

    expect(resolved).toEqual({
      content: '',
      source: 'none',
      degraded: true,
      availability: 'none',
      layer: null,
      blocker: 'prompt-unresolvable',
      // 524-012: no persona → no digests, and never a fabricated pair.
      declaredDigest: null,
      actualDigest: null,
    } satisfies ResolvedAgentPrompt);
    expect(resolved.resolvedFrom).toBeUndefined();
  });

  it('an agent.json with an empty systemPrompt and no PROMPT.md is unresolvable, not empty-degraded', () => {
    seedAgent(projectDir(), 'xi', { systemPrompt: '   ' });

    const resolved = resolvePrompt('xi', root);

    expect(resolved.source).toBe('none');
    expect(resolved.blocker).toBe('prompt-unresolvable');
    // The blocker matches the reason S1's classifier emits for the same state.
    const classified = classifyAgentManifest({
      directoryName: 'xi',
      resolvedFrom: join(projectDir(), 'xi', 'agent.json'),
      layer: 'project',
      manifest: { ok: true, value: { id: 'xi', name: 'xi', systemPrompt: '   ', manifestVersion: 2, source: 'user' } },
      hasPromptFile: false,
    });
    expect(classified.routable.reasons).toContain(resolved.blocker);
  });
});

describe('one resolution path — every entrypoint delegates to resolvePrompt', () => {
  const SCENARIOS: ReadonlyArray<{ name: string; id: string; seed: () => void }> = [
    {
      name: 'project PROMPT.md',
      id: 'omicron',
      seed: () => seedAgent(projectDir(), 'omicron', { prompt: 'project body' }),
    },
    {
      name: 'runtime PROMPT.md',
      id: 'pi',
      seed: () => seedAgent(runtimeDir(), 'pi', { prompt: 'runtime body' }),
    },
    {
      name: 'builtin PROMPT.md',
      id: 'rho',
      seed: () => seedAgent(builtinDir, 'rho', { prompt: 'builtin body' }),
    },
    {
      name: 'degraded systemPrompt',
      id: 'sigma',
      seed: () => seedAgent(projectDir(), 'sigma', { systemPrompt: 'inline persona' }),
    },
    {
      name: 'unresolvable',
      id: 'tau',
      seed: () => undefined,
    },
  ];

  for (const scenario of SCENARIOS) {
    it(`getAgentPrompt() is a byte-identical projection of resolvePrompt() — ${scenario.name}`, () => {
      scenario.seed();

      const resolved = resolvePrompt(scenario.id, root);
      const legacy = getAgentPrompt(scenario.id, root);

      const expected: Record<string, unknown> = {
        content: resolved.content,
        source: resolved.source,
        degraded: resolved.degraded,
      };
      if (resolved.resolvedFrom !== undefined) expected['resolvedFrom'] = resolved.resolvedFrom;

      expect(legacy).toEqual(expected);
      // The richer S3 facets must not leak into the shape existing consumers serialize.
      expect(Object.keys(legacy).sort()).toEqual(Object.keys(expected).sort());
    });

    it(`AgentPoolManager.resolvePrompt() returns the same record — ${scenario.name}`, () => {
      scenario.seed();

      const viaPool = new AgentPoolManager(root).resolvePrompt(scenario.id);

      expect(viaPool).toEqual(resolvePrompt(scenario.id, root));
    });
  }

  it('pool synthesis and prompt resolution read the same builtin PROMPT.md bytes', () => {
    // Both callers of the module's single prompt-content read: _loadBuiltinFallback's
    // manifest-less synthesis (title/lead) and the resolver's builtin tier (content).
    const body = '# Upsilon Agent\n\nThe lead paragraph.\n\n## Detail\nbody\n';
    seedAgent(builtinDir, 'upsilon', { prompt: body });

    const pool = new AgentPoolManager(root).loadAgents();
    const resolved = resolvePrompt('upsilon', root);

    expect(pool.get('upsilon')?.name).toBe('Upsilon');
    expect(pool.get('upsilon')?.description).toBe('The lead paragraph.');
    expect(resolved.content).toBe(body);
    expect(resolved.source).toBe('prompt-md-builtin');
  });
});
