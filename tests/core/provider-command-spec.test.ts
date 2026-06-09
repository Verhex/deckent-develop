import { describe, it, expect } from 'vitest';
import {
  buildProviderCommand,
  PROVIDER_COMMAND_SPECS,
  getProviderCommandSpec,
} from '../../src/core/provider-command-spec.js';

// PSL-1 (Sprint 252): declarative per-provider command spec — the seed of the
// deckent-core-owned, upgrade-distributed provider-command layer. The docker
// backend builds its container worker command from this instead of hardcoding
// claude (Sprint 249 root cause). apiId (not the deckent alias) is passed in.

describe('buildProviderCommand', () => {
  const P = '/workspace/.tasks/task-x.prompt.txt';

  it('codex: exec with current flags (validated vs codex-cli 0.137.0 --help), apiId, stdin prompt', () => {
    // Authoritative flags from `codex exec --help`: `--full-auto` is deprecated;
    // `--dangerously-bypass-approvals-and-sandbox` is "intended solely for
    // environments that are externally sandboxed" (a docker container) → full
    // autonomy. Prompt via stdin (no positional/cat — robust for large prompts).
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.codex, 'gpt-5.5', P, { autoApprove: true });
    expect(cmd).toBe('codex exec --skip-git-repo-check --model gpt-5.5 --dangerously-bypass-approvals-and-sandbox');
    expect(cmd).not.toContain('--full-auto');
  });

  it('gemini: -p $(cat …), yolo + skip-trust, -m apiId, no --dangerously-skip-permissions', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.gemini, 'gemini-2.5-flash', P, { autoApprove: true });
    expect(cmd).toBe(`gemini -p "$(cat ${P})" --output-format json -m gemini-2.5-flash --approval-mode yolo --skip-trust`);
    expect(cmd).not.toContain('--dangerously-skip-permissions');
  });

  it('claude: stdin prompt (-p -), apiId, allowedTools + dangerously-skip-permissions on autoApprove', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, { autoApprove: true, allowedTools: 'Read,Write' });
    expect(cmd).toBe('claude -p - --model claude-opus-4-8 --allowedTools "Read,Write" --dangerously-skip-permissions');
  });

  it('claude without autoApprove omits dangerously-skip-permissions', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, {});
    expect(cmd).not.toContain('--dangerously-skip-permissions');
  });

  it('promptFeed: claude+codex=stdin (caller pipes < file); gemini=inline (cat embedded in -p)', () => {
    // codex reads instructions from stdin when no positional prompt (validated
    // vs --help) → stdin (robust for large prompts). gemini -p needs the prompt
    // as an arg → inline $(cat …) (escaping caveat for large prompts noted).
    expect(PROVIDER_COMMAND_SPECS.claude.promptFeed).toBe('stdin');
    expect(PROVIDER_COMMAND_SPECS.codex.promptFeed).toBe('stdin');
    expect(PROVIDER_COMMAND_SPECS.gemini.promptFeed).toBe('inline');
  });

  it('oauthHomeDir per provider (for container auth mount)', () => {
    expect(PROVIDER_COMMAND_SPECS.claude.oauthHomeDir).toBe('.claude');
    expect(PROVIDER_COMMAND_SPECS.codex.oauthHomeDir).toBe('.codex');
    expect(PROVIDER_COMMAND_SPECS.gemini.oauthHomeDir).toBe('.gemini');
  });
});

describe('getProviderCommandSpec', () => {
  it('returns the spec for a known provider', () => {
    expect(getProviderCommandSpec('codex')?.binary).toBe('codex');
    expect(getProviderCommandSpec('gemini')?.binary).toBe('gemini');
    expect(getProviderCommandSpec('claude')?.binary).toBe('claude');
  });
  it('returns null for an unknown/host-only provider (e.g. ollama) → caller honest-fails', () => {
    expect(getProviderCommandSpec('ollama')).toBeNull();
    expect(getProviderCommandSpec('nope')).toBeNull();
  });
});
