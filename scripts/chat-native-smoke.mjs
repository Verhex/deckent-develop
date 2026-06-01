#!/usr/bin/env node
// chat-native-smoke.mjs — end-to-end smoke for deckent chat --native flow.
//
// Simulates: user input → mock provider → tool dispatch → response → persist.
// No real CLI spawning. All I/O is in-memory.
//
// Run directly: node scripts/chat-native-smoke.mjs → prints PASS or FAIL.
// Import in tests: import { createMockProvider, simulateChatFlow, … } from './chat-native-smoke.mjs'

import { fileURLToPath } from 'node:url';

// ─── Mock Provider ───────────────────────────────────────────────────────────

/**
 * Create a mock ChatProviderAdapter that returns scripted responses in order.
 * Each response can be a plain text string or a full ProviderResponse object.
 * Falls back to the last entry when exhausted.
 */
export function createMockProvider(responses = ['mock-response']) {
  let idx = 0;
  return {
    callCount: 0,
    async send(messages) {
      this.callCount++;
      const raw = responses[idx] ?? responses[responses.length - 1] ?? 'mock-response';
      idx++;
      if (typeof raw === 'string') return { text: raw, stopReason: 'end_turn' };
      return raw;
    },
  };
}

// ─── Mock Dispatcher ─────────────────────────────────────────────────────────

/**
 * Create a mock McpToolDispatcher.
 * `tools` is a map of tool name → handler (args) => string | Promise<string>.
 * Unknown tools return a tagged mock result string.
 */
export function createMockDispatcher(tools = {}) {
  const calls = [];
  const dispatcher = {
    calls,
    async dispatch(name, args) {
      calls.push({ name, args });
      const handler = tools[name];
      if (handler) return String(await handler(args));
      return `[mock-tool] ${name}`;
    },
  };
  return dispatcher;
}

// ─── Mock Memory ─────────────────────────────────────────────────────────────

/**
 * Create a mock ChatMemoryAdapter backed by a plain in-memory store.
 * Exposes `_store` for assertions in tests.
 */
export function createMockMemory() {
  const _store = {};
  return {
    _store,
    appendChatTurn(sessionId, role, content) {
      if (!_store[sessionId]) _store[sessionId] = [];
      _store[sessionId].push({ role, content });
      return _store[sessionId].length;
    },
    getChatHistory(sessionId, limit) {
      const entries = _store[sessionId] ?? [];
      return limit && limit > 0 ? entries.slice(-limit) : [...entries];
    },
  };
}

// ─── Core: simulate chat flow ─────────────────────────────────────────────────

const EXIT_COMMANDS = new Set([':exit', ':quit']);

/**
 * Simulate the chat-native REPL loop entirely in-memory.
 *
 * Mirrors the runChatNativeLoop contract (same loop shape, no dist dependency):
 *   outer while(user turn)
 *     provider.send → inner while(tool_use) → dispatcher.dispatch → re-send
 *   → append assistant turn → persist → next user turn.
 *
 * Returns the accumulated transcript.
 */
export async function simulateChatFlow({
  provider,
  dispatcher,
  memory = null,
  inputs = [],
  sessionId = 'smoke-session',
  maxTurns = 50,
  maxToolHops = 10,
}) {
  const transcript = [];
  let turnCount = 0;

  for (const rawLine of inputs) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (EXIT_COMMANDS.has(line.toLowerCase())) break;
    if (turnCount >= maxTurns) break;
    turnCount++;

    transcript.push({ role: 'user', content: line });
    memory?.appendChatTurn(sessionId, 'user', line);

    let response = await provider.send(transcript);
    let toolHops = 0;

    while (response.stopReason === 'tool_use' && response.toolCalls?.length) {
      if (toolHops >= maxToolHops) break;
      toolHops++;

      transcript.push({
        role: 'assistant',
        content: response.text ?? '',
        toolCalls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        const result = await dispatcher.dispatch(call.name, call.args);
        transcript.push({ role: 'tool', content: result, toolUseId: call.id });
      }

      response = await provider.send(transcript);
    }

    const assistantText = response.text ?? '';
    transcript.push({ role: 'assistant', content: assistantText });
    memory?.appendChatTurn(sessionId, 'assistant', assistantText);
  }

  return transcript;
}

// ─── Smoke: full end-to-end scenario ─────────────────────────────────────────

