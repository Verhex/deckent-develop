// tests/orchestra/tmux-provider-cli.test.ts
//
// Task 364-003 TMUX-PROVIDER-CLI (born-481 / Yasa #2 parity with 364-002):
// TmuxBackend.spawn() (spawn-backend.ts) calls spawnWorker()/buildWorkerCommand()
// with NO ProviderAdapter, so a task routed onto `spawn_backend: 'tmux'` used to
// hit a hardcoded `claude -p - --model <apiId>` build regardless of the model's
// actual provider — a codex-provider task's apiId (gpt-5.5) would be fed to the
// `claude` CLI's `--model` flag, exactly the bug 364-002 fixed for
// SubprocessBackend. This file hermetically pins the tmux-side fix.
//
// Import-evidence (goCriteria: "ortak-tablo reuse"): asserts tmux's codex/gemini
// command matches `buildProviderCommand(getProviderCommandSpec(...), ...)`
// output directly — proving the SAME PROVIDER_COMMAND_SPECS table is consumed,
// not copied/re-implemented.

import { describe, it, expect } from 'vitest';
import { buildWorkerCommand, TmuxError } from '../../src/orchestra/tmux.js';
import { getProviderCommandSpec, buildProviderCommand } from '../../src/core/provider-command-spec.js';
import { modelRegistry, registerOllamaModels } from '../../src/core/model-registry.js';
import type { ModelType } from '../../src/core/types.js';

// Ollama models are opt-in (registered by providers/ollama.js at module-load
// time in production) — register them explicitly so 'qwen2.5-coder:32b' below
// resolves to provider 'ollama' instead of falling through to the
// unregistered-id default (claude).
registerOllamaModels();

const isWindows = process.platform === 'win32';

