/**
 * Sprint 301 AS2-P2 — mixed-fleet provider-switcher parity + non-leak (hermetic).
 *
 * Two independent concerns tested here:
 *
 * 1. REPL /provider parity — `runChatNativeLoop` (Path-C, chat-native.ts) now
 *    handles `/provider <name>` the same way the Ink REPL (app.tsx) does:
 *    - switchProvider callback is called with the provider name
 *    - bare `/provider` (no arg) emits the i18n usage hint
 *    - the provider adapter is NOT invoked (no round-trip to claude)
 *
 * 2. Mixed-fleet non-leak — two concurrent REPL sessions (ollama + claude) and
 *    a 2-worker sprint (ollama + claude mock) run in parallel; switching provider
 *    in one session does not affect the other (no cross-talk).
 *
 * Hermetic: tmpdir, async iterables, mock adapters — no real CLI spawn, no disk
 * state outside tmpdir, no spawnSync.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type ChatMessage,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import { spawnWorkers } from '../../src/orchestra/sprint-spawner.js';
import { providerRegistry } from '../../src/core/provider.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType, ProviderName } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';

// ─── REPL test helpers ──────────────────────────────────────────────────────

function makeFakeProvider(reply = 'ok'): ChatProviderAdapter {
  return {
    send: async (_messages: ChatMessage[]): Promise<ProviderResponse> => ({
      text: reply,
      stopReason: 'end_turn',
    }),
  };
}

function makeFakeDispatcher(): ChatNativeOptions['dispatcher'] {
  return { dispatch: async () => '' };
}

async function* inputLines(...lines: string[]): AsyncIterable<string> {
  for (const l of lines) yield l;
}

// ─── Sprint test helpers (mirrors mixed-fleet-spawn-routing.test.ts) ────────

interface SpawnRec { taskId: string; model: ModelType; }

function makeBackend(root: string): SpawnBackend & { calls: SpawnRec[] } {
  const calls: SpawnRec[] = [];
  return {
    name: 'mock-docker',
    liveUsageBudgetSupport: 'measured-stream' as const,
    executionLandingCapability: 'cooperative-landing' as const,
    spawn(taskId: string, model: ModelType) {
      calls.push({ taskId, model });
      writeFileSync(
        join(root, '.tasks', `task-${taskId}.result`),
        JSON.stringify({ taskId, selfAssessment: 'DONE', via: 'docker-backend' }),
        'utf-8',
      );
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

function makeOllamaAdapter(root: string): ProviderAdapter & { calls: SpawnRec[] } {
  const calls: SpawnRec[] = [];
  const adapter = {
    name: 'ollama' as ProviderName,
    liveUsageBudgetSupport: 'measured-stream' as const,
    executionCostClass: 'local' as const,
    buildCommand: () => 'ollama',
    isAvailable: () => Promise.resolve(true),
    spawn(taskId: string, model: ModelType) {
      calls.push({ taskId, model });
      writeFileSync(
        join(root, '.tasks', `task-${taskId}.result`),
        JSON.stringify({ taskId, selfAssessment: 'DONE', via: 'ollama-host-adapter' }),
        'utf-8',
      );
    },
    kill() { /* no-op */ },
    listWorkers() { return []; },
    refreshSupportedModels() { return Promise.resolve(); },
  } as unknown as ProviderAdapter & { calls: SpawnRec[] };
  Object.defineProperty(adapter, 'calls', { get: () => calls });
  return adapter;
}

function makeTask(id: string, provider: ProviderName, model: string, file: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `AS2-P2 mixed-fleet test ${id}`,
    model: model as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'as2-p2-mixed-fleet-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [file] },
    dependencies: [],
    goNogo: { goCriteria: 'n/a', noGoCriteria: 'n/a', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-301',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider,
    budget: { maxTurns: 1 },
    ...(provider === 'claude'
      ? {
        budgetPolicy: {
          state: 'allow' as const,
          role: 'worker' as const,
          resolvedProvider: provider,
          executionCostClass: 'remote' as const,
          profileRef: 'tests.orchestra.as2-p2-mixed-fleet',
          policyDigest: 'a'.repeat(64),
          admissionMode: 'unattended' as const,
          landingPolicy: { reserve_ratio: 0.25 },
        },
      }
      : {}),
  } as unknown as Task;
}

