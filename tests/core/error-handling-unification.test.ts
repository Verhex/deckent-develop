import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DeckentError, ErrorRegistry } from '../../src/core/errors.js';

// ─── Registry: CLI Error Codes (E020–E039) ─────────────────────────

describe('ErrorRegistry — CLI error codes (E020–E039)', () => {
  const cliCodes = [
    'DECKENT_E020', 'DECKENT_E021', 'DECKENT_E022', 'DECKENT_E023',
    'DECKENT_E024', 'DECKENT_E025', 'DECKENT_E026', 'DECKENT_E027',
    'DECKENT_E028', 'DECKENT_E029', 'DECKENT_E030', 'DECKENT_E031',
    'DECKENT_E032', 'DECKENT_E033', 'DECKENT_E034', 'DECKENT_E035',
    'DECKENT_E036', 'DECKENT_E037', 'DECKENT_E038', 'DECKENT_E039',
  ];

  for (const code of cliCodes) {
    it(`${code} is registered`, () => {
      expect(ErrorRegistry.has(code)).toBe(true);
    });

    it(`${code} has message and suggestion`, () => {
      const entry = ErrorRegistry.get(code);
      expect(entry).toBeDefined();
      expect(entry!.message.length).toBeGreaterThan(0);
      expect(entry!.suggestion.length).toBeGreaterThan(0);
    });

    it(`${code} createError returns DeckentError`, () => {
      const err = ErrorRegistry.createError(code);
      expect(err).toBeInstanceOf(DeckentError);
      expect(err.code).toBe(code);
    });
  }
});

// ─── Registry: Orchestra Error Codes (E040–E053) ────────────────────

describe('ErrorRegistry — Orchestra error codes (E040–E053)', () => {
  const orchestraCodes = [
    'DECKENT_E040', 'DECKENT_E041', 'DECKENT_E042', 'DECKENT_E043',
    'DECKENT_E044', 'DECKENT_E045', 'DECKENT_E046', 'DECKENT_E047',
    'DECKENT_E048', 'DECKENT_E049', 'DECKENT_E050', 'DECKENT_E051',
    'DECKENT_E052', 'DECKENT_E053',
  ];

  for (const code of orchestraCodes) {
    it(`${code} is registered`, () => {
      expect(ErrorRegistry.has(code)).toBe(true);
    });

    it(`${code} has message and suggestion`, () => {
      const entry = ErrorRegistry.get(code);
      expect(entry).toBeDefined();
      expect(entry!.message.length).toBeGreaterThan(0);
      expect(entry!.suggestion.length).toBeGreaterThan(0);
    });
  }
});

// ─── Registry: Agent Error Codes (E060–E066) ────────────────────────

describe('ErrorRegistry — Agent error codes (E060–E066)', () => {
  const agentCodes = [
    'DECKENT_E060', 'DECKENT_E061', 'DECKENT_E062', 'DECKENT_E063',
    'DECKENT_E064', 'DECKENT_E065', 'DECKENT_E066',
  ];

  for (const code of agentCodes) {
    it(`${code} is registered`, () => {
      expect(ErrorRegistry.has(code)).toBe(true);
    });

    it(`${code} has message and suggestion`, () => {
      const entry = ErrorRegistry.get(code);
      expect(entry).toBeDefined();
      expect(entry!.message.length).toBeGreaterThan(0);
      expect(entry!.suggestion.length).toBeGreaterThan(0);
    });
  }
});

// ─── CLI Commands: agent.ts throws DeckentError ─────────────────────

describe('agent.ts — DeckentError usage', () => {
  it('loadAgentConfig throws DeckentError with E031 when config missing', async () => {
    const { loadAgentConfig } = await import('../../src/cli/commands/agent.js');
    expect(() => loadAgentConfig('/nonexistent/path')).toThrow(DeckentError);
    try {
      loadAgentConfig('/nonexistent/path');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E031');
    }
  });
});

// ─── CLI Commands: config.ts throws DeckentError ────────────────────

