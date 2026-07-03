# Provider CLI Matrix

## Arg Contract Per Provider
- **Claude** (subprocess): `claude -p - --model <apiId> [--allowedTools ...]
  [--dangerously-skip-permissions] [--effort <level>]`. Prompt via **stdin**
  (`-p -` + `< promptPath`), never inline — keeps prompt size off argv.
  Usage-emit (`--output-format json`) is appended ONLY at spawn time, kept
  out of the unit-tested `buildArgs`/`buildCommandString` shape.
- **Codex**: `codex exec --full-auto "<prompt>" --model <apiId> [-c
  model_reasoning_effort=<effort>]`. Prompt is an **inline positional arg**.
  Usage-emit is `--json` — NOT `--output-format json`. Same intent as
  Claude/Gemini, different literal flag.
- **Gemini**: `gemini -p <prompt> --output-format json -m <apiId>
  --approval-mode <yolo|default> --skip-trust`. Prompt is an **inline arg**
  to `-p`. `yolo` + `--skip-trust` are required for a headless worker
  (default `plan` mode is read-only; an untrusted workspace prompts and
  hangs) — gate both behind `opts.autoApprove`, never unconditionally.

## Model Param
Never send deckent's internal model alias — resolve
`modelRegistry.get(model)?.apiId ?? model` first. Codex rejects an alias
like `gpt-5` outright; Claude/Gemini may accept it by coincidence, which is
worse — silent until the alias and the wire name diverge.

## Exit-Code Honesty
All three adapters probe availability the same way: `spawnSync(bin,
['--version'|auth-check], ...)` then `result.status === 0`. A thrown spawn
error (ENOENT) and a non-zero status both collapse to the SAME negative
outcome (`false`/`'unknown'`) — never assume success when the check itself
failed to run. A `0` exit code means "the probe completed", not "the task
succeeded": only `--version`/auth probes read exit-code-as-truth; real
worker success comes from parsed stdout / the `.result` file, never the
exit code alone.

## Silent-Fallback Ban
`worker_provider=codex` silently resolving to Claude when codex isn't
registered is the named anti-pattern this project bans (`provider.ts`,
`ollama.ts`, `global-scope-resolver.ts`) — an unresolvable provider/platform
must throw or surface an explicit `UNSUPPORTED_*` state, never auto-
substitute another provider's adapter. Extend the rule to CLI args: never
assume Provider B accepts Provider A's flag because they "look the same"
(the `--json` vs `--output-format json` divergence above) — verify
per-provider before wiring. A wrong flag errors loudly (recoverable) or is
silently ignored (worse — hides the bug).

## Repro-Before-Red Pattern
When a provider-CLI bug is reported, write the failing reproduction FIRST: a
hermetic test that spawns the fake/injected CLI with the exact args in
question and asserts the CURRENT (buggy) behavior — confirm it is red for
the stated reason before touching adapter code. A fix without a red-first
repro risks patching a symptom that was never the actual defect. Keep the
repro as the regression test after the fix goes green — it proves this
arg-table entry stays correct across CLI version bumps.

## Anti-Patterns
- Assuming `--output-format json` exists on every provider (Codex diverges:
  `--json`).
- Sending the deckent-internal model id/alias instead of registry `apiId`.
- Treating a non-zero probe exit code as "unknown, try anyway".
- Emitting `--dangerously-skip-permissions` / `yolo` / `--full-auto`
  unconditionally instead of gating on `autoApprove`.
- Fixing a provider-CLI bug with no red-first repro proving the fix.

## Karpathy Notes
- **Surgical:** a provider arg change touches exactly that provider's
  `buildArgs`/`buildCommand` — resist "harmonizing" the other providers'
  flags in the same change.
- **Simplicity first:** one arg-table entry per provider, no shared
  abstraction until a third consumer needs the same flag-mapping.
- **Goal-driven:** DONE means the repro test is red before the fix and
  green after, on the real (or hermetically faked) CLI — not that the
  code merely compiles.
