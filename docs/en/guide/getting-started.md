# Getting started

## Status key

This guide separates the intended product workflow from the current repository state. `✅ live` means current wiring and evidence support the behavior; `⚠️ partial` names a specific constraint; `🔜 roadmap` means no current production closure is claimed. [Evidence: `docs/analysis/COVERAGE-MATRIX-2026-08.md`; feature truth contract `src/cli/commands/truth.ts:264-405`]

## Product-user perspective

### 1. Meet the runtime requirements

Deckent's package contract requires Node.js 24 or newer and exposes two executables: `deckent` and `deckent-mcp`. Git is a required doctor check; Docker and provider CLIs are resolved according to the selected backend and provider policy. [Evidence: `package.json:6-20,100-131`; `src/cli/commands/doctor.ts:2190-2245`]

The published-package installation syntax is `npm install -g deckent`. This audit did not execute global/network installation, so registry installation is `HOLD`; the current source build was already produced with `npm run build:all` by the owner. [Evidence: `package.json:22-38,115-126`; owner run statement, 2026-08-01; OQ-20]

### 2. Verify the binary before changing a project

These commands were executed against `dist/cli/entry.js`:

```bash
node dist/cli/entry.js --version-json
node dist/cli/entry.js doctor --json
node dist/cli/entry.js connect --json
```

The version and doctor commands exited 0. `connect --json` produced a valid diagnostic payload but exited 1 because not every provider/MCP host was ready; a nonzero diagnostic exit must not be rewritten as total product failure. The local snapshot found Claude and Codex logged in, Gemini unavailable/logged out, Codex MCP attached, and other advertised attachment steps pending. [Evidence: real-binary outputs, 2026-08-01; `src/cli/commands/connect.ts:40-215`]

### 3. Initialize deliberately

`deckent init --help` was executed successfully. The live command supports auto/manual detection, environment adapter selection, upgrade/force/repair behavior, explicit prerequisite installation consent, and an opt-out for the Docker image offer. [Evidence: real binary help, exit 0, 2026-08-01; `src/cli/commands/init.ts:343-361`]

Initialization creates Deckent directories, writes config and stack metadata, produces host adapter/rule files, writes `DIRECTIVES.md` and Brain files, updates `.gitignore`, detects providers, runs doctor checks, and classifies the outcome as `READY`, `SETUP_INCOMPLETE`, or `FAILED`. It must not print a ready claim when blockers remain. [Evidence: `src/cli/commands/init.ts:443-571,573-660`]

Use `--yes` only when its documented non-interactive defaults are acceptable: English, balanced mode, and the current directory name as project name. Missing prerequisites are not installed unless installation is explicitly authorized. [Evidence: `src/cli/commands/init.ts:409-425,573-600`]

### 4. Preview onboarding without writes

This command was executed and exited 0:

```bash
node dist/cli/entry.js onboard --plan-only --json
```

The returned plan was project-scoped, balanced, and `applied: false`. The plan-only path runs real read-only provider/auth/MCP probes, does not prompt, does not write config, and does not spawn `init`. [Evidence: real output, 2026-08-01; `src/cli/commands/onboard.ts:301-316,502-546`]

The separate `onboard --apply` path prints the plan, asks for confirmation unless `--yes` is present, applies project-scoped changes, and prints before/after verification. `--dry-run` exercises the same plan without writing. [Evidence: `src/cli/commands/onboard.ts:364-500,502-536`]

### 5. Read current authority before execution

This command was executed and exited 0:

```bash
node dist/cli/entry.js status --json
```

The observed repository state was idle and had no active run. It also carried a typed `HOLD` for unresolved provider-observation intervals, proving that a healthy command exit can still contain admission constraints that an operator must read. [Evidence: real output, 2026-08-01; `src/cli/commands/status.ts:725-781`]

### 6. Choose the first work ingress

- Goal-first: `deckent do <goal>` previews by default; `--run --yes` is explicit execution on the RunFlow-v2 path. [Evidence: `src/cli/commands/do.ts:219-357,440-517`]
- Structured: author `DIRECTIVES.md`, inspect `deckent plan --dry-run`, then use `deckent start` only after provider, scope, budget, and approval evidence is acceptable. [Evidence: `src/cli/commands/plan.ts:121-205,367-461`; `src/cli/commands/start.ts:246-345`]
- One-shot: `deckent run <description>` executes without the full sprint cycle. [Evidence: `src/cli/commands/run.ts:451-476`]
- Process: `deckent process submit <description>` emits an `ExecutionRequest`; read-only requests may run, while side-effecting requests can park for approval. [Evidence: `src/cli/commands/process.ts:142-190`]

The command registrations above were all real-binary help-verified. Their state-changing actions were not run in this audit because the owner prohibited sprint/run/autonomous execution. Exact first-execution proof remains `HOLD`, not simulated success. [Evidence: recursive 212-call help audit, 2026-08-01; OQ-20]

## Dogfood / repository reality

| Area | State | Current evidence |
|---|---|---|
| Built CLI | ✅ live | Version `1.0.0-beta.1`; 211 visible paths; every visible help path exited 0. |
| Readiness diagnosis | ✅ live | `doctor --json`, `connect --json`, onboarding plan, and status were run against the binary. |
| Installation from npm | ⚠️ partial | Package contract exists; network/global installation was outside this audit's write authority. |
| Onboarding | ✅ live | Read-only planner and explicit apply/dry-run paths are wired. |
| First governed execution | ⚠️ partial | Command wiring is present, but this audit was forbidden from running the action. |
| Unattended reliability | ⚠️ partial | The latest dogfood audit records 0/31 intervention-free runs and requires an ordered certification ladder. [Evidence: `PAZARTESI.md`] |

## Next

Continue with [Run lifecycle](run-lifecycle.md), [Execution modes](execution-modes.md), [Workers and providers](workers-and-providers.md), and [Recovery and troubleshooting](recovery-troubleshooting.md).
