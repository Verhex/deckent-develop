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
    expect(cmd).toBe('codex exec --skip-git-repo-check --json --model gpt-5.5 --dangerously-bypass-approvals-and-sandbox');
    expect(cmd).not.toContain('--full-auto');
  });

  it('gemini: -p $(cat …), yolo + skip-trust, -m apiId, no --dangerously-skip-permissions', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.gemini, 'gemini-2.5-flash', P, { autoApprove: true });
    expect(cmd).toBe(`gemini -p "$(cat ${P})" --output-format json -m gemini-2.5-flash --approval-mode yolo --skip-trust`);
    expect(cmd).not.toContain('--dangerously-skip-permissions');
  });

  it('claude: stdin prompt (-p -), apiId, allowedTools + dangerously-skip-permissions on autoApprove', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, { autoApprove: true, allowedTools: 'Read,Write' });
    expect(cmd).toBe('claude -p - --output-format json --model claude-opus-4-8 --allowedTools "Read,Write" --dangerously-skip-permissions');
  });

  it('claude without autoApprove omits dangerously-skip-permissions', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, {});
    expect(cmd).not.toContain('--dangerously-skip-permissions');
  });

  it('claude finite verifier narrows the visible tool schema and isolates project context', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-fable-5', P, {
      autoApprove: true,
      allowedTools: 'Bash',
      availableTools: 'Bash',
      isolatedContext: true,
    });
    expect(cmd).toContain('--allowedTools "Bash"');
    expect(cmd).toContain('--tools "Bash"');
    expect(cmd).toContain('--safe-mode');
    expect(cmd).toContain('--disable-slash-commands');
    expect(cmd).toContain('--no-session-persistence');
  });

  it('ordinary claude worker does not receive finite-verifier isolation flags', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-sonnet-5', P, {
      autoApprove: true,
      allowedTools: 'Read,Write,Edit,Bash,Glob,Grep',
    });
    expect(cmd).not.toContain('--tools ');
    expect(cmd).not.toContain('--safe-mode');
    expect(cmd).not.toContain('--disable-slash-commands');
    expect(cmd).not.toContain('--no-session-persistence');
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

  // F1-RE (Sprint 252): model reasoning-effort appended when resolved + supported.
  it('claude: appends --effort <level> when reasoningEffort is set', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, { autoApprove: true, reasoningEffort: 'xhigh' });
    expect(cmd).toContain('--effort xhigh');
  });

  it('codex: appends -c model_reasoning_effort=<level> when reasoningEffort is set', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.codex, 'gpt-5.5', P, { autoApprove: true, reasoningEffort: 'high' });
    expect(cmd).toContain('-c model_reasoning_effort=high');
  });

  it('gemini: reasoningEffortArgs=null → no effort flag even if a level is passed', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.gemini, 'gemini-2.5-flash', P, { autoApprove: true, reasoningEffort: 'high' });
    expect(cmd).not.toContain('effort');
    expect(cmd).not.toContain('model_reasoning_effort');
  });

  it('no reasoningEffort → no effort flag (opt-in)', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, { autoApprove: true });
    expect(cmd).not.toContain('--effort');
  });

  // F3.1: --exclude-dynamic-system-prompt-sections is claude-only + opt-in.
  it('claude: appends --exclude-dynamic-system-prompt-sections when excludeDynamicPromptSections is set', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, { excludeDynamicPromptSections: true });
    expect(cmd).toContain('--exclude-dynamic-system-prompt-sections');
  });

  it('claude: no flag when excludeDynamicPromptSections is false/unset (opt-in, byte-safe)', () => {
    expect(buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, { excludeDynamicPromptSections: false }))
      .not.toContain('--exclude-dynamic-system-prompt-sections');
    expect(buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, {}))
      .not.toContain('--exclude-dynamic-system-prompt-sections');
  });

  it('codex/gemini: excludeDynamicPromptSectionsFlag=null → flag never emitted even when opted in', () => {
    expect(buildProviderCommand(PROVIDER_COMMAND_SPECS.codex, 'gpt-5.5', P, { excludeDynamicPromptSections: true }))
      .not.toContain('--exclude-dynamic-system-prompt-sections');
    expect(buildProviderCommand(PROVIDER_COMMAND_SPECS.gemini, 'gemini-2.5-flash', P, { excludeDynamicPromptSections: true }))
      .not.toContain('--exclude-dynamic-system-prompt-sections');
  });
});

describe('getProviderCommandSpec', () => {
  it('returns the spec for a known provider', () => {
    expect(getProviderCommandSpec('codex')?.binary).toBe('codex');
    expect(getProviderCommandSpec('gemini')?.binary).toBe('gemini');
    expect(getProviderCommandSpec('claude')?.binary).toBe('claude');
  });

  it('declares live-usage capability separately from final usage output', () => {
    expect(getProviderCommandSpec('claude')?.liveUsage).toBe('incremental');
    expect(getProviderCommandSpec('codex')?.liveUsage).toBe('final-only');
    expect(getProviderCommandSpec('gemini')?.liveUsage).toBe('final-only');
  });
  it('returns null for an unknown/host-only provider (e.g. ollama) → caller honest-fails', () => {
    expect(getProviderCommandSpec('ollama')).toBeNull();
    expect(getProviderCommandSpec('nope')).toBeNull();
  });
});
