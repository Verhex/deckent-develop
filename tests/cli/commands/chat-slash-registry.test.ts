// ═══ chat-slash-registry — `/do` command registration (452-002) ════════════
//
// REPL-DO-SLASH-WIRE: `/do <goal>` is a META-command — it carries no
// `agenticTool`, so resolveSlash falls through to { action: 'none' } and the
// dedicated repl/app.tsx handleSubmit branch (runReplDoSlash) owns it, exactly
// like /model, /cd and /term. These tests pin that registration contract
// (catalog membership, no-dispatch, no collision with /doctor|/directives,
// Tab-completion + /help visibility) without touching the Ink surface.

import { describe, it, expect } from 'vitest';
import {
  buildSlashRegistry,
  resolveSlash,
  slashCompleter,
  renderHelp,
} from '../../../src/cli/commands/chat-slash-registry.js';
import { buildSlashRegistry as buildSlashRegistry__tsm_003, renderHelp as renderHelp__tsm_003, resolveSlash as resolveSlash__tsm_003, type SlashRegistry } from "../../../src/cli/commands/chat-slash-registry.js";

describe('/do slash command registration (452-002)', () => {
  const registry = buildSlashRegistry();

  it('appears in the catalog with a description and NO agenticTool (meta-command)', () => {
    const entry = registry.find((c) => c.name === '/do');
    expect(entry).toBeDefined();
    expect(entry?.desc.length).toBeGreaterThan(0);
    expect(entry?.agenticTool).toBeUndefined();
  });

  it('resolveSlash returns { action: none } so the app.tsx branch owns /do', () => {
    expect(resolveSlash('/do add a health endpoint', registry)).toEqual({ action: 'none' });
    expect(resolveSlash('/do', registry)).toEqual({ action: 'none' });
  });

  it('does NOT shadow /doctor (a /do-prefixed dispatch command still resolves)', () => {
    expect(resolveSlash('/doctor', registry)).toEqual({
      action: 'agentic',
      tool: 'deckent_doctor',
      args: { root: '.' },
    });
  });

  it('does NOT shadow /directives (its own structured handler still runs)', () => {
    expect(resolveSlash('/directives', registry)).toEqual({ action: 'show-directives' });
  });

  it('slashCompleter surfaces /do for the /do and /d prefixes', () => {
    expect(slashCompleter('/do')[0]).toContain('/do');
    expect(slashCompleter('/d')[0]).toContain('/do');
  });

  it('renderHelp lists the /do command line', () => {
    const help = renderHelp(registry);
    expect(help).toContain('/do');
    expect(help).toContain('Bir hedefi planla ve çalıştır');
  });
});

// TSM-003: physically merged from tests/cli/chat-slash-registry.test.ts.
{
// ─── buildSlashRegistry ───────────────────────────────────────────────────────
describe('buildSlashRegistry — live command catalog', () => {
    it('returns a non-empty registry with at least 5 commands', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(registry.length).toBeGreaterThanOrEqual(5);
    });
    it('includes /help, /status, /recall, /plan, /sprint, /exit, /clear', () => {
        const registry = buildSlashRegistry__tsm_003();
        const names = registry.map((c) => c.name);
        expect(names).toContain('/help');
        expect(names).toContain('/status');
        expect(names).toContain('/recall');
        expect(names).toContain('/plan');
        expect(names).toContain('/sprint');
        expect(names).toContain('/exit');
        expect(names).toContain('/clear');
    });
    it('/status maps to deckent_status MCP tool', () => {
        const registry = buildSlashRegistry__tsm_003();
        const status = registry.find((c) => c.name === '/status');
        expect(status?.agenticTool).toBe('deckent_status');
        expect(status?.agenticArgs).toEqual({ root: '.' });
    });
    it('/recall maps to deckent_memory_query MCP tool', () => {
        const registry = buildSlashRegistry__tsm_003();
        const recall = registry.find((c) => c.name === '/recall');
        expect(recall?.agenticTool).toBe('deckent_memory_query');
    });
    it('/plan maps to deckent_plan MCP tool', () => {
        const registry = buildSlashRegistry__tsm_003();
        const plan = registry.find((c) => c.name === '/plan');
        expect(plan?.agenticTool).toBe('deckent_plan');
        expect(plan?.agenticArgs).toEqual({ mode: 'auto' });
    });
    it('/sprint maps to deckent_history MCP tool', () => {
        const registry = buildSlashRegistry__tsm_003();
        const sprint = registry.find((c) => c.name === '/sprint');
        expect(sprint?.agenticTool).toBe('deckent_history');
    });
    it('meta commands /help /exit /clear have no agenticTool', () => {
        const registry = buildSlashRegistry__tsm_003();
        const help = registry.find((c) => c.name === '/help');
        const exit = registry.find((c) => c.name === '/exit');
        const clear = registry.find((c) => c.name === '/clear');
        expect(help?.agenticTool).toBeUndefined();
        expect(exit?.agenticTool).toBeUndefined();
        expect(clear?.agenticTool).toBeUndefined();
    });
    it('each call returns a new array (immutable copy)', () => {
        const r1 = buildSlashRegistry__tsm_003();
        const r2 = buildSlashRegistry__tsm_003();
        expect(r1).not.toBe(r2);
        expect(r1).toEqual(r2);
    });
});