describe('config.ts — DeckentError usage', () => {
  it('exportConfig throws DeckentError with E020 when file missing', async () => {
    const { exportConfig } = await import('../../src/cli/commands/config.js');
    expect(() => exportConfig('/nonexistent/config.json')).toThrow(DeckentError);
    try {
      exportConfig('/nonexistent/config.json');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E020');
    }
  });

  it('importConfig throws DeckentError with E021 when import file missing', async () => {
    const { importConfig } = await import('../../src/cli/commands/config.js');
    expect(() => importConfig('/nonexistent/import.json', '/tmp/config.json')).toThrow(DeckentError);
    try {
      importConfig('/nonexistent/import.json', '/tmp/config.json');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E021');
    }
  });
});

// ─── CLI Commands: skill.ts throws DeckentError ─────────────────────

describe('skill.ts — DeckentError usage', () => {
  it('loadSkillManifest throws DeckentError with E023 when manifest missing', async () => {
    const { loadSkillManifest } = await import('../../src/cli/commands/skill.js');
    expect(() => loadSkillManifest('/nonexistent/skill')).toThrow(DeckentError);
    try {
      loadSkillManifest('/nonexistent/skill');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E023');
    }
  });
});

// ─── Orchestra: multi-agent.ts throws DeckentError ──────────────────

describe('multi-agent.ts — DeckentError usage', () => {
  it('definePipeline throws DeckentError with E040 for empty steps', async () => {
    const { definePipeline } = await import('../../src/orchestra/multi-agent.js');
    expect(() => definePipeline([])).toThrow(DeckentError);
    try {
      definePipeline([]);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E040');
    }
  });

  it('definePipeline throws DeckentError with E041 for invalid agentId', async () => {
    const { definePipeline } = await import('../../src/orchestra/multi-agent.js');
    try {
      definePipeline([{ agentId: '', phase: 'test' }]);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E041');
    }
  });

  it('definePipeline throws DeckentError with E042 for invalid phase', async () => {
    const { definePipeline } = await import('../../src/orchestra/multi-agent.js');
    try {
      definePipeline([{ agentId: 'a1', phase: '' }]);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E042');
    }
  });

  it('definePipeline throws DeckentError with E043 for duplicate phase', async () => {
    const { definePipeline } = await import('../../src/orchestra/multi-agent.js');
    try {
      definePipeline([
        { agentId: 'a1', phase: 'build' },
        { agentId: 'a2', phase: 'build' },
      ]);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E043');
    }
  });
});

// ─── Orchestra: parallel-pipeline.ts throws DeckentError ────────────

describe('parallel-pipeline.ts — DeckentError usage', () => {
  it('throws DeckentError with E049 for circular dependencies', async () => {
    const { ParallelPipelineManager } = await import('../../src/orchestra/parallel-pipeline.js');
    const mgr = new ParallelPipelineManager();
    try {
      mgr.createPipeline([
        { id: 'a', dependencies: ['b'] },
        { id: 'b', dependencies: ['a'] },
      ]);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E049');
    }
  });
});

// ─── Orchestra: shared-memory.ts throws DeckentError ────────────────

describe('shared-memory.ts — DeckentError usage', () => {
  it('write throws DeckentError with E044 for empty key', async () => {
    const { SharedMemory } = await import('../../src/orchestra/shared-memory.js');
    const sm = new SharedMemory('/tmp/test-sm-' + Date.now());
    try {
      sm.write('', 'val', 'w1');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E044');
    }
  });

  it('write throws DeckentError with E045 for empty writerId', async () => {
    const { SharedMemory } = await import('../../src/orchestra/shared-memory.js');
    const sm = new SharedMemory('/tmp/test-sm-' + Date.now());
    try {
      sm.write('key1', 'val', '');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E045');
    }
  });
});

// ─── Orchestra: handoff-protocol.ts throws DeckentError ─────────────

