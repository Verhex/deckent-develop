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

describe('ProviderCommandSpec prefix fields', () => {
  it('codex declares the measured system-core and project-context suppression argv', () => {
    expect(PROVIDER_COMMAND_SPECS.codex.systemPromptCoreArgs?.('/container/core.md'))
      .toEqual(['-c', 'model_instructions_file=/container/core.md']);
    expect(PROVIDER_COMMAND_SPECS.codex.contextSuppressionArgs)
      .toEqual(['-c', 'project_doc_max_bytes=0']);
  });

  it('leaves prefix fields undefined for every other provider spec', () => {
    for (const provider of ['claude', 'gemini', 'cursor']) {
      expect(PROVIDER_COMMAND_SPECS[provider].systemPromptCoreArgs).toBeUndefined();
      expect(PROVIDER_COMMAND_SPECS[provider].contextSuppressionArgs).toBeUndefined();
    }
  });
});

describe('ProviderCommandSpec planner profiles', () => {
  it('declares a stdin, plain-text, read-only isolated Codex planner profile', () => {
    expect(PROVIDER_COMMAND_SPECS.codex.planner).toEqual({
      baseArgs: ['exec', '--skip-git-repo-check'],
      isolationArgs: [
        '--sandbox', 'read-only',
        '--ephemeral',
        '--ignore-user-config',
        '--ignore-rules',
        '-c', 'mcp_servers={}',
      ],
      promptFeed: 'stdin',
      outputFormat: 'plain-text',
    });
  });

  it('does not invent planner profiles for providers without measured contracts', () => {
    for (const provider of ['claude', 'gemini', 'cursor']) {
      expect(PROVIDER_COMMAND_SPECS[provider].planner).toBeUndefined();
    }
  });
});

describe('buildProviderCommand', () => {
  const P = '/workspace/.tasks/task-x.prompt.txt';

  it('does not consume prefix fields: every provider command remains byte-identical', () => {
    expect({
      claude: buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', P, {
        autoApprove: true,
        allowedTools: 'Read,Write',
      }),
      codex: buildProviderCommand(PROVIDER_COMMAND_SPECS.codex, 'gpt-5.5', P, { autoApprove: true }),
      gemini: buildProviderCommand(PROVIDER_COMMAND_SPECS.gemini, 'gemini-2.5-flash', P, { autoApprove: true }),
      cursor: buildProviderCommand(PROVIDER_COMMAND_SPECS.cursor, 'grok-4.6', P),
    }).toEqual({
      claude: 'claude -p - --output-format json --model claude-opus-4-8 --allowedTools "Read,Write" --dangerously-skip-permissions',
      codex: 'codex exec --skip-git-repo-check --json --model gpt-5.5 --dangerously-bypass-approvals-and-sandbox',
      gemini: `gemini -p "$(cat ${P})" --output-format json -m gemini-2.5-flash --approval-mode yolo --skip-trust`,
      cursor: `cursor-agent --mode ask -p --trust --output-format json --model grok-4.6 -- "$(cat ${P})"`,
    });
  });

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

  it('cursor: read-only ask mode, JSON output, apiId, then positional prompt', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.cursor, 'grok-4.6', P);
    expect(cmd).toBe(`cursor-agent --mode ask -p --trust --output-format json --model grok-4.6 -- "$(cat ${P})"`);
  });

  it('cursor: execution permission is explicit and never default-on', () => {
    expect(buildProviderCommand(PROVIDER_COMMAND_SPECS.cursor, 'grok-4.6', P)).not.toContain('--force');
    expect(buildProviderCommand(PROVIDER_COMMAND_SPECS.cursor, 'grok-4.6', P, { autoApprove: true }))
      .toBe(`cursor-agent --mode ask -p --trust --output-format json --model grok-4.6 --force -- "$(cat ${P})"`);
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
    expect(PROVIDER_COMMAND_SPECS.cursor.promptFeed).toBe('argument');
  });

  it('oauthHomeDir per provider (for container auth mount)', () => {
    expect(PROVIDER_COMMAND_SPECS.claude.oauthHomeDir).toBe('.claude');
    expect(PROVIDER_COMMAND_SPECS.codex.oauthHomeDir).toBe('.codex');
    expect(PROVIDER_COMMAND_SPECS.gemini.oauthHomeDir).toBe('.gemini');
    expect(PROVIDER_COMMAND_SPECS.cursor.oauthHomeDir).toBe('.config/cursor');
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
    expect(getProviderCommandSpec('cursor')?.binary).toBe('cursor-agent');
  });

  it('declares live-usage capability separately from final usage output', () => {
    expect(getProviderCommandSpec('claude')?.liveUsage).toBe('incremental');
    expect(getProviderCommandSpec('codex')?.liveUsage).toBe('final-only');
    expect(getProviderCommandSpec('gemini')?.liveUsage).toBe('final-only');
    expect(getProviderCommandSpec('cursor')?.liveUsage).toBe('final-only');
  });
  it('returns null for an unknown/host-only provider (e.g. ollama) → caller honest-fails', () => {
    expect(getProviderCommandSpec('ollama')).toBeNull();
    expect(getProviderCommandSpec('nope')).toBeNull();
  });
});

// ═══ TOOL-AUTHORITY-001 T1 (GR-2026-08-08-TOOLAUTH-T1-01) ═══════════════════
import { resolveToolScopeEnforcement } from '../../src/core/provider-command-spec.js';

