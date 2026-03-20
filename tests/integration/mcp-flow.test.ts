/**
 * Integration Test: MCP Flow (init → set_directives → doctor)
 *
 * Tests the complete MCP workflow:
 * 1. Create temp project directory
 * 2. Call init tool → verify config created
 * 3. Call set_directives tool → verify DIRECTIVES.md
 * 4. Call doctor tool → verify response format with _enriched meta
 * 5. Verify resource access and tool chain
 *
 * Mocks: tmux, child_process, auditor, worker, doc updates
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  DECKENT_DIR, BRAIN_DIR, TASKS_DIR, LOCKS_DIR, DIRECTIVES_FILE,
  MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE, RETRO_FILE, SPRINTS_DIR,
} from '../../src/core/constants.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  isSessionActive: vi.fn().mockReturnValue(false),
  sendKeys: vi.fn(),
  TmuxError: class extends Error { constructor(m: string) { super(m); } },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  }),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  releaseAllLocks: vi.fn(),
  updateTaskStatus: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  writeResult: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
  countBrainLines: vi.fn().mockReturnValue(50),
  readJsonSafe: vi.fn((path: string) => {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn(() => ({
    checks: [
      { ok: true, name: 'Node.js' },
      { ok: true, name: 'git' },
      { ok: true, name: 'tmux' },
      { ok: true, name: 'Workspace' },
    ],
  })),
}));

// ─── Helper Types ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

// Helper to run tools with a specific working directory
async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

// ─── Test Helpers ────────────────────────────────────────────────────

function setupMockProject(root: string): void {
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, SPRINTS_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, LOCKS_DIR), { recursive: true });
  mkdirSync(join(root, '.claude'), { recursive: true });

  // Create brain files
  writeFileSync(join(root, BRAIN_DIR, MEMORY_FILE), '# Memory\n');
  writeFileSync(join(root, BRAIN_DIR, DECISIONS_FILE), '# Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, DEBT_FILE), '# Tech Debt\n');
  writeFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), '[]');
  writeFileSync(join(root, BRAIN_DIR, RETRO_FILE), '# Retro\n');
}

async function registerToolsAndGetHandlers(root: string): Promise<{
  init: ToolHandler;
  directives: ToolHandler;
  doctor: ToolHandler;
}> {
  // Mock process.cwd() to return the test root
  const originalCwd = process.cwd;
  vi.stubGlobal('process', { ...process, cwd: () => root });

  const { registerInitTool } = await import('../../src/mcp/tools/init.js');
  const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
  const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');

  const server = createMockServer();

  registerInitTool(server as unknown as McpServer);
  registerSetDirectivesTool(server as unknown as McpServer);
  registerDoctorTool(server as unknown as McpServer);

  const initTool = server.tools.get('deckent_init');
  const directivesTool = server.tools.get('deckent_set_directives');
  const doctorTool = server.tools.get('deckent_doctor');

  expect(initTool).toBeDefined();
  expect(directivesTool).toBeDefined();
  expect(doctorTool).toBeDefined();

  vi.unstubGlobal('process');

  return {
    init: initTool!.handler,
    directives: directivesTool!.handler,
    doctor: doctorTool!.handler,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

let tempDir: string;

describe('Integration: MCP Flow (init → set_directives → doctor)', () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-mcp-flow-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: Init tool creates config ──────────────────────────────

  it('init tool creates .deckent/config.json with project metadata', async () => {
    const root = join(tempDir, 'proj-init-1');
    mkdirSync(root, { recursive: true });

    const { registerInitTool } = await import('../../src/mcp/tools/init.js');

    const result = await withCwd(root, async () => {
      const server = createMockServer();
      registerInitTool(server as unknown as McpServer);
      const tool = server.tools.get('deckent_init');
      expect(tool).toBeDefined();

      return tool!.handler({
        projectName: 'test-project-init',
        mode: 'max_plan',
        language: 'en',
      });
    });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.success).toBe(true);
    expect(parsed.projectName).toBe('test-project-init');
    expect(parsed.mode).toBe('max_plan');
    expect(parsed.language).toBe('en');
    expect(parsed.created).toBeInstanceOf(Array);
    expect(parsed.nextSteps).toBeInstanceOf(Array);
  });

  // ── Test 2: Init creates required directories ─────────────────────

  it('init tool creates all required directories', async () => {
    const root = join(tempDir, 'proj-init-dirs');
    mkdirSync(root, { recursive: true });

    const { registerInitTool } = await import('../../src/mcp/tools/init.js');

    await withCwd(root, async () => {
      const server = createMockServer();
      registerInitTool(server as unknown as McpServer);
      const tool = server.tools.get('deckent_init');

      return tool!.handler({
        projectName: 'test-dirs',
        mode: 'max_plan',
        language: 'en',
      });
    });

    // Verify directories exist
    expect(existsSync(join(root, DECKENT_DIR))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR))).toBe(true);
    expect(existsSync(join(root, TASKS_DIR))).toBe(true);
    expect(existsSync(join(root, LOCKS_DIR))).toBe(true);
  });

  // ── Test 3: set_directives tool writes DIRECTIVES.md ──────────────

  it('set_directives tool writes DIRECTIVES.md and returns task breakdown', async () => {
    const root = join(tempDir, 'proj-directives-1');
    mkdirSync(root, { recursive: true });
    setupMockProject(root);

    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');

    const directivesContent = `# DIRECTIVES

## Görev 1: Feature Implementation
- Dosya: src/feature.ts
- Kapsam: src/

### Açıklama
Implement new feature.

### Test
- Works correctly

## Görev 2: Bug Fix
- Dosya: src/bug.ts
- Kapsam: src/

### Açıklama
Fix critical bug.

### Test
- Fixed
`;

    const result = await withCwd(root, async () => {
      const server = createMockServer();
      registerSetDirectivesTool(server as unknown as McpServer);
      const tool = server.tools.get('deckent_set_directives');

      return tool!.handler({
        content: directivesContent,
      });
    });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.success).toBe(true);
    expect(parsed.taskCount).toBe(2);
    expect(parsed.breakdown).toBeDefined();
    expect(parsed.estimatedModels).toBeDefined();

    // Verify DIRECTIVES.md was written
    const dirPath = join(root, DIRECTIVES_FILE);
    expect(existsSync(dirPath)).toBe(true);
    const written = readFileSync(dirPath, 'utf-8');
    expect(written).toContain('Görev 1');
    expect(written).toContain('Görev 2');
  });

  // ── Test 4: doctor tool returns enriched response with _enriched meta ─

  it('doctor tool returns response with _enriched metadata', async () => {
    const root = join(tempDir, 'proj-doctor-1');
    mkdirSync(root, { recursive: true });
    setupMockProject(root);

    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');

    const result = await withCwd(root, async () => {
      const server = createMockServer();
      registerDoctorTool(server as unknown as McpServer);
      const tool = server.tools.get('deckent_doctor');

      return tool!.handler({
        includeProfile: false,
      });
    });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed._enriched).toBeDefined();
    expect(parsed._enriched.summary).toBeDefined();
    expect(parsed._enriched.hints).toBeInstanceOf(Array);
    expect(parsed._enriched.timestamp).toBeDefined();
  });

  // ── Test 5: doctor tool with includeProfile ──────────────────────

  it('doctor tool with includeProfile includes system profile', async () => {
    const root = join(tempDir, 'proj-doctor-profile');
    mkdirSync(root, { recursive: true });
    setupMockProject(root);

    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');

    const result = await withCwd(root, async () => {
      const server = createMockServer();
      registerDoctorTool(server as unknown as McpServer);
      const tool = server.tools.get('deckent_doctor');

      return tool!.handler({
        includeProfile: true,
      });
    });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed._enriched).toBeDefined();
    expect(parsed.healthScore).toBeDefined();
    expect(typeof parsed.healthScore).toBe('number');
    expect(parsed.recommendations).toBeInstanceOf(Array);
  });

  // ── Test 6: MCP flow chain (init → directives → doctor) ──────────

  it('complete MCP flow chain: init → set_directives → doctor', async () => {
    const root = join(tempDir, 'proj-complete-flow');
    mkdirSync(root, { recursive: true });

    const { registerInitTool } = await import('../../src/mcp/tools/init.js');
    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');

    await withCwd(root, async () => {
      const server = createMockServer();
      registerInitTool(server as unknown as McpServer);
      registerSetDirectivesTool(server as unknown as McpServer);
      registerDoctorTool(server as unknown as McpServer);

      const initTool = server.tools.get('deckent_init')!;
      const directivesTool = server.tools.get('deckent_set_directives')!;
      const doctorTool = server.tools.get('deckent_doctor')!;

      // Step 1: Initialize project
      const initResult = await initTool.handler({
        projectName: 'mcp-flow-test',
        mode: 'max_plan',
        language: 'en',
      });
      const initParsed = JSON.parse(initResult.content[0]!.text);
      expect(initParsed.success).toBe(true);

      // Verify init created necessary files
      expect(existsSync(join(root, DECKENT_DIR))).toBe(true);
      expect(existsSync(join(root, BRAIN_DIR))).toBe(true);

      // Step 2: Set directives
      const directivesResult = await directivesTool.handler({
        content: `# DIRECTIVES

## Görev 1: Integration Test
- Kapsam: tests/

### Açıklama
Test MCP flow integration.

### Test
- Passed
`,
      });
      const directivesParsed = JSON.parse(directivesResult.content[0]!.text);
      expect(directivesParsed.success).toBe(true);
      expect(directivesParsed.taskCount).toBeGreaterThan(0);

      // Verify DIRECTIVES.md was created
      expect(existsSync(join(root, DIRECTIVES_FILE))).toBe(true);

      // Step 3: Run doctor
      const doctorResult = await doctorTool.handler({
        includeProfile: false,
      });
      const doctorParsed = JSON.parse(doctorResult.content[0]!.text);
      expect(doctorParsed._enriched).toBeDefined();
      expect(doctorParsed.checks).toBeInstanceOf(Array);
    });
  });

  // ── Test 7: set_directives computes model distribution ────────────

  it('set_directives correctly computes estimated model distribution', async () => {
    const root = join(tempDir, 'proj-model-dist');
    mkdirSync(root, { recursive: true });
    setupMockProject(root);

    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');

    const directivesContent = `# DIRECTIVES

## Görev 1: Code Task
- Kapsam: src/

### Açıklama
Implement feature.

### Test
- Pass

## Görev 2: Code Task
- Kapsam: src/

### Açıklama
Fix bug.

### Test
- Pass

## Görev 3: Test Task
- Kapsam: tests/

### Açıklama
Write tests.

### Test
- Pass
`;

    const result = await withCwd(root, async () => {
      const server = createMockServer();
      registerSetDirectivesTool(server as unknown as McpServer);
      const tool = server.tools.get('deckent_set_directives')!;

      return tool.handler({
        content: directivesContent,
      });
    });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.estimatedModels).toBeDefined();
    expect(parsed.estimatedModels.opus).toBeGreaterThanOrEqual(0);
    expect(parsed.estimatedModels.sonnet).toBeGreaterThanOrEqual(0);
    expect(parsed.estimatedModels.haiku).toBeGreaterThanOrEqual(0);
  });
});