// ─── renderHelp ──────────────────────────────────────────────────────────────
describe('renderHelp — /help output formatting', () => {
    it('starts with "Komutlar:" header', () => {
        const registry = buildSlashRegistry__tsm_003();
        const output = renderHelp__tsm_003(registry);
        expect(output.startsWith('Komutlar:')).toBe(true);
    });
    it('lists each command on its own line with name and description', () => {
        const registry = buildSlashRegistry__tsm_003();
        const output = renderHelp__tsm_003(registry);
        expect(output).toContain('/help');
        expect(output).toContain('/status');
        expect(output).toContain('/recall');
        expect(output).toContain('/plan');
        expect(output).toContain('/clear');
        expect(output).toContain('/exit');
    });
    it('does not duplicate /quit as a separate entry (alias shown in /exit desc)', () => {
        const registry = buildSlashRegistry__tsm_003();
        const output = renderHelp__tsm_003(registry);
        const lines = output.split('\n');
        const quitLines = lines.filter((l) => l.trimStart().startsWith('/quit'));
        expect(quitLines.length).toBe(0);
    });
    it('works with a custom minimal registry', () => {
        const custom: SlashRegistry = [
            { name: '/foo', desc: 'Foo desc' },
            { name: '/bar', desc: 'Bar desc', agenticTool: 'some_tool' },
        ];
        const output = renderHelp__tsm_003(custom);
        expect(output).toContain('/foo');
        expect(output).toContain('Foo desc');
        expect(output).toContain('/bar');
        expect(output).toContain('Bar desc');
    });
});

// ─── resolveSlash ─────────────────────────────────────────────────────────────
describe('resolveSlash — /status maps to agentic action', () => {
    it('/status → action:agentic, tool:deckent_status, root:.', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/status', registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_status');
            expect(result.args).toMatchObject({ root: '.' });
        }
    });
    it('/STATUS (uppercase) → also resolves (case-insensitive)', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/STATUS', registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_status');
        }
    });
    it('/sprint → action:agentic, tool:deckent_history', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/sprint', registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_history');
        }
    });
    it('/plan → action:agentic, tool:deckent_plan, mode:auto', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/plan', registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_plan');
            expect(result.args).toMatchObject({ mode: 'auto' });
        }
    });
});

describe('resolveSlash — /recall with inline query', () => {
    it('/recall → action:agentic, tool:deckent_memory_query (no query)', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/recall', registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_memory_query');
            expect(result.args['query']).toBeUndefined();
        }
    });
    it('/recall docker heartbeat → extracts query', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/recall docker heartbeat', registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_memory_query');
            expect(result.args['query']).toBe('docker heartbeat');
        }
    });
});