/**
 * Run a 3-scenario smoke test:
 *  1. Basic flow: user turn → provider response → transcript correct
 *  2. Tool round-trip: provider requests tool → dispatcher called → final response
 *  3. Persist: memory adapter receives all turns
 *  4. Exit: :exit stops the loop
 *
 * Returns { pass: boolean, reason?: string, scenarios: string[] }.
 */
export async function runSmoke() {
  const passed = [];
  const failed = [];

  // ── Scenario 1: basic flow ──────────────────────────────────────────────────
  try {
    const provider = createMockProvider(['Hello, human!']);
    const dispatcher = createMockDispatcher();
    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['hi'],
    });
    const userTurn = transcript.find((m) => m.role === 'user');
    const assistantTurn = transcript.find((m) => m.role === 'assistant');
    if (!userTurn || userTurn.content !== 'hi') throw new Error('user turn missing or wrong');
    if (!assistantTurn || assistantTurn.content !== 'Hello, human!') throw new Error('assistant turn wrong');
    passed.push('flow-simulation');
  } catch (err) {
    failed.push(`flow-simulation: ${err.message}`);
  }

  // ── Scenario 2: tool round-trip ─────────────────────────────────────────────
  try {
    const toolResponse = {
      text: '',
      stopReason: 'tool_use',
      toolCalls: [{ id: 'call-1', name: 'deckent_status', args: { root: '.' } }],
    };
    const finalResponse = { text: 'Status OK', stopReason: 'end_turn' };
    const provider = createMockProvider([toolResponse, finalResponse]);
    const dispatcher = createMockDispatcher({
      deckent_status: () => '{"status":"active"}',
    });

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['what is the status?'],
    });

    const toolTurn = transcript.find((m) => m.role === 'tool');
    const finalAssistant = [...transcript].reverse().find((m) => m.role === 'assistant' && !m.toolCalls);

    if (!toolTurn) throw new Error('tool result turn missing');
    if (dispatcher.calls.length === 0) throw new Error('dispatcher not called');
    if (dispatcher.calls[0].name !== 'deckent_status') throw new Error('wrong tool dispatched');
    if (!finalAssistant || finalAssistant.content !== 'Status OK') throw new Error('final assistant response wrong');
    passed.push('tool-round-trip');
  } catch (err) {
    failed.push(`tool-round-trip: ${err.message}`);
  }

  // ── Scenario 3: persist ─────────────────────────────────────────────────────
  try {
    const provider = createMockProvider(['Persisted response']);
    const dispatcher = createMockDispatcher();
    const memory = createMockMemory();
    const sessionId = 'test-session-persist';

    await simulateChatFlow({
      provider,
      dispatcher,
      memory,
      sessionId,
      inputs: ['remember this'],
    });

    const history = memory.getChatHistory(sessionId);
    if (history.length !== 2) throw new Error(`expected 2 turns persisted, got ${history.length}`);
    if (history[0].role !== 'user' || history[0].content !== 'remember this') throw new Error('user turn not persisted');
    if (history[1].role !== 'assistant') throw new Error('assistant turn not persisted');
    passed.push('persist');
  } catch (err) {
    failed.push(`persist: ${err.message}`);
  }

  // ── Scenario 4: exit ────────────────────────────────────────────────────────
  try {
    const provider = createMockProvider(['Should not reach']);
    const dispatcher = createMockDispatcher();

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['first message', ':exit', 'this should not appear'],
      maxTurns: 10,
    });

    const userTurns = transcript.filter((m) => m.role === 'user');
    if (userTurns.length !== 1) throw new Error(`expected 1 user turn before exit, got ${userTurns.length}`);
    if (provider.callCount !== 1) throw new Error(`expected 1 provider call, got ${provider.callCount}`);
    passed.push('exit');
  } catch (err) {
    failed.push(`exit: ${err.message}`);
  }

  return {
    pass: failed.length === 0,
    reason: failed.length > 0 ? failed.join('; ') : undefined,
    scenarios: [...passed.map((s) => `PASS ${s}`), ...failed.map((s) => `FAIL ${s}`)],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSmoke()
    .then((result) => {
      for (const line of result.scenarios) process.stdout.write(line + '\n');
      if (result.pass) {
        process.stdout.write('PASS\n');
        process.exit(0);
      } else {
        process.stderr.write(`FAIL: ${result.reason}\n`);
        process.exit(1);
      }
    })
    .catch((err) => {
      process.stderr.write(`FAIL: ${err.message}\n`);
      process.exit(1);
    });
}