function makeConfig(): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: { max_workers: 8 },
    token_throttle_ms: 0,
  } as unknown as ResolvedConfig;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-301',
    number: 301,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AS2-P2 — mixed-fleet provider-switcher parity + non-leak', () => {

  // ─── Part 1: REPL /provider parity (runChatNativeLoop) ──────────────

  describe('REPL /provider parity — chat-native.ts', () => {
    it('calls switchProvider with the provider name when /provider <name> is typed', async () => {
      const switched: string[] = [];
      await runChatNativeLoop({
        provider: makeFakeProvider(),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('/provider codex'),
        output: () => {},
        maxTurns: 1,
        switchProvider: (name) => switched.push(name),
      });
      expect(switched).toEqual(['codex']);
    });

    it('calls switchProvider with trimmed provider name', async () => {
      const switched: string[] = [];
      await runChatNativeLoop({
        provider: makeFakeProvider(),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('/provider   ollama  '),
        output: () => {},
        maxTurns: 1,
        switchProvider: (name) => switched.push(name),
      });
      expect(switched).toEqual(['ollama']);
    });

    it('emits a confirmation message after /provider <name>', async () => {
      const lines: string[] = [];
      await runChatNativeLoop({
        provider: makeFakeProvider(),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('/provider gemini'),
        output: (l) => lines.push(l),
        maxTurns: 1,
        switchProvider: () => {},
      });
      const out = lines.join('\n');
      expect(out).toContain('gemini');
    });

    it('emits usage hint when /provider is bare (no arg)', async () => {
      const lines: string[] = [];
      await runChatNativeLoop({
        provider: makeFakeProvider(),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('/provider'),
        output: (l) => lines.push(l),
        maxTurns: 1,
      });
      const out = lines.join('\n');
      expect(out).toMatch(/\/provider/);
    });

    it('does not invoke the provider adapter for /provider switch (no LLM round-trip)', async () => {
      let sendCalled = false;
      const trackingProvider: ChatProviderAdapter = {
        send: async () => { sendCalled = true; return { text: 'ok', stopReason: 'end_turn' }; },
      };
      await runChatNativeLoop({
        provider: trackingProvider,
        dispatcher: makeFakeDispatcher(),
        input: inputLines('/provider ollama'),
        output: () => {},
        maxTurns: 1,
      });
      expect(sendCalled).toBe(false);
    });

    it('works without switchProvider option — backward compat (no crash)', async () => {
      const lines: string[] = [];
      await runChatNativeLoop({
        provider: makeFakeProvider(),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('/provider claude'),
        output: (l) => lines.push(l),
        maxTurns: 1,
        // switchProvider intentionally omitted
      });
      expect(lines.some(l => l.includes('claude'))).toBe(true);
    });
  });

  // ─── Part 2: REPL concurrent session non-leak ───────────────────────

  describe('concurrent REPL sessions — provider state non-leak', () => {
    it('switching provider in session-A does not affect session-B (no cross-talk)', async () => {
      const switchedA: string[] = [];
      const switchedB: string[] = [];

      const sessionA = runChatNativeLoop({
        provider: makeFakeProvider('reply-A'),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('/provider codex', 'hello'),
        output: () => {},
        maxTurns: 2,
        switchProvider: (name) => switchedA.push(name),
      });

      const sessionB = runChatNativeLoop({
        provider: makeFakeProvider('reply-B'),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('world'),
        output: () => {},
        maxTurns: 1,
        switchProvider: (name) => switchedB.push(name),
      });

      await Promise.all([sessionA, sessionB]);

      // A switched, B did not — no cross-talk
      expect(switchedA).toEqual(['codex']);
      expect(switchedB).toEqual([]);
    });

    it('each session accumulates its own transcript independently', async () => {
      const transcriptA: ChatMessage[] = [];
      const transcriptB: ChatMessage[] = [];

      const sessionA = runChatNativeLoop({
        provider: makeFakeProvider('response-A'),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('message for A'),
        output: () => {},
        maxTurns: 1,
      });

      const sessionB = runChatNativeLoop({
        provider: makeFakeProvider('response-B'),
        dispatcher: makeFakeDispatcher(),
        input: inputLines('message for B'),
        output: () => {},
        maxTurns: 1,
      });

      const [ta, tb] = await Promise.all([sessionA, sessionB]);
      transcriptA.push(...ta);
      transcriptB.push(...tb);

      const userA = transcriptA.filter(m => m.role === 'user').map(m => m.content);
      const userB = transcriptB.filter(m => m.role === 'user').map(m => m.content);
      expect(userA).toEqual(['message for A']);
      expect(userB).toEqual(['message for B']);
      // No cross-contamination between transcripts
      expect(transcriptA.some(m => m.content.includes('B'))).toBe(false);
      expect(transcriptB.some(m => m.content.includes('A'))).toBe(false);
    });
  });

  // ─── Part 3: mixed-fleet sprint non-leak (spawnWorkers) ─────────────

  describe('mixed-fleet 2-worker sprint — ollama + claude non-leak', () => {
    let root: string;
    let priorOllama: ProviderAdapter | null;
    let ollamaAdapter: ProviderAdapter & { calls: SpawnRec[] };

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'as2-p2-fleet-'));
      mkdirSync(join(root, '.tasks'), { recursive: true });
      mkdirSync(join(root, '.deckent'), { recursive: true });
      priorOllama = providerRegistry.hasProvider('ollama')
        ? providerRegistry.getProvider('ollama')
        : null;
      ollamaAdapter = makeOllamaAdapter(root);
      providerRegistry.registerProvider(ollamaAdapter);
    });

    afterEach(() => {
      if (priorOllama) providerRegistry.registerProvider(priorOllama);
      else providerRegistry.unregisterProvider('ollama');
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    });

    function persist(tasks: Task[]): void {
      for (const t of tasks) {
        writeFileSync(
          join(root, '.tasks', `task-${t.id}.json`),
          JSON.stringify(t, null, 2),
          'utf-8',
        );
      }
    }

    it('ollama task routed to host adapter, claude task routed to docker backend — no cross-routing', async () => {
      const ollamaTask = makeTask('AS2-OLL-1', 'ollama', 'qwen3.6:27b', 'src/ollama-out.ts');
      const claudeTask = makeTask('AS2-CLA-1', 'claude', 'claude-sonnet-5', 'src/claude-out.ts');
      persist([ollamaTask, claudeTask]);
      const backend = makeBackend(root);

      const origCwd = process.cwd();
      process.chdir(root);
      try {
        await spawnWorkers(root, makeSprint([ollamaTask, claudeTask]), makeConfig(), {
          spawnBackend: backend,
        });
      } finally {
        process.chdir(origCwd);
      }

      // ollama → host adapter only
      expect(ollamaAdapter.calls.map(c => c.taskId)).toContain('AS2-OLL-1');
      // claude → docker backend only
      expect(backend.calls.map(c => c.taskId)).toContain('AS2-CLA-1');
      // Anti-leak: docker backend must NOT receive the ollama task
      expect(backend.calls.some(c => c.taskId === 'AS2-OLL-1')).toBe(false);
      // Anti-leak: ollama adapter must NOT receive the claude task
      expect(ollamaAdapter.calls.some(c => c.taskId === 'AS2-CLA-1')).toBe(false);
    });

    it('both workers produce a .result on disk — parallel independent success', async () => {
      const ollamaTask = makeTask('AS2-OLL-2', 'ollama', 'qwen3.6:27b', 'src/o2.ts');
      const claudeTask = makeTask('AS2-CLA-2', 'claude', 'claude-sonnet-5', 'src/c2.ts');
      persist([ollamaTask, claudeTask]);
      const backend = makeBackend(root);

      const origCwd = process.cwd();
      process.chdir(root);
      try {
        await spawnWorkers(root, makeSprint([ollamaTask, claudeTask]), makeConfig(), {
          spawnBackend: backend,
        });
      } finally {
        process.chdir(origCwd);
      }

      const ollamaResult = join(root, '.tasks', 'task-AS2-OLL-2.result');
      const claudeResult = join(root, '.tasks', 'task-AS2-CLA-2.result');

      expect(existsSync(ollamaResult)).toBe(true);
      expect(existsSync(claudeResult)).toBe(true);

      const rOllama = JSON.parse(readFileSync(ollamaResult, 'utf-8'));
      const rClaude = JSON.parse(readFileSync(claudeResult, 'utf-8'));
      expect(rOllama.via).toBe('ollama-host-adapter');
      expect(rClaude.via).toBe('docker-backend');
      expect(rOllama.selfAssessment).toBe('DONE');
      expect(rClaude.selfAssessment).toBe('DONE');
    });

    it('provider state does not leak between concurrent workers (each result carries its own via)', async () => {
      const ollamaTask = makeTask('AS2-OLL-3', 'ollama', 'qwen3.6:27b', 'src/o3.ts');
      const claudeTask = makeTask('AS2-CLA-3', 'claude', 'claude-sonnet-5', 'src/c3.ts');
      persist([ollamaTask, claudeTask]);
      const backend = makeBackend(root);

      const origCwd = process.cwd();
      process.chdir(root);
      try {
        await spawnWorkers(root, makeSprint([ollamaTask, claudeTask]), makeConfig(), {
          spawnBackend: backend,
        });
      } finally {
        process.chdir(origCwd);
      }

      const ollamaResult = JSON.parse(
        readFileSync(join(root, '.tasks', 'task-AS2-OLL-3.result'), 'utf-8'),
      );
      const claudeResult = JSON.parse(
        readFileSync(join(root, '.tasks', 'task-AS2-CLA-3.result'), 'utf-8'),
      );

      // Each result carries the correct provider tag — no state leak
      expect(ollamaResult.via).toBe('ollama-host-adapter');
      expect(claudeResult.via).toBe('docker-backend');
      // Ollama result must not carry 'docker-backend' (would indicate cross-contamination)
      expect(ollamaResult.via).not.toBe('docker-backend');
      expect(claudeResult.via).not.toBe('ollama-host-adapter');
    });
  });
});
