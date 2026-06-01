import { describe, it, expect } from 'vitest';

// Dynamic import — the smoke script is ESM (.mjs) with no TypeScript compilation needed.
// vitest resolves the path relative to the project root.
import {
  createMockProvider,
  createMockDispatcher,
  createMockMemory,
  simulateChatFlow,
  runSmoke,
} from '../../scripts/chat-native-smoke.mjs';

// ─── akış simüle ─────────────────────────────────────────────────────────────

describe('chat-native-smoke — flow simulation', () => {
  it('single user turn produces user+assistant transcript entries', async () => {
    const provider = createMockProvider(['Hi back!']);
    const dispatcher = createMockDispatcher();

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['hello'],
    });

    const userTurns = transcript.filter((m: { role: string }) => m.role === 'user');
    const assistantTurns = transcript.filter((m: { role: string }) => m.role === 'assistant');
    expect(userTurns).toHaveLength(1);
    expect(userTurns[0].content).toBe('hello');
    expect(assistantTurns).toHaveLength(1);
    expect(assistantTurns[0].content).toBe('Hi back!');
  });

  it('multiple sequential turns accumulate in transcript order', async () => {
    const provider = createMockProvider(['answer-1', 'answer-2', 'answer-3']);
    const dispatcher = createMockDispatcher();

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['first', 'second', 'third'],
    });

    const userContents = transcript
      .filter((m: { role: string }) => m.role === 'user')
      .map((m: { content: string }) => m.content);
    const assistantContents = transcript
      .filter((m: { role: string; toolCalls?: unknown }) => m.role === 'assistant' && !m.toolCalls)
      .map((m: { content: string }) => m.content);

    expect(userContents).toEqual(['first', 'second', 'third']);
    expect(assistantContents).toEqual(['answer-1', 'answer-2', 'answer-3']);
  });

  it('empty input array produces empty transcript', async () => {
    const provider = createMockProvider(['unused']);
    const dispatcher = createMockDispatcher();

    const transcript = await simulateChatFlow({ provider, dispatcher, inputs: [] });
    expect(transcript).toHaveLength(0);
  });
});

// ─── tool round-trip ─────────────────────────────────────────────────────────

describe('chat-native-smoke — tool round-trip', () => {
  it('provider tool_use response causes dispatcher.dispatch and re-send', async () => {
    const toolResponse = {
      text: '',
      stopReason: 'tool_use',
      toolCalls: [{ id: 'tc-1', name: 'deckent_status', args: { root: '.' } }],
    };
    const finalResponse = { text: 'All good', stopReason: 'end_turn' };
    const provider = createMockProvider([toolResponse, finalResponse]);
    const dispatcher = createMockDispatcher({
      deckent_status: () => '{"status":"ok"}',
    });

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['check status'],
    });

    expect(dispatcher.calls).toHaveLength(1);
    expect(dispatcher.calls[0].name).toBe('deckent_status');

    const toolResultTurn = transcript.find(
      (m: { role: string; toolUseId?: string }) => m.role === 'tool',
    );
    expect(toolResultTurn).toBeDefined();
    expect(toolResultTurn?.toolUseId).toBe('tc-1');

    const finalAssistant = [...transcript]
      .reverse()
      .find((m: { role: string; toolCalls?: unknown }) => m.role === 'assistant' && !m.toolCalls);
    expect(finalAssistant?.content).toBe('All good');
    expect(provider.callCount).toBe(2);
  });

  it('unknown tool returns tagged mock result without throwing', async () => {
    const toolResponse = {
      text: '',
      stopReason: 'tool_use',
      toolCalls: [{ id: 'tc-x', name: 'nonexistent_tool', args: {} }],
    };
    const finalResponse = { text: 'Done', stopReason: 'end_turn' };
    const provider = createMockProvider([toolResponse, finalResponse]);
    const dispatcher = createMockDispatcher({});

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['try unknown tool'],
    });

    const toolResult = transcript.find((m: { role: string }) => m.role === 'tool') as
      | { content: string }
      | undefined;
    expect(toolResult).toBeDefined();
    expect(toolResult?.content).toContain('nonexistent_tool');
  });
});

// ─── persist ─────────────────────────────────────────────────────────────────

describe('chat-native-smoke — persist', () => {
  it('memory adapter receives user and assistant turns in order', async () => {
    const provider = createMockProvider(['Stored response']);
    const dispatcher = createMockDispatcher();
    const memory = createMockMemory();
    const sessionId = 'test-persist-1';

    await simulateChatFlow({
      provider,
      dispatcher,
      memory,
      sessionId,
      inputs: ['save me'],
    });

    const history = memory.getChatHistory(sessionId);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'save me' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'Stored response' });
  });

  it('getChatHistory respects limit parameter', async () => {
    const provider = createMockProvider(['r1', 'r2', 'r3']);
    const dispatcher = createMockDispatcher();
    const memory = createMockMemory();
    const sessionId = 'test-persist-2';

    await simulateChatFlow({
      provider,
      dispatcher,
      memory,
      sessionId,
      inputs: ['a', 'b', 'c'],
    });

    const all = memory.getChatHistory(sessionId);
    const limited = memory.getChatHistory(sessionId, 2);
    expect(all).toHaveLength(6);
    expect(limited).toHaveLength(2);
    expect(limited[limited.length - 1].content).toBe('r3');
  });
});

// ─── exit ─────────────────────────────────────────────────────────────────────

describe('chat-native-smoke — exit', () => {
  it(':exit terminates the loop and subsequent inputs are not processed', async () => {
    const provider = createMockProvider(['first-response', 'should-not-appear']);
    const dispatcher = createMockDispatcher();

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['first', ':exit', 'after-exit'],
    });

    const userTurns = transcript.filter((m: { role: string }) => m.role === 'user');
    expect(userTurns).toHaveLength(1);
    expect(userTurns[0].content).toBe('first');
    expect(provider.callCount).toBe(1);
  });

  it(':quit alias also terminates the loop', async () => {
    const provider = createMockProvider(['r1']);
    const dispatcher = createMockDispatcher();

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['msg', ':quit', 'after'],
    });

    expect(transcript.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
  });

  it('maxTurns cap stops the loop', async () => {
    const provider = createMockProvider(['resp']);
    const dispatcher = createMockDispatcher();

    const transcript = await simulateChatFlow({
      provider,
      dispatcher,
      inputs: ['a', 'b', 'c', 'd', 'e'],
      maxTurns: 2,
    });

    const userTurns = transcript.filter((m: { role: string }) => m.role === 'user');
    expect(userTurns).toHaveLength(2);
  });
});

// ─── runSmoke integration ──────────────────────────────────────────────────────

describe('chat-native-smoke — runSmoke end-to-end', () => {
  it('runSmoke passes all 4 scenarios', async () => {
    const result = await runSmoke();
    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.scenarios.filter((s: string) => s.startsWith('PASS'))).toHaveLength(4);
    expect(result.scenarios.filter((s: string) => s.startsWith('FAIL'))).toHaveLength(0);
  });
});
