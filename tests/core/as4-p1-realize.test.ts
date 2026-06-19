// ─── AS4-P1 Capability Realization Layer — hermetic tests ────────────────────
// Tests for capability-spec.ts (types) + capability-realizer.ts (function).
// All tests are hermetic: no disk I/O, no gitignored state, no spawnSync.
// Pre-loaded content is injected via SkillCapabilityEntry.content.

import { describe, it, expect } from 'vitest';
import type { CapabilitySpec } from '../../src/core/capability-spec.js';
import {
  realizeCapabilities,
  type RealizedCapabilities,
} from '../../src/orchestra/capability-realizer.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function expectExtraArgs(result: RealizedCapabilities): string[] {
  return [...result.extraArgs];
}

// ─── Empty spec ───────────────────────────────────────────────────────────────

describe('realizeCapabilities — empty spec', () => {
  it('returns empty extraArgs for an empty spec object', () => {
    const result = realizeCapabilities({}, 'claude');
    expect(result.extraArgs).toHaveLength(0);
    expect(result.textFallback).toBeUndefined();
    expect(result.provider).toBe('claude');
  });

  it('returns empty extraArgs when all arrays are empty', () => {
    const spec: CapabilitySpec = { skills: [], subagents: [], mcp: [] };
    const result = realizeCapabilities(spec, 'ollama');
    expect(result.extraArgs).toHaveLength(0);
    expect(result.textFallback).toBeUndefined();
  });
});

// ─── Claude path — skills ─────────────────────────────────────────────────────

describe('realizeCapabilities — claude + skills', () => {
  it('single skill with content → --append-system-prompt <content>', () => {
    const spec: CapabilitySpec = {
      skills: [{ skillId: 'typescript-expert', content: 'Use strict TypeScript.' }],
    };
    const result = realizeCapabilities(spec, 'claude');
    expect(result.provider).toBe('claude');
    expect(expectExtraArgs(result)).toEqual([
      '--append-system-prompt', 'Use strict TypeScript.',
    ]);
    expect(result.textFallback).toBeUndefined();
  });

  it('multiple skills → two --append-system-prompt pairs in order', () => {
    const spec: CapabilitySpec = {
      skills: [
        { skillId: 'ts', content: 'TypeScript rules' },
        { skillId: 'react', content: 'React rules' },
      ],
    };
    const result = realizeCapabilities(spec, 'claude');
    expect(expectExtraArgs(result)).toEqual([
      '--append-system-prompt', 'TypeScript rules',
      '--append-system-prompt', 'React rules',
    ]);
  });

  it('skill without content and no projectRoot → placeholder arg', () => {
    const spec: CapabilitySpec = {
      skills: [{ skillId: 'missing-skill' }],
    };
    const result = realizeCapabilities(spec, 'claude');
    expect(result.extraArgs[0]).toBe('--append-system-prompt');
    expect(result.extraArgs[1]).toContain('missing-skill');
  });
});

// ─── Claude path — subagents ──────────────────────────────────────────────────

describe('realizeCapabilities — claude + subagents', () => {
  it('single subagent → --agents <agentId>', () => {
    const spec: CapabilitySpec = {
      subagents: [{ agentId: 'code-reviewer' }],
    };
    const result = realizeCapabilities(spec, 'claude');
    expect(expectExtraArgs(result)).toEqual(['--agents', 'code-reviewer']);
  });

  it('multiple subagents → multiple --agents pairs', () => {
    const spec: CapabilitySpec = {
      subagents: [
        { agentId: 'code-reviewer' },
        { agentId: 'security-auditor' },
      ],
    };
    const result = realizeCapabilities(spec, 'claude');
    expect(expectExtraArgs(result)).toEqual([
      '--agents', 'code-reviewer',
      '--agents', 'security-auditor',
    ]);
  });
});

// ─── Claude path — MCP ───────────────────────────────────────────────────────

describe('realizeCapabilities — claude + mcp', () => {
  it('mcp entry → --mcp-config <configPath>', () => {
    const spec: CapabilitySpec = {
      mcp: [{ serverName: 'github', configPath: '/tmp/mcp-github.json' }],
    };
    const result = realizeCapabilities(spec, 'claude');
    expect(expectExtraArgs(result)).toEqual(['--mcp-config', '/tmp/mcp-github.json']);
  });
});

// ─── Claude path — mixed spec ────────────────────────────────────────────────