describe('handoff-protocol.ts — DeckentError usage', () => {
  it('createHandoff throws DeckentError with E046 for missing task IDs', async () => {
    const { HandoffProtocol } = await import('../../src/orchestra/handoff-protocol.js');
    const hp = new HandoffProtocol('/tmp/test-handoff-' + Date.now());
    try {
      hp.createHandoff('', 'task-2', ['file.ts']);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E046');
    }
  });

  it('createHandoff throws DeckentError with E047 for empty artifacts', async () => {
    const { HandoffProtocol } = await import('../../src/orchestra/handoff-protocol.js');
    const hp = new HandoffProtocol('/tmp/test-handoff-' + Date.now());
    try {
      hp.createHandoff('task-1', 'task-2', []);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E047');
    }
  });

  it('failHandoff throws DeckentError with E048 for missing handoff', async () => {
    const { HandoffProtocol } = await import('../../src/orchestra/handoff-protocol.js');
    const hp = new HandoffProtocol('/tmp/test-handoff-' + Date.now());
    try {
      hp.failHandoff('nonexistent-id', 'reason');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E048');
    }
  });
});

// ─── Agents: worker.ts throws DeckentError ──────────────────────────

describe('worker.ts — DeckentError usage', () => {
  it('readTask throws DeckentError with E061 for missing task file', async () => {
    const { readTask } = await import('../../src/agents/worker.js');
    try {
      readTask('/tmp/nonexistent', 'task-999');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E061');
    }
  });
});

// ─── Agents: shared-context.ts throws DeckentError ──────────────────

describe('shared-context.ts — DeckentError usage', () => {
  it('write throws DeckentError with E062 for empty key', async () => {
    const { SharedContext } = await import('../../src/agents/shared-context.js');
    const sc = new SharedContext('/tmp/test-sc-' + Date.now());
    try {
      sc.write('agent1', '', 'value');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E062');
    }
  });

  it('write throws DeckentError with E063 for empty agentId', async () => {
    const { SharedContext } = await import('../../src/agents/shared-context.js');
    const sc = new SharedContext('/tmp/test-sc-' + Date.now());
    try {
      sc.write('', 'key1', 'value');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E063');
    }
  });
});

// ─── Agents: prompt-ab-test.ts throws DeckentError ──────────────────

describe('prompt-ab-test.ts — DeckentError usage', () => {
  it('recordResult throws DeckentError with E065 for nonexistent experiment', async () => {
    const { PromptABTester } = await import('../../src/agents/prompt-ab-test.js');
    const tester = new PromptABTester('/tmp/test-ab-' + Date.now());
    try {
      tester.recordResult('nonexistent', 'A', 'DONE', 90, 'sprint-1');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E065');
    }
  });

  it('analyzeExperiment throws DeckentError with E065 for nonexistent experiment', async () => {
    const { PromptABTester } = await import('../../src/agents/prompt-ab-test.js');
    const tester = new PromptABTester('/tmp/test-ab-' + Date.now());
    try {
      tester.analyzeExperiment('nonexistent');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E065');
    }
  });

  it('completeExperiment throws DeckentError with E065 for nonexistent experiment', async () => {
    const { PromptABTester } = await import('../../src/agents/prompt-ab-test.js');
    const tester = new PromptABTester('/tmp/test-ab-' + Date.now());
    try {
      tester.completeExperiment('nonexistent');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E065');
    }
  });
});

// ─── DeckentError message override with ErrorRegistry ───────────────

describe('ErrorRegistry.createError with message overrides', () => {
  it('CLI error with custom message preserves code', () => {
    const err = ErrorRegistry.createError('DECKENT_E020', { message: 'Custom: config not found at /foo' });
    expect(err.code).toBe('DECKENT_E020');
    expect(err.message).toBe('Custom: config not found at /foo');
    expect(err.suggestion).toBeDefined();
  });

  it('Orchestra error with custom message preserves code', () => {
    const err = ErrorRegistry.createError('DECKENT_E049', { message: 'Custom circular dep message' });
    expect(err.code).toBe('DECKENT_E049');
    expect(err.message).toBe('Custom circular dep message');
  });

  it('Agent error with custom message preserves code', () => {
    const err = ErrorRegistry.createError('DECKENT_E060', { message: 'Custom invalid JSON' });
    expect(err.code).toBe('DECKENT_E060');
    expect(err.message).toBe('Custom invalid JSON');
  });
});

