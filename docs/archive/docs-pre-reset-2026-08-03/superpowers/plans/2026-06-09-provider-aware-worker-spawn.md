# Provider-Aware Worker Spawn (PSL-1 + P2 auth-mount) — Implementation Plan

> **For agentic workers / hand-coding:** bite-sized tasks, exact files, TDD, frequent commits. Hand-coded by Claude (self-modifying spawn/eval path — NOT dogfooded); verified by a next sprint.

**Goal:** Remove the claude-hardcoded worker command from the docker backend. Make worker spawn **provider+model-aware** via a declarative `ProviderCommandSpec` (deckent-core-owned, the PSL-1 pillar), fix the stale codex/gemini `buildCommand` drift, and mount per-provider OAuth dirs into the container so codex/gemini run **live in docker** — then verify in a next sprint.

**Architecture:** Today `ProviderAdapter.buildCommand(model, promptPath, opts)` is the de-facto per-provider command spec, and the tmux backend uses it — but the **docker backend hardcodes claude** (`-p - --model … --dangerously-skip-permissions`) for every provider, and `buildCommand` for codex/gemini is stale-broken (codex sends raw `gpt-5` not apiId; gemini sends `--approval-mode plan` = read-only, no `--skip-trust`). The claude `buildCommand` is also tmux/subprocess-shaped (`-p -` / `< file`), not docker-shaped — so the docker backend cannot consume it verbatim. We introduce a small **declarative `ProviderCommandSpec`** in `core/` keyed by provider; the docker backend builds its container command from the spec (per provider+apiId+approval flags+prompt mode), with the MF-3 honest-fail as the no-spec fallback. Per-provider OAuth dirs (`~/.codex`, `~/.gemini`) mount into the container exactly like `~/.claude`.

**Tech stack:** TypeScript ESM (Node16, `.js` imports), vitest, better-sqlite3-free (pure). No new runtime deps (ADR-010).

---

## Design — `ProviderCommandSpec` (PSL-1 core)

New file `src/core/provider-command-spec.ts` — a declarative, data-first spec (no per-call logic), the seed of the "deckent-core-owned, `deckent upgrade`-distributed" provider-command layer:

```ts
export interface ProviderCommandSpec {
  /** CLI binary inside the container / on host (e.g. 'claude', 'codex', 'gemini'). */
  binary: string;
  /** How the prompt reaches the CLI from a prompt FILE at `promptPath`. */
  promptMode: 'stdin' | 'cat-arg' | 'path-arg';
  /** Flag that selects the model (e.g. '--model', '-m'). */
  modelFlag: string;
  /** Auto-approve / full-permission args appended when autoApprove is true. */
  approvalArgs: readonly string[];
  /** Always-on args (e.g. gemini '--output-format json', '--skip-trust'). */
  staticArgs: readonly string[];
  /** How allowedTools is passed, if at all. null = provider has no such flag. */
  allowedToolsFlag: string | null;
  /** Host OAuth dir to mount into the container (relative to HOME), if any. */
  oauthHomeDir: string | null;   // '.claude' | '.codex' | '.gemini' | null
}
```

A pure builder, used by docker (and later host) backends:

```ts
export function buildProviderCommand(
  spec: ProviderCommandSpec,
  apiId: string,
  promptPath: string,
  opts?: { allowedTools?: string; autoApprove?: boolean },
): string { /* assemble per promptMode + flags */ }
```