describe.skipIf(isWindows)('TMUX-PROVIDER-CLI (364-003, born-481 parity)', () => {
  // ─── codex task → codex CLI, never claude ──────────────────────────────

  describe('codex-provider task', () => {
    it('produces a `codex exec` command with the codex binary, never claude', () => {
      const cmd = buildWorkerCommand('gpt-5.5' as ModelType, '/proj/.tasks/.prompt-t1.txt');

      expect(cmd).toContain('codex exec');
      expect(cmd).not.toMatch(/^claude /);
      expect(cmd).not.toContain('claude -p -');
    });

    it('feeds the wire apiId (gpt-5.5), never the deckent-facing alias (gpt-5)', () => {
      const cmd = buildWorkerCommand('gpt-5.5' as ModelType, '/proj/.tasks/.prompt-t2.txt');

      expect(cmd).toContain('--model gpt-5.5');
      expect(cmd).not.toContain('--model gpt-5 ');
      expect(cmd).not.toContain('--model gpt-5\n');
    });

    it('pipes the prompt file via stdin redirection (codex promptFeed is stdin)', () => {
      const cmd = buildWorkerCommand('gpt-5.5' as ModelType, '/proj/.tasks/.prompt-t3.txt');
      expect(cmd).toContain('< /proj/.tasks/.prompt-t3.txt');
    });

    it('autoApprove appends the codex sandbox-bypass flag only when set', () => {
      const withoutApprove = buildWorkerCommand('gpt-5.5' as ModelType, '/tmp/p.txt', {});
      expect(withoutApprove).not.toContain('--dangerously-bypass-approvals-and-sandbox');

      const withApprove = buildWorkerCommand('gpt-5.5' as ModelType, '/tmp/p.txt', { autoApprove: true });
      expect(withApprove).toContain('--dangerously-bypass-approvals-and-sandbox');
    });

    it('applies codex reasoning-effort via -c model_reasoning_effort=<level>', () => {
      const cmd = buildWorkerCommand('gpt-5.5' as ModelType, '/tmp/p.txt', { reasoningEffort: 'high' });
      expect(cmd).toContain('-c model_reasoning_effort=high');
    });

    it('drops an invalid reasoning-effort for codex (claude-only vocabulary)', () => {
      const cmd = buildWorkerCommand('gpt-5.5' as ModelType, '/tmp/p.txt', { reasoningEffort: 'xhigh' });
      expect(cmd).not.toContain('model_reasoning_effort');
    });

    it('shared-table reuse (import-evidence): matches buildProviderCommand(getProviderCommandSpec("codex"), ...) directly', () => {
      const opts = { autoApprove: true, reasoningEffort: 'medium' };
      const cmd = buildWorkerCommand('gpt-5.5' as ModelType, '/tmp/p.txt', opts, undefined, undefined, 0);

      const spec = getProviderCommandSpec('codex');
      expect(spec).not.toBeNull();
      const expectedBase = buildProviderCommand(spec!, 'gpt-5.5', '/tmp/p.txt', {
        allowedTools: undefined,
        autoApprove: true,
        reasoningEffort: 'medium',
      });
      expect(cmd).toBe(`${expectedBase} < /tmp/p.txt`);
    });
  });

  // ─── claude task → byte-identical to pre-364-003 ───────────────────────

  describe('claude-provider task — byte-identical to pre-364-003', () => {
    it('produces the exact pre-existing hardcoded claude command shape (no --output-format json)', () => {
      const cmd = buildWorkerCommand('claude-sonnet-5' as ModelType, '/tmp/prompt.txt');
      expect(cmd).toBe(`claude -p - --model ${modelRegistry.resolveApiId('claude-sonnet-5' as ModelType)} < /tmp/prompt.txt`);
      // PROVIDER_COMMAND_SPECS.claude carries --output-format json — the tmux
      // no-adapter fallback deliberately does NOT, to stay byte-identical.
      expect(cmd).not.toContain('--output-format');
    });

    it('includes --allowedTools and --dangerously-skip-permissions (no adapter, unchanged)', () => {
      const cmd = buildWorkerCommand('claude-opus-4-8' as ModelType, '/tmp/p.txt', {
        allowedTools: 'Read,Write',
        autoApprove: true,
      });
      expect(cmd).toContain("--allowedTools 'Read,Write'");
      expect(cmd).toContain('--dangerously-skip-permissions');
      expect(cmd).toContain('claude -p - --model claude-opus-4-8');
    });

    it('appends --effort for a valid claude reasoning-effort (unchanged)', () => {
      const cmd = buildWorkerCommand('claude-opus-4-8' as ModelType, '/tmp/p.txt', { reasoningEffort: 'high' });
      expect(cmd).toContain('--effort high');
    });
  });

  // ─── gemini task (inline promptFeed) — tmux CAN embed inline, unlike subprocess ─

  describe('gemini-provider task (inline promptFeed)', () => {
    it('embeds the prompt inline via "$(cat <promptPath>)", no trailing stdin redirection', () => {
      const cmd = buildWorkerCommand('gemini-2.5-flash' as ModelType, '/proj/.tasks/.prompt-g1.txt');

      expect(cmd).toContain('gemini');
      expect(cmd).toContain('"$(cat /proj/.tasks/.prompt-g1.txt)"');
      expect(cmd).not.toMatch(/< \/proj\/\.tasks\/\.prompt-g1\.txt\s*$/);
    });

    it('shared-table reuse: matches buildProviderCommand(getProviderCommandSpec("gemini"), ...) directly', () => {
      const cmd = buildWorkerCommand('gemini-2.5-flash' as ModelType, '/tmp/p.txt', { autoApprove: true });

      const spec = getProviderCommandSpec('gemini');
      expect(spec).not.toBeNull();
      const expected = buildProviderCommand(spec!, 'gemini-2.5-flash', '/tmp/p.txt', {
        allowedTools: undefined,
        autoApprove: true,
        reasoningEffort: undefined,
      });
      expect(cmd).toBe(expected);
    });
  });

  // ─── unknown / host-only provider → honest error, never claude ─────────

  describe('unsupported provider — honest failure (Yasa #2: no silent claude fallback)', () => {
    it('ollama (host-only, no ProviderCommandSpec) throws TmuxError, never builds a claude command', () => {
      expect(() =>
        buildWorkerCommand('qwen2.5-coder:32b' as ModelType, '/tmp/p.txt'),
      ).toThrow(TmuxError);
    });

    it('a fully unregistered model id fails loudly', () => {
      expect(() =>
        buildWorkerCommand('totally-unregistered-model-id' as ModelType, '/tmp/prompt.txt'),
      ).toThrow(TmuxError);
    });
  });

  // ─── adapter-supplied path is unaffected ───────────────────────────────

  describe('adapter path is unaffected by the provider-resolution fix', () => {
    it('delegates the exact registered API ID to a matching adapter', () => {
      const adapter = {
        name: 'codex',
        buildCommand: () => 'mock-cli --model gpt-5.5 < /tmp/p.txt',
      } as never;
      const cmd = buildWorkerCommand('gpt-5.5' as ModelType, '/tmp/p.txt', undefined, adapter);
      expect(cmd).toBe('mock-cli --model gpt-5.5 < /tmp/p.txt');
    });
  });
});