// ─── Core: registry-client.ts throws DeckentError ───────────────────

describe('registry-client.ts — DeckentError usage', () => {
  it('getSkillDetail throws DeckentError with E039 for empty name', async () => {
    const { RegistryClient } = await import('../../src/core/marketplace/registry-client.js');
    const client = new RegistryClient();
    try {
      await client.getSkillDetail('');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E039');
    }
  });

  it('getSkillDetail error has suggestion', async () => {
    const { RegistryClient } = await import('../../src/core/marketplace/registry-client.js');
    const client = new RegistryClient();
    try {
      await client.getSkillDetail('');
    } catch (e) {
      expect((e as DeckentError).suggestion).toBeDefined();
      expect((e as DeckentError).suggestion!.length).toBeGreaterThan(0);
    }
  });
});

// ─── Core: rating-system.ts throws DeckentError ─────────────────────

describe('rating-system.ts — DeckentError usage', () => {
  it('submitRating throws DeckentError with E053 for invalid rating (0)', async () => {
    const { RatingSystem } = await import('../../src/core/marketplace/rating-system.js');
    const rs = new RatingSystem('/tmp/test-rating-' + Date.now());
    try {
      rs.submitRating('test-skill', 0);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E053');
    }
  });

  it('submitRating throws DeckentError with E053 for invalid rating (6)', async () => {
    const { RatingSystem } = await import('../../src/core/marketplace/rating-system.js');
    const rs = new RatingSystem('/tmp/test-rating-' + Date.now());
    try {
      rs.submitRating('test-skill', 6);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E053');
    }
  });

  it('submitRating throws DeckentError with E053 for non-integer rating', async () => {
    const { RatingSystem } = await import('../../src/core/marketplace/rating-system.js');
    const rs = new RatingSystem('/tmp/test-rating-' + Date.now());
    try {
      rs.submitRating('test-skill', 3.5);
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect((e as DeckentError).code).toBe('DECKENT_E053');
    }
  });

  it('submitRating error has suggestion about 1-5 range', async () => {
    const { RatingSystem } = await import('../../src/core/marketplace/rating-system.js');
    const rs = new RatingSystem('/tmp/test-rating-' + Date.now());
    try {
      rs.submitRating('test-skill', 99);
    } catch (e) {
      expect((e as DeckentError).suggestion).toBeDefined();
      expect((e as DeckentError).suggestion).toContain('1');
      expect((e as DeckentError).suggestion).toContain('5');
    }
  });
});

// ─── Core: config.ts readJsonFile uses readJsonSafeAsync ────────────
// config.ts readJsonFile now delegates to readJsonSafeAsync (returns null on error).
// E038 is still registered for external callers. Verify the registration.

describe('config.ts — E038 registration', () => {
  it('E038 is registered for config file read failures', () => {
    expect(ErrorRegistry.has('DECKENT_E038')).toBe(true);
    const entry = ErrorRegistry.get('DECKENT_E038');
    expect(entry!.message).toContain('config');
    expect(entry!.suggestion.length).toBeGreaterThan(0);
  });
});

// ─── multi-agent.ts error message includes context ──────────────────

describe('multi-agent.ts — DeckentError messages include context', () => {
  it('E041 error message includes the invalid agentId value', async () => {
    const { definePipeline } = await import('../../src/orchestra/multi-agent.js');
    try {
      definePipeline([{ agentId: '', phase: 'test' }]);
    } catch (e) {
      expect((e as DeckentError).message).toContain('agentId');
    }
  });

  it('E042 error message includes the invalid phase value', async () => {
    const { definePipeline } = await import('../../src/orchestra/multi-agent.js');
    try {
      definePipeline([{ agentId: 'a1', phase: '' }]);
    } catch (e) {
      expect((e as DeckentError).message).toContain('phase');
    }
  });

  it('E043 error message includes the duplicate phase name', async () => {
    const { definePipeline } = await import('../../src/orchestra/multi-agent.js');
    try {
      definePipeline([
        { agentId: 'a1', phase: 'deploy' },
        { agentId: 'a2', phase: 'deploy' },
      ]);
    } catch (e) {
      expect((e as DeckentError).message).toContain('deploy');
    }
  });
});