Built-in spec map (the only hardcode — and it's the centrally-maintained, upgrade-distributable data, exactly per the PSL design):
- **claude**: `{ binary:'claude', promptMode:'stdin', modelFlag:'--model', approvalArgs:['--dangerously-skip-permissions'], staticArgs:[], allowedToolsFlag:'--allowedTools', oauthHomeDir:'.claude' }`
- **codex**: `{ binary:'codex', promptMode:'cat-arg', modelFlag:'--model', approvalArgs:[], staticArgs:['exec','--full-auto'], allowedToolsFlag:null, oauthHomeDir:'.codex' }`
- **gemini**: `{ binary:'gemini', promptMode:'cat-arg', modelFlag:'-m', approvalArgs:['--approval-mode','yolo'], staticArgs:['--output-format','json','--skip-trust'], allowedToolsFlag:null, oauthHomeDir:'.gemini' }`
- **ollama**: host-only (isAdapterProvider) — no docker spec (honest-fail if reached).

> **apiId, never alias:** `buildProviderCommand` receives `apiId` (e.g. `gpt-5.5`, `claude-opus-4-8`) resolved via `modelRegistry.get(model)?.apiId ?? model` at the call site — fixes the codex `gpt-5`→`gpt-5.5` class centrally.

---

## File Structure
- **Create** `src/core/provider-command-spec.ts` — the spec interface + builder + built-in map.
- **Create** `tests/core/provider-command-spec.test.ts` — builder per provider, apiId, gemini yolo/skip-trust, codex full-auto.
- **Modify** `src/providers/codex.ts:363` (buildCommand drift-fix: apiId).
- **Modify** `src/providers/gemini.ts:431` (buildCommand drift-fix: yolo + skip-trust + apiId).
- **Modify** `src/orchestra/spawn-backend-docker.ts` — consume the spec (replace hardcoded claudeArgs) + per-provider OAuth mount (P2).
- **Modify** `tests/orchestra/spawn-backend-docker.test.ts` — docker builds per-provider command + mounts the right OAuth dir.
- **Modify** `tests/providers/{codex,gemini}*.test.ts` — buildCommand parity assertions.

---

## Tasks

### Task 1: `ProviderCommandSpec` + builder + spec map (P1)
- [ ] **Step 1 — failing test** `tests/core/provider-command-spec.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildProviderCommand, PROVIDER_COMMAND_SPECS } from '../../src/core/provider-command-spec.js';
describe('buildProviderCommand', () => {
  it('codex: exec --full-auto with apiId, cat-arg prompt', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.codex, 'gpt-5.5', '/w/.tasks/p.txt', { autoApprove: true });
    expect(cmd).toBe('codex exec --full-auto "$(cat /w/.tasks/p.txt)" --model gpt-5.5');
  });
  it('gemini: yolo + skip-trust + apiId, no --dangerously-skip-permissions', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.gemini, 'gemini-2.5-flash', '/w/.tasks/p.txt', { autoApprove: true });
    expect(cmd).toContain('--approval-mode yolo');
    expect(cmd).toContain('--skip-trust');
    expect(cmd).toContain('-m gemini-2.5-flash');
    expect(cmd).not.toContain('--dangerously-skip-permissions');
  });
  it('claude: stdin prompt + apiId + dangerously-skip-permissions when autoApprove', () => {
    const cmd = buildProviderCommand(PROVIDER_COMMAND_SPECS.claude, 'claude-opus-4-8', '/w/.tasks/p.txt', { autoApprove: true, allowedTools: 'Read,Write' });
    expect(cmd).toContain('--model claude-opus-4-8');
    expect(cmd).toContain('--dangerously-skip-permissions');
    expect(cmd).toContain('--allowedTools');
  });
});
```
- [ ] **Step 2** run → FAIL (module missing).
- [ ] **Step 3** implement `src/core/provider-command-spec.ts` (interface + builder + map above).
- [ ] **Step 4** run → PASS.
- [ ] **Step 5** commit `feat(core): ProviderCommandSpec (PSL-1) declarative per-provider command builder`.

### Task 2: Fix codex/gemini `buildCommand` drift (P1)
- [ ] **Step 1** update `tests/providers/codex*.test.ts` + `gemini*.test.ts`: codex buildCommand uses apiId (`gpt-5.5` for `gpt-5`); gemini buildCommand contains `yolo`+`--skip-trust`, not `plan`.
- [ ] **Step 2** `codex.ts:363` → `codex exec --full-auto "$(cat ${promptPath})" --model ${modelRegistry.get(model)?.apiId ?? model}`.
- [ ] **Step 3** `gemini.ts:431` → `gemini -p "$(cat ${promptPath})" --output-format json -m ${apiId} --approval-mode yolo --skip-trust`.
- [ ] **Step 4** run codex+gemini suites → PASS; commit.

### Task 3: Docker backend consumes the spec (P1)
- [ ] **Step 1** test in `spawn-backend-docker.test.ts`: `backend.spawn('t','gemini-2.5-flash','p')` → the worker script contains `gemini … --approval-mode yolo --skip-trust -m gemini-2.5-flash` and NOT `--dangerously-skip-permissions`; claude unchanged (regression).
- [ ] **Step 2** in `spawn-backend-docker.ts` replace the hardcoded `claudeArgs`/`claudeCmd` block (~336–348): look up `PROVIDER_COMMAND_SPECS[provider]` (provider = `modelRegistry.get(model)?.provider ?? 'claude'`); if none → keep MF-3 honest-fail; else `const innerCmd = buildProviderCommand(spec, apiId, containerPromptPath, { allowedTools, autoApprove: true })`. Use `innerCmd` where `claudeCmd` was.
- [ ] **Step 3** run docker suite → PASS; commit.

### Task 4: Per-provider OAuth mount in docker run (P2)
- [ ] **Step 1** test: gemini/codex spawn → dockerArgs include `-v <home>/.gemini:<containerHome>/.gemini` (resp. `.codex`), gated on `existsSync`; claude still mounts `.claude`.
- [ ] **Step 2** in `spawn-backend-docker.ts` provider-aware mount block (~535–542): use `spec.oauthHomeDir`; mount `${join(home, spec.oauthHomeDir)}:${containerHome}/${spec.oauthHomeDir}` when it exists + not api-mode. Also `mkdir -p ${containerHome}/${oauthHomeDir}` in the script (mirror the `.claude` line ~477).
- [ ] **Step 3** run docker suite → PASS; commit.

### Task 5: tsc + full touched-suite regression + build
- [ ] `npm run lint` (tsc) clean.
- [ ] vitest on all touched suites green; `npm run build`.
- [ ] commit; **signal Alperen for build + /mcp restart before the verify sprint**.

---

## Verification (next sprint)
- **Regression (live):** a claude docker task still DONE (unchanged path).
- **The real proof:** route a codex AND a gemini task **through docker** (not host). Since MF-2 routes non-claude to the host adapter, add a temporary verify hook: a DIRECTIVES `- Backend: docker` per-task override OR a config `force_docker_providers: [codex, gemini]` for the verify sprint only. With Task-4 OAuth mounts present, the container codex/gemini CLI authenticates via the mounted `~/.codex`/`~/.gemini` session and runs → real `.result`, provider correct, NOT degraded to claude.
- **Disk-verify** ground truth: the worker `.log` shows the codex/gemini banner inside the container + the file written; `.result.tokenUsage.provider` matches.
- If OAuth-in-container proves fragile, fall back to the host-routing decision (MF-2) and keep docker = claude-only — but the spec + drift-fix still stand (clean architecture, no claude-hardcode).

## Notes / open
- `force_docker_providers` (or `- Backend:`) is a verify-only mechanism; decide whether it stays (operator choice docker-vs-host per provider) or is test-only.
- Full unification (host `buildArgs`/`buildCommand` also derive from `ProviderCommandSpec`) is a PSL-1 follow-up — this plan has docker consume the spec; host adapters keep their builders (drift-fixed) for now.
- `deckent upgrade` distribution of the spec map (PSL-4, signed) is a separate pillar task.
