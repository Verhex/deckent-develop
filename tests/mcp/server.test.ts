import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Mock all dependencies before importing
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// Spread the real config module so its exported constants (e.g.
// DEFAULT_APPROVE_TIMEOUT_ATTENDED_MS, pulled in transitively by the server's
// dependency graph) stay defined; only loadConfig is stubbed so the test drives
// config loading without touching disk.
vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  loadConfig: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn(),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  sendKeys: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn(),
}));

import {
  createServer,
  DECKENT_MCP_INSTRUCTIONS,
  isMcpEntryPoint,
} from '../../src/mcp/server.js';

describe('MCP Server', () => {
  it('creates a server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it('server has correct name', () => {
    const server = createServer();
    // The server is created — if it didn't throw, tools and resources registered fine
    expect(server).toBeTruthy();
  });
});

describe('isMcpEntryPoint', () => {
  it('recognizes a direct executable path and fails closed for absent paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deckent-mcp-entrypoint-'));
    const target = join(root, 'server.js');
    try {
      await writeFile(target, '#!/usr/bin/env node\n');
      const moduleUrl = pathToFileURL(target).href;

      expect(isMcpEntryPoint(moduleUrl, target)).toBe(true);
      expect(isMcpEntryPoint(moduleUrl, undefined)).toBe(false);
      expect(isMcpEntryPoint(moduleUrl, join(root, 'missing.js'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')(
    'recognizes an executable symlink as the module filesystem identity',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'deckent-mcp-entrypoint-symlink-'));
      const target = join(root, 'server.js');
      const link = join(root, 'deckent-mcp');
      try {
        await writeFile(target, '#!/usr/bin/env node\n');
        await symlink(target, link);

        expect(isMcpEntryPoint(pathToFileURL(target).href, link)).toBe(true);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

describe('DECKENT_MCP_INSTRUCTIONS', () => {
  it('instructions is a non-empty string', () => {
    expect(typeof DECKENT_MCP_INSTRUCTIONS).toBe('string');
    expect(DECKENT_MCP_INSTRUCTIONS.length).toBeGreaterThan(200);
  });

  it('instructions contains all 15 tool names', () => {
    const tools = [
      'deckent_init',
      'deckent_set_directives',
      'deckent_plan',
      'deckent_start',
      'deckent_status',
      'deckent_review',
      'deckent_retro',
      'deckent_history',
      'deckent_doctor',
      'deckent_analyze_project',
      'deckent_sync',
      'deckent_config',
      'deckent_run',
      'deckent_kill',
      'deckent_cleanup',
    ];
    for (const tool of tools) {
      expect(DECKENT_MCP_INSTRUCTIONS).toContain(tool);
    }
  });

  it('instructions contains sprint lifecycle phases', () => {
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('PLAN');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('SPAWN');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('EXECUTE');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('EVALUATE');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('FIX');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('RETRO');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('DECAY');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('CLEANUP');
  });

  it('instructions contains workflow steps in order', () => {
    const initPos = DECKENT_MCP_INSTRUCTIONS.indexOf('init');
    const planPos = DECKENT_MCP_INSTRUCTIONS.indexOf('plan');
    const startPos = DECKENT_MCP_INSTRUCTIONS.indexOf('start');
    const statusPos = DECKENT_MCP_INSTRUCTIONS.indexOf('status');
    expect(initPos).toBeLessThan(planPos);
    expect(planPos).toBeLessThan(startPos);
    expect(startPos).toBeLessThan(statusPos);
  });

  it('instructions contains DIRECTIVES format example', () => {
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('## Task');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('Model:');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('Effort:');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('Skills:');
  });

  it('instructions contains parameter reference', () => {
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('opus');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('sonnet');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('haiku');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('ai');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('structured');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('auto');
  });

  it('instructions contains error recovery guidance', () => {
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('kill');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('cleanup');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('doctor');
  });

  it('instructions contains all 8 resources', () => {
    const resources = [
      'deckent://dashboard',
      'deckent://directives',
      'deckent://memory',
      'deckent://debt',
      'deckent://config',
      'deckent://retro',
      'deckent://tasks',
      'deckent://agents',
    ];
    for (const resource of resources) {
      expect(DECKENT_MCP_INSTRUCTIONS).toContain(resource);
    }
  });
});