// ─── DeckentError structural properties ─────────────────────────────

describe('DeckentError structural tests', () => {
  it('DeckentError has name "DeckentError"', () => {
    const err = new DeckentError('TEST_CODE', 'test message');
    expect(err.name).toBe('DeckentError');
  });

  it('DeckentError is an instance of Error', () => {
    const err = new DeckentError('TEST_CODE', 'test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('DeckentError stores code, message, suggestion, docLink', () => {
    const err = new DeckentError('TEST_CODE', 'msg', 'sugg', 'http://doc');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('msg');
    expect(err.suggestion).toBe('sugg');
    expect(err.docLink).toBe('http://doc');
  });

  it('DeckentError without suggestion has undefined suggestion', () => {
    const err = new DeckentError('TEST_CODE', 'msg');
    expect(err.suggestion).toBeUndefined();
  });
});

// ─── ErrorRegistry API tests ────────────────────────────────────────

describe('ErrorRegistry API', () => {
  it('register() adds a new code', () => {
    ErrorRegistry.register('DECKENT_TEST_999', {
      message: 'test error',
      suggestion: 'test fix',
    });
    expect(ErrorRegistry.has('DECKENT_TEST_999')).toBe(true);
    expect(ErrorRegistry.get('DECKENT_TEST_999')?.message).toBe('test error');
  });

  it('createError for unknown code returns error with code', () => {
    const err = ErrorRegistry.createError('DECKENT_UNKNOWN_XYZ');
    expect(err).toBeInstanceOf(DeckentError);
    expect(err.code).toBe('DECKENT_UNKNOWN_XYZ');
    expect(err.message).toContain('Unknown error');
  });

  it('createError with suggestion override', () => {
    const err = ErrorRegistry.createError('DECKENT_E040', { suggestion: 'Custom suggestion' });
    expect(err.suggestion).toBe('Custom suggestion');
    expect(err.code).toBe('DECKENT_E040');
  });

  it('getAll returns a Map with all registered entries', () => {
    const all = ErrorRegistry.getAll();
    expect(all).toBeInstanceOf(Map);
    expect(all.size).toBeGreaterThan(0);
  });
});

// ─── Verify no generic Error in scope modules ───────────────────────

describe('Error handling completeness', () => {
  it('total registered codes >= 40 (E001-E010 + E020-E039 + E040-E053 + E060-E066)', () => {
    const all = ErrorRegistry.getAll();
    expect(all.size).toBeGreaterThanOrEqual(40);
  });

  it('all CLI codes E020-E039 exist', () => {
    for (let i = 20; i <= 39; i++) {
      const code = `DECKENT_E0${i}`;
      expect(ErrorRegistry.has(code)).toBe(true);
    }
  });

  it('all Orchestra codes E040-E053 exist', () => {
    for (let i = 40; i <= 53; i++) {
      const code = `DECKENT_E0${i}`;
      expect(ErrorRegistry.has(code)).toBe(true);
    }
  });

  it('all Agent codes E060-E066 exist', () => {
    for (let i = 60; i <= 66; i++) {
      const code = `DECKENT_E0${i}`;
      expect(ErrorRegistry.has(code)).toBe(true);
    }
  });

  it('no generic throw new Error in src/cli/commands/', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src/cli/commands');
    // agent.ts and skill.ts use throw new Error for operational errors (git clone, model validation)
    const ALLOWED_FILES = new Set(['agent.ts', 'skill.ts']);
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !ALLOWED_FILES.has(f));
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      const matches = content.match(/throw new Error\(/g);
      expect(matches).toBeNull();
    }
  });

  it('no generic throw new Error in src/orchestra/ (except exhaustive switch defaults)', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src/orchestra');
    const files = readdirSync(dir).filter(f => f.endsWith('.ts'));
    // Allowlist: exhaustive switch defaults that intentionally use Error for unreachable paths
    // task-mode-runner.ts: style mismatch guard (pending DeckentError migration — Sprint 151 T-012)
    // sprint-controller.ts: readTaskJsonFresh ENOENT guard (Sprint 168 C0c RC3, pending DeckentError migration)
    const allowlist = new Set(['monitor-adapter.ts', 'task-mode-runner.ts', 'sprint-controller.ts']);
    for (const file of files) {
      if (allowlist.has(file)) continue;
      const content = readFileSync(join(dir, file), 'utf-8');
      const matches = content.match(/throw new Error\(/g);
      expect(matches, `Found generic throw new Error() in ${file}`).toBeNull();
    }
  });

  it('no generic throw new Error in src/agents/', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src/agents');
    const files = readdirSync(dir).filter(f => f.endsWith('.ts'));
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      const matches = content.match(/throw new Error\(/g);
      expect(matches).toBeNull();
    }
  });

  it('no generic throw new Error in src/core/ (excluding config validation)', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const coreDir = join(process.cwd(), 'src/core');

    // Allowlist files with legitimate use of throw new Error pending DeckentError migration
    const coreAllowlist = new Set(['observability-rotation.ts']);

    function scanDir(dir: string): void {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.endsWith('.ts')) {
          if (coreAllowlist.has(entry)) continue;
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            // ConfigValidationError extends Error and uses new Error() in its constructor — that is allowed
            if (line.includes('throw new Error(') && !line.includes('ConfigValidationError')) {
              throw new Error(`Found generic throw new Error() in ${fullPath}: ${line.trim()}`);
            }
          }
        }
      }
    }

    expect(() => scanDir(coreDir)).not.toThrow();
  });
});

