# Cookbook

Every command form below was verified through the real binary help tree on 2026-08-01. Commands explicitly marked “run evidence” were also action-run. Mutating recipes are procedures, not claims that this audit executed them. [Evidence: 212-call help audit and read-only run ledger]

## Product-user perspective

### Verify a checkout without changing it

```bash
node dist/cli/entry.js --version-json
node dist/cli/entry.js doctor --json
node dist/cli/entry.js onboard --plan-only --json
node dist/cli/entry.js status --json
```

Run evidence: all exited 0. Read the doctor/status payloads for nonfatal missing checks and typed HOLDs. [Evidence: actual outputs, 2026-08-01]

### Inspect connection gaps

```bash
node dist/cli/entry.js connect --json
```

Run evidence: valid JSON, exit 1 because some provider/MCP targets were not ready. Use the returned step arrays as proposed remediation, not automatic authority to install or attach. [Evidence: actual output; `src/cli/commands/connect.ts:198-215`]

### Query memory

```bash
node dist/cli/entry.js recall "Goal Mission Flow" --json
node dist/cli/entry.js memory stats
```

Run evidence: five recall results and 1,764 total entries. [Evidence: actual outputs, 2026-08-01]

### Inspect feature truth

```bash
node dist/cli/entry.js features --json
node dist/cli/entry.js truth --json
```

Run evidence: 35 manifest features; five truth contracts with one half-wire candidate. [Evidence: actual outputs, 2026-08-01]

### Preview structured planning

```bash
deckent plan --dry-run
```

The dry-run branch forces structured parsing, needs no provider, and writes no task files. This action was not run under the audit boundary. [Evidence: `src/cli/commands/plan.ts:168-205,253-254,458-461`]

### Preview onboarding changes

```bash
deckent onboard --dry-run
```

This uses the same config plan and before/after report as apply, but returns without writing. Help-verified, not action-run. [Evidence: `src/cli/commands/onboard.ts:405-500`]

### Observe a run

```bash
deckent status --watch
deckent watch --follow <taskId>
deckent output <taskId>
```

Choose the exact task/attempt before following logs. Help-verified, not action-run. [Evidence: `src/cli/commands/status.ts:1024-1040`; `src/cli/commands/watch.ts:134-184`; `src/cli/commands/output.ts`]

### Review settlement projections

```bash
deckent review --json
deckent retro --json
deckent history --json --last 1
```

Run evidence exists for all three. In the current snapshot, review contained a pending unknown-sprint item, while retro/history disagreed on missing versus zero coverage; compare projections instead of trusting one summary. [Evidence: actual outputs, 2026-08-01]

### Preview recovery

```bash
deckent resume <sprintId> --dry-run
deckent recover <sprint-id> --dry-run --json
deckent cleanup --dry-run --sprint <id>
```

Help-verified, not action-run. Never remove task or memory state directly; owner approval gates live cleanup/kill. [Evidence: `src/cli/commands/resume.ts:246-492`; `src/cli/commands/recover.ts:170-291`; `src/cli/commands/cleanup.ts:118-196`; `AGENTS.md:69-108`]

### Inspect connectors

```bash
deckent bot status
deckent gateway status
```

Run evidence: bot running, gateway not running. This does not prove channel authentication. [Evidence: actual outputs, 2026-08-01]

### Choose a worker backend

Read effective config first; then set project configuration only with explicit intent:

```bash
deckent config get spawn_backend
deckent config set spawn_backend docker
```

Both paths were help-verified; the read can trigger config migration and the write was not executed. Docker is current fresh-default, subprocess is Windows fallback, tmux is deprecated. [Evidence: `src/core/config.ts:1621-1624`; `src/orchestra/spawn-backend.ts:598-636`; `docs/en/configuration.md`]

### Cross-verify a claim

```bash
deckent xverify "The settlement gate and task authority agree"
```

Help-verified, not action-run. The verifier must be a different provider or return typed HOLD. [Evidence: `AGENTS.md:84-97`; `src/cli/commands/xverify.ts`]

## Dogfood / repository reality

| Recipe class | State | Audit boundary |
|---|---|---|
| Read-only version/doctor/status/memory/feature/service reads | ✅ action-run | Outputs were captured from the built binary. |
| Connect diagnosis | ✅ action-run with honest nonzero | JSON was valid; incomplete readiness caused exit 1. |
| Plan/onboard/recovery previews | ✅ help/source verified | No state-changing preview action was run except `onboard --plan-only --json`. |
| Start/run/autonomous execution | ⚠️ HOLD | Explicitly prohibited in this audit (OQ-20). |
| Cross-provider verification | ⚠️ help/source only | No provider call was authorized. |
