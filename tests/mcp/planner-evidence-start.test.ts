import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  code: 'PLANNER_EVIDENCE_HOLD',
  hostile: 'SECRET planner prompt /private/path',
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => {
    throw Object.assign(new Error(state.hostile), { code: state.code });
  }),
  readAuthMode: vi.fn(async () => 'subscription'),
  resolveBrainModel: vi.fn(() => 'gpt-5.6-sol'),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_name: string, value: unknown) => value),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => ''),
  formatErrorResponse: vi.fn(() => ''),
  wrapResponse: vi.fn((value: unknown) => value),
}));

import { registerStartTool } from '../../src/mcp/tools/start.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type Handler = (input: Record<string, unknown>) => Promise<ToolResult>;

function registeredHandler(): Handler {
  let handler: Handler | undefined;
  registerStartTool({
    registerTool: (_name: string, _config: unknown, value: Handler) => { handler = value; },
  } as never);
  if (!handler) throw new Error('start handler was not registered');
  return handler;
}

const CODES = [
  'PLANNER_EVIDENCE_HOLD',
  'PLANNER_EVIDENCE_REPLAN_REQUIRED',
  'EXACT_START_PLANNER_EVIDENCE_HOLD',
  'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED',
] as const;

describe('registered MCP planner-evidence refusal adapter', () => {
  const originalLanguage = process.env['DECKENT_LANGUAGE'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalLanguage === undefined) delete process.env['DECKENT_LANGUAGE'];
    else process.env['DECKENT_LANGUAGE'] = originalLanguage;
  });

  for (const language of ['en', 'tr'] as const) {
    it.each(CODES)(`${language} preserves %s as a safe MCP error`, async (code) => {
      process.env['DECKENT_LANGUAGE'] = language;
      state.code = code;

      const result = await registeredHandler()({});
      const payload = JSON.parse(result.content[0]!.text) as {
        success: boolean;
        code: string;
        nextAction: string;
        message: string;
      };

      expect(result.isError).toBe(true);
      expect(payload.success).toBe(false);
      expect(payload.code).toBe(code);
      expect(payload.nextAction).toBe(code.includes('REPLAN') ? 'replan' : 'inspect-evidence');
      expect(payload.message).toContain(code);
      expect(payload.message).not.toContain(state.hostile);
      expect(payload.message).toContain(getMessage(
        code.includes('REPLAN')
          ? 'planner_evidence.next.replan'
          : 'planner_evidence.next.inspect_evidence',
        language,
      ));
    });
  }

  it('leaves an unknown error on the pre-existing MCP path', async () => {
    process.env['DECKENT_LANGUAGE'] = 'en';
    state.code = 'UNKNOWN_DOMAIN_CODE';

    const result = await registeredHandler()({});
    const payload = JSON.parse(result.content[0]!.text) as { message: string; nextAction?: string };

    expect(payload.message).toBe(state.hostile);
    expect(payload).not.toHaveProperty('nextAction');
  });
});