describe('resolveSlash — Faz A expanded read-only commands', () => {
    it.each([
        ['/analyze', 'deckent_analyze_project'],
        ['/review', 'deckent_review'],
        ['/explain', 'deckent_explain'],
        ['/agents', 'deckent_agent_list'],
        ['/skills', 'deckent_skill_list'],
        ['/features', 'deckent_feature_query'],
    ])('%s → agentic %s', (slash, tool) => {
        const registry = buildSlashRegistry__tsm_003();
        const names = registry.map((c) => c.name);
        expect(names).toContain(slash);
        const result = resolveSlash__tsm_003(slash, registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic')
            expect(result.tool).toBe(tool);
    });
    it('/explain sprint-224 → positional flows through args._rest', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/explain sprint-224', registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_explain');
            expect(result.args['_rest']).toEqual(['sprint-224']);
        }
    });
    it('read-only commands without args set no _rest', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/review', registry);
        if (result.action === 'agentic')
            expect(result.args['_rest']).toBeUndefined();
    });
    it('/nervous is a meta-command (in catalog, no agenticTool)', () => {
        const registry = buildSlashRegistry__tsm_003();
        const nervous = registry.find((c) => c.name === '/nervous');
        expect(nervous).toBeDefined();
        expect(nervous?.agenticTool).toBeUndefined();
    });
    it.each([
        ['/sync', 'deckent_sync'],
        ['/checkpoint', 'deckent_checkpoint'],
        ['/kill', 'deckent_kill'],
        ['/cleanup', 'deckent_cleanup'],
        ['/recover', 'deckent_recover'],
    ])('%s → agentic %s (Faz E write/destructive)', (slash, tool) => {
        const registry = buildSlashRegistry__tsm_003();
        expect(registry.map((c) => c.name)).toContain(slash);
        const result = resolveSlash__tsm_003(slash, registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic')
            expect(result.tool).toBe(tool);
    });
    it('/recover sprint-224 → deckent_recover with _rest', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/recover sprint-224', registry);
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_recover');
            expect(result.args['_rest']).toEqual(['sprint-224']);
        }
    });
    it('/config set max_workers 4 → deckent_config with _rest', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(registry.map((c) => c.name)).toContain('/config');
        const result = resolveSlash__tsm_003('/config set max_workers 4', registry);
        expect(result.action).toBe('agentic');
        if (result.action === 'agentic') {
            expect(result.tool).toBe('deckent_config');
            expect(result.args['_rest']).toEqual(['set', 'max_workers', '4']);
        }
    });
});

describe('resolveSlash — /help, /exit, /clear, unknown', () => {
    it('/help → action:help with registry', () => {
        const registry = buildSlashRegistry__tsm_003();
        const result = resolveSlash__tsm_003('/help', registry);
        expect(result.action).toBe('help');
        if (result.action === 'help') {
            expect(result.registry).toBe(registry);
        }
    });
    it('/exit → action:exit', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(resolveSlash__tsm_003('/exit', registry)).toEqual({ action: 'exit' });
    });
    it('/quit → action:exit (alias)', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(resolveSlash__tsm_003('/quit', registry)).toEqual({ action: 'exit' });
    });
    it('/clear → action:clear', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(resolveSlash__tsm_003('/clear', registry)).toEqual({ action: 'clear' });
    });
    it('/unknown → action:none', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(resolveSlash__tsm_003('/unknown', registry)).toEqual({ action: 'none' });
    });
    it('plain text (no slash prefix) → action:none', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(resolveSlash__tsm_003('hello world', registry)).toEqual({ action: 'none' });
    });
    it('empty string → action:none', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(resolveSlash__tsm_003('', registry)).toEqual({ action: 'none' });
    });
    it('whitespace-only → action:none', () => {
        const registry = buildSlashRegistry__tsm_003();
        expect(resolveSlash__tsm_003('   ', registry)).toEqual({ action: 'none' });
    });
});
}