describe('realizeCapabilities — claude + mixed spec', () => {
  it('skills before subagents before mcp in output', () => {
    const spec: CapabilitySpec = {
      skills: [{ skillId: 'ts', content: 'TS content' }],
      subagents: [{ agentId: 'reviewer' }],
      mcp: [{ serverName: 'srv', configPath: '/mcp.json' }],
    };
    const result = realizeCapabilities(spec, 'claude');
    expect(expectExtraArgs(result)).toEqual([
      '--append-system-prompt', 'TS content',
      '--agents', 'reviewer',
      '--mcp-config', '/mcp.json',
    ]);
  });
});

// ─── Non-claude path — text-fallback ─────────────────────────────────────────

describe('realizeCapabilities — ollama (text-fallback)', () => {
  it('skill with content → textFallback contains content and skillId, no extraArgs', () => {
    const spec: CapabilitySpec = {
      skills: [{ skillId: 'typescript-expert', content: 'Use strict TypeScript.' }],
    };
    const result = realizeCapabilities(spec, 'ollama');
    expect(result.provider).toBe('ollama');
    expect(result.extraArgs).toHaveLength(0);
    expect(result.textFallback).toBeDefined();
    expect(result.textFallback).toContain('typescript-expert');
    expect(result.textFallback).toContain('Use strict TypeScript.');
  });

  it('subagent → textFallback contains agentId', () => {
    const spec: CapabilitySpec = {
      subagents: [{ agentId: 'code-reviewer', description: 'Reviews diffs' }],
    };
    const result = realizeCapabilities(spec, 'ollama');
    expect(result.extraArgs).toHaveLength(0);
    expect(result.textFallback).toContain('code-reviewer');
    expect(result.textFallback).toContain('Reviews diffs');
  });

  it('mcp entry → textFallback contains serverName and configPath', () => {
    const spec: CapabilitySpec = {
      mcp: [{ serverName: 'github', configPath: '/tmp/mcp.json' }],
    };
    const result = realizeCapabilities(spec, 'ollama');
    expect(result.extraArgs).toHaveLength(0);
    expect(result.textFallback).toContain('github');
    expect(result.textFallback).toContain('/tmp/mcp.json');
  });
});

// ─── Non-claude path — codex / gemini ────────────────────────────────────────

describe('realizeCapabilities — codex + gemini (text-fallback)', () => {
  it('codex: skill → textFallback, no extraArgs', () => {
    const spec: CapabilitySpec = {
      skills: [{ skillId: 'ts', content: 'TypeScript rules' }],
    };
    const result = realizeCapabilities(spec, 'codex');
    expect(result.provider).toBe('codex');
    expect(result.extraArgs).toHaveLength(0);
    expect(result.textFallback).toBeDefined();
    expect(result.textFallback).toContain('TypeScript rules');
  });

  it('gemini: subagent → textFallback with agentId', () => {
    const spec: CapabilitySpec = {
      subagents: [{ agentId: 'code-reviewer' }],
    };
    const result = realizeCapabilities(spec, 'gemini');
    expect(result.extraArgs).toHaveLength(0);
    expect(result.textFallback).toContain('code-reviewer');
  });
});

// ─── Mapping assertions ───────────────────────────────────────────────────────

describe('realizeCapabilities — mapping invariants', () => {
  it('claude always produces extraArgs (no textFallback)', () => {
    const spec: CapabilitySpec = {
      skills: [{ skillId: 'ts', content: 'TS' }],
    };
    const result = realizeCapabilities(spec, 'claude');
    expect(result.textFallback).toBeUndefined();
    expect(result.extraArgs.length).toBeGreaterThan(0);
  });

  it('non-claude always produces textFallback (no extraArgs)', () => {
    for (const provider of ['codex', 'gemini', 'ollama', 'custom-llm']) {
      const spec: CapabilitySpec = {
        skills: [{ skillId: 'ts', content: 'TS' }],
      };
      const result = realizeCapabilities(spec, provider);
      expect(result.extraArgs).toHaveLength(0);
      expect(result.textFallback).toBeDefined();
    }
  });

  it('provider field is echoed back in the result', () => {
    const spec: CapabilitySpec = { skills: [{ skillId: 'ts', content: 'x' }] };
    expect(realizeCapabilities(spec, 'claude').provider).toBe('claude');
    expect(realizeCapabilities(spec, 'ollama').provider).toBe('ollama');
    expect(realizeCapabilities(spec, 'codex').provider).toBe('codex');
  });

  it('extraArgs is readonly (non-mutating)', () => {
    const spec: CapabilitySpec = {
      skills: [{ skillId: 'ts', content: 'TS rules' }],
    };
    const result = realizeCapabilities(spec, 'claude');
    // TypeScript ensures readonly; runtime spread proves it's an array
    const copy = [...result.extraArgs];
    expect(copy).toEqual(['--append-system-prompt', 'TS rules']);
  });
});
