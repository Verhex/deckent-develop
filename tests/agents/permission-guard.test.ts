import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionGuard } from '../../src/agents/permission-guard.js';
import type { PermissionGuardFS, ModificationAttempt } from '../../src/agents/permission-guard.js';

// ─── Mock FS ─────────────────────────────────────────────────────────────────

function createMockFS(): PermissionGuardFS {
  return {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(''),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAttempt(overrides: Partial<ModificationAttempt> = {}): ModificationAttempt {
  return {
    agentId: 'worker-001',
    agentRole: 'worker',
    targetPath: 'src/feature/index.ts',
    action: 'write',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PermissionGuard', () => {
  const projectRoot = '/test/project';

  describe('validateAgentModification', () => {
    // Rule 1: No self-modification
    it('blocks brain from modifying brain.ts', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentId: 'brain-main',
        agentRole: 'brain',
        targetPath: 'src/orchestra/brain.ts',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Self-modification blocked');
    });

    it('blocks auditor from modifying auditor.ts', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentId: 'auditor-main',
        agentRole: 'auditor',
        targetPath: 'src/monitor/auditor.ts',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Self-modification blocked');
    });

    it('blocks worker from modifying worker.ts', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentId: 'worker-001',
        agentRole: 'worker',
        targetPath: 'src/agents/worker.ts',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Self-modification blocked');
    });

    // Rule 2: No tool escalation
    it('blocks worker from modifying .claude/settings.json', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'worker',
        targetPath: '.claude/settings.json',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Tool escalation blocked');
    });

    it('blocks auditor from modifying .mcp/ configs', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'auditor',
        targetPath: '.mcp/config.json',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Tool escalation blocked');
    });

    it('allows brain to modify tool configs (brain is exempt)', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentId: 'brain-main',
        agentRole: 'brain',
        targetPath: '.claude/settings.json',
      }));
      expect(result.allowed).toBe(true);
    });

    // Rule 3: Only Brain can modify agent configs
    it('blocks worker from modifying .claude/rules/', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'worker',
        targetPath: '.claude/rules/worker-default.md',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('only Brain can modify');
    });

    it('blocks auditor from modifying .deckent/workspace/', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'auditor',
        targetPath: '.deckent/workspace/IDENTITY.md',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('only Brain can modify');
    });

    it('allows brain to modify agent configs', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentId: 'brain-main',
        agentRole: 'brain',
        targetPath: '.claude/rules/brain.md',
      }));
      // Brain can modify agent configs but NOT self-modify brain.ts
      // .claude/rules/brain.md is an agent config, not brain source
      expect(result.allowed).toBe(true);
    });

    // Rule 4: Auditor cannot write source code
    it('blocks auditor from writing to src/', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'auditor',
        targetPath: 'src/core/utils.ts',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Auditor source write blocked');
    });

    it('blocks auditor from writing to tests/', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'auditor',
        targetPath: 'tests/core/utils.test.ts',
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Auditor source write blocked');
    });

    // Allowed modifications
    it('allows worker to write within assigned scope', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'worker',
        targetPath: 'src/feature/my-code.ts',
      }));
      expect(result.allowed).toBe(true);
    });

    it('allows brain to write to .brain/', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentId: 'brain-main',
        agentRole: 'brain',
        targetPath: '.brain/MEMORY.md',
      }));
      expect(result.allowed).toBe(true);
    });

    it('allows auditor to write to .dashboard', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'auditor',
        targetPath: '.dashboard',
      }));
      expect(result.allowed).toBe(true);
    });

    // Absolute path normalization
    it('normalizes absolute paths to relative', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      const result = guard.validateAgentModification(makeAttempt({
        agentRole: 'auditor',
        targetPath: `${projectRoot}/src/core/utils.ts`,
      }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Auditor source write blocked');
    });
  });

  describe('logging', () => {
    it('logs blocked attempts', () => {
      const fs = createMockFS();
      const guard = new PermissionGuard(projectRoot, { fs });

      guard.validateAgentModification(makeAttempt({
        agentRole: 'worker',
        targetPath: 'src/agents/worker.ts',
      }));

      expect(fs.appendFileSync).toHaveBeenCalled();
    });

    it('does not log allowed attempts', () => {
      const fs = createMockFS();
      const guard = new PermissionGuard(projectRoot, { fs });

      guard.validateAgentModification(makeAttempt({
        agentRole: 'worker',
        targetPath: 'src/feature/code.ts',
      }));

      expect(fs.appendFileSync).not.toHaveBeenCalled();
    });

    it('creates log directory if needed', () => {
      const fs = createMockFS();
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const guard = new PermissionGuard(projectRoot, { fs });

      guard.validateAgentModification(makeAttempt({
        agentRole: 'worker',
        targetPath: 'src/agents/worker.ts',
      }));

      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('getLogPath', () => {
    it('returns default log path', () => {
      const guard = new PermissionGuard(projectRoot, { fs: createMockFS() });
      expect(guard.getLogPath()).toContain('permission-guard.log');
    });

    it('respects custom logDir', () => {
      const guard = new PermissionGuard(projectRoot, {
        logDir: '/custom/logs',
        fs: createMockFS(),
      });
      expect(guard.getLogPath()).toBe('/custom/logs/permission-guard.log');
    });
  });
});