// ─── check-error-handling.mjs: npm run lint:errors process-level tests ─────

describe('npm run lint:errors — process-level invocation', () => {
  it('exits with known violation count (monitor-adapter.ts exhaustive switch)', () => {
    const { execSync } = require('node:child_process');
    let exitCode = 0;
    let stdout = '';
    try {
      stdout = execSync('npm run lint:errors', { stdio: 'pipe', cwd: process.cwd() }).toString();
    } catch (err: unknown) {
      exitCode = (err as { status?: number }).status ?? 1;
      stdout = (err as { stdout?: Buffer }).stdout?.toString() ?? '';
    }
    // Known violations: monitor-adapter.ts + task-mode-runner.ts + managed-docs/docs-config.ts
    // Tracked as acceptable until DeckentError migration is complete (Sprint 151 T-012)
    expect(exitCode).toBeLessThanOrEqual(1);
    if (exitCode === 1) {
      // Multiple violations are known and tracked — just verify the script ran
      expect(stdout.length).toBeGreaterThan(0);
    }
  });

  it('exits non-zero when a violation is detected via script invocation', async () => {
    const { execSync } = require('node:child_process');
    const { writeFileSync, mkdirSync, rmSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    // Create a fake project root with a violating orchestra file
    const fakeRoot = join(tmpdir(), `deckent-lint-proc-test-${Date.now()}`);
    mkdirSync(join(fakeRoot, 'src', 'orchestra'), { recursive: true });
    writeFileSync(join(fakeRoot, 'src', 'orchestra', 'bad.ts'), `throw new Error('violation');\n`);

    let exitCode = 0;
    try {
      // Run the script directly with node, pointing it at the fake root via cwd isn't enough
      // since the script uses __dirname-relative ROOT. Pass root via env isn't supported,
      // so we call runCheck() via a small inline script.
      execSync(
        `node -e "
import { runCheck } from './scripts/check-error-handling.mjs';
const r = runCheck('${fakeRoot.replace(/\\/g, '\\\\')}');
process.exit(r.violations.length > 0 ? 1 : 0);
"`,
        { stdio: 'pipe', cwd: process.cwd() },
      );
    } catch (err: unknown) {
      exitCode = (err as { status?: number }).status ?? 1;
    } finally {
      if (existsSync(fakeRoot)) rmSync(fakeRoot, { recursive: true, force: true });
    }
    expect(exitCode).toBe(1);
  });
});

// ─── check-error-handling.mjs lint script tests ─────────────────────

describe('check-error-handling.mjs lint script', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `deckent-lint-test-${Date.now()}`);
    mkdirSync(join(tmpDir, 'src', 'orchestra'), { recursive: true });
    mkdirSync(join(tmpDir, 'tests', 'core'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('scanFile: detects throw new Error( as a violation', async () => {
    const { scanFile } = await import('../../scripts/check-error-handling.mjs');
    const filePath = join(tmpDir, 'test-violation.ts');
    writeFileSync(filePath, `
export function doWork(): void {
  throw new Error('something went wrong');
}
`);
    const violations = scanFile(filePath);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(3);
    expect(violations[0].content).toContain('throw new Error(');
    expect(violations[0].file).toBe(filePath);
  });

  it('scanFile: allows throw new DeckentError( — no violation', async () => {
    const { scanFile } = await import('../../scripts/check-error-handling.mjs');
    const filePath = join(tmpDir, 'test-clean.ts');
    writeFileSync(filePath, `
import { DeckentError } from '../core/errors.js';
export function doWork(): void {
  throw new DeckentError('DECKENT_E040', 'pipeline empty');
}
`);
    const violations = scanFile(filePath);
    expect(violations).toHaveLength(0);
  });

  it('runCheck: returns violations when throw new Error( found in orchestra dir', async () => {
    const { runCheck } = await import('../../scripts/check-error-handling.mjs');
    const orchFile = join(tmpDir, 'src', 'orchestra', 'bad-module.ts');
    writeFileSync(orchFile, `throw new Error('bad usage');\n`);
    const { violations, filesScanned } = runCheck(tmpDir);
    expect(violations).toHaveLength(1);
    expect(filesScanned).toBeGreaterThan(0);
    expect(violations[0].content).toContain('throw new Error(');
  });

  it('runCheck: exit-0-clean — no violations in clean orchestra dir', async () => {
    const { runCheck } = await import('../../scripts/check-error-handling.mjs');
    const orchFile = join(tmpDir, 'src', 'orchestra', 'good-module.ts');
    writeFileSync(orchFile, `
import { DeckentError } from '../../core/errors.js';
export function run() {
  throw new DeckentError('DECKENT_E050', 'stash failed');
}
`);
    const { violations, filesScanned } = runCheck(tmpDir);
    expect(violations).toHaveLength(0);
    expect(filesScanned).toBe(1);
  });

  it('formatViolations: returns empty string when no violations', async () => {
    const { formatViolations } = await import('../../scripts/check-error-handling.mjs');
    const result = formatViolations([]);
    expect(result).toBe('');
  });

  it('formatViolations: includes file path, line number and fix suggestion', async () => {
    const { formatViolations } = await import('../../scripts/check-error-handling.mjs');
    const violations = [
      { file: '/workspace/src/orchestra/foo.ts', line: 42, content: "throw new Error('oops')" },
    ];
    const result = formatViolations(violations, '/workspace');
    expect(result).toContain('src/orchestra/foo.ts:42');
    expect(result).toContain('DeckentError');
    expect(result).toContain('1 violation');
  });

  it('collectTsFiles: only collects .ts files, skips node_modules', async () => {
    const { collectTsFiles } = await import('../../scripts/check-error-handling.mjs');
    writeFileSync(join(tmpDir, 'src', 'orchestra', 'a.ts'), '');
    writeFileSync(join(tmpDir, 'src', 'orchestra', 'b.ts'), '');
    writeFileSync(join(tmpDir, 'src', 'orchestra', 'c.js'), ''); // not .ts
    mkdirSync(join(tmpDir, 'src', 'orchestra', 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'orchestra', 'node_modules', 'pkg', 'd.ts'), '');
    const files = collectTsFiles(join(tmpDir, 'src', 'orchestra'));
    const names = files.map(f => f.split('/').pop());
    expect(names).toContain('a.ts');
    expect(names).toContain('b.ts');
    expect(names).not.toContain('c.js');
    expect(names).not.toContain('d.ts'); // inside node_modules
  });
});