describe('resolveToolScopeEnforcement — runtime tool-scope truth', () => {
  it('claude (allowedToolsFlag present) + write scope → flag-enforced', () => {
    const r = resolveToolScopeEnforcement('claude', ['src/greet.ts']);
    expect(r.flagEnforced).toBe(true);
    expect(r.reasonCode).toBe('ENFORCED_FLAG_PRESENT');
  });

  it('codex (allowedToolsFlag null) + write scope → UNENFORCED (the silent full surface)', () => {
    const r = resolveToolScopeEnforcement('codex', ['src/greet.ts']);
    expect(r.flagEnforced).toBe(false);
    expect(r.reasonCode).toBe('RUNTIME_TOOL_SCOPE_UNENFORCED');
  });

  it('gemini (allowedToolsFlag null) + write scope → UNENFORCED', () => {
    expect(resolveToolScopeEnforcement('gemini', ['src/x.ts']).reasonCode)
      .toBe('RUNTIME_TOOL_SCOPE_UNENFORCED');
  });

  it('cursor (allowedToolsFlag null) + write scope → UNENFORCED', () => {
    expect(resolveToolScopeEnforcement('cursor', ['src/x.ts']).reasonCode)
      .toBe('RUNTIME_TOOL_SCOPE_UNENFORCED');
  });

  it('no write scope → nothing to enforce (NO_WRITE_SCOPE), even for codex', () => {
    expect(resolveToolScopeEnforcement('codex', []).reasonCode).toBe('NO_WRITE_SCOPE');
    expect(resolveToolScopeEnforcement('codex', ['   ']).reasonCode).toBe('NO_WRITE_SCOPE');
  });

  it('unknown provider + write scope → UNKNOWN_PROVIDER (fail-visible, not silent)', () => {
    expect(resolveToolScopeEnforcement('nope', ['src/x.ts']).reasonCode).toBe('UNKNOWN_PROVIDER');
  });
});

import { resolveWriteScopeShellEscape } from '../../src/core/provider-command-spec.js';

describe('resolveWriteScopeShellEscape — Bash-defeats-Write escape (filesystem-write-guard)', () => {
  // The ACTUAL production grant string buildDockerAllowedTools / sprint-spawner
  // emit: path-scoped Write/Edit alongside an UNCONDITIONAL unscoped Bash.
  const DOCKER_GRANT = 'Read,Write(.tasks/,src/greet.ts),Edit(.tasks/,src/greet.ts),Bash,Glob,Grep';

  it('production grant (scoped Write + unscoped Bash) → DEFEATED_BY_SHELL', () => {
    const r = resolveWriteScopeShellEscape(DOCKER_GRANT, ['src/greet.ts']);
    expect(r.escaped).toBe(true);
    expect(r.reasonCode).toBe('WRITE_SCOPE_DEFEATED_BY_SHELL');
    expect(r.shellTools).toEqual(['Bash']);
    expect(r.declaredScope).toBe(true);
  });

  it('paren-aware: commas INSIDE Write(a,b,c) do not split the token', () => {
    const r = resolveWriteScopeShellEscape(
      'Read,Write(.tasks/,src/a.ts,src/b.ts),Edit(.tasks/,src/a.ts,src/b.ts),Bash,Glob,Grep',
      ['src/a.ts', 'src/b.ts'],
    );
    // If the tokenizer split on the inner commas, `src/a.ts` etc. would appear as
    // bare tokens and the write detection would misfire — this pins it does not.
    expect(r.reasonCode).toBe('WRITE_SCOPE_DEFEATED_BY_SHELL');
    expect(r.shellTools).toEqual(['Bash']);
  });

  it('path-scoped Write with NO shell grant → TOOL_BOUND (scope holds)', () => {
    const r = resolveWriteScopeShellEscape('Read,Write(.tasks/,src/x.ts),Edit(.tasks/,src/x.ts),Glob,Grep', ['src/x.ts']);
    expect(r.escaped).toBe(false);
    expect(r.reasonCode).toBe('WRITE_SCOPE_TOOL_BOUND');
    expect(r.shellTools).toEqual([]);
  });

  it('bare unscoped Write/Edit → WRITE_GRANT_UNSCOPED (nothing narrower to defeat)', () => {
    const r = resolveWriteScopeShellEscape('Read,Write,Edit,Bash,Glob,Grep', []);
    expect(r.escaped).toBe(false);
    expect(r.reasonCode).toBe('WRITE_GRANT_UNSCOPED');
    expect(r.declaredScope).toBe(false);
  });

  it('no write authority at all → NO_WRITE_GRANT (even with Bash present)', () => {
    const r = resolveWriteScopeShellEscape('Read,Bash,Glob,Grep', ['src/x.ts']);
    expect(r.escaped).toBe(false);
    expect(r.reasonCode).toBe('NO_WRITE_GRANT');
  });

  it('declaredScope reflects the task filesWrite, independent of the verdict', () => {
    expect(resolveWriteScopeShellEscape(DOCKER_GRANT, []).declaredScope).toBe(false);
    expect(resolveWriteScopeShellEscape(DOCKER_GRANT, ['  ']).declaredScope).toBe(false);
    expect(resolveWriteScopeShellEscape(DOCKER_GRANT, ['src/x.ts']).declaredScope).toBe(true);
  });

  it('empty/undefined allowedTools → NO_WRITE_GRANT (no grant, nothing to escape)', () => {
    expect(resolveWriteScopeShellEscape(undefined, ['src/x.ts']).reasonCode).toBe('NO_WRITE_GRANT');
    expect(resolveWriteScopeShellEscape('', ['src/x.ts']).reasonCode).toBe('NO_WRITE_GRANT');
  });
});
