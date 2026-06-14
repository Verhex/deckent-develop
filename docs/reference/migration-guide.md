# Migration & Upgrade Guide

This guide covers breaking changes and migration steps for major deckent version transitions.

---

## Table of Contents

1. [v0.x → v1.0 Breaking Changes](#v0x--v10-breaking-changes)
2. [Config Format Changes](#config-format-changes)
3. [DECKENT.md → AGENTS.md Transition](#deckentmd--agentsmd-transition)
4. [Plugin System v1 → v2](#plugin-system-v1--v2)
5. [Automatic Migration (`deckent upgrade`)](#automatic-migration-deckent-upgrade)
6. [Troubleshooting](#troubleshooting)

---

## v0.x → v1.0 Breaking Changes

### Overview

| Area | v0.x | v1.0 | Migration Required |
|------|------|------|--------------------|
| Config file | `.deckent/config.json` (flat) | `.deckent/config.json` (mode-based) | Yes |
| Agent entrypoint | `AGENTS.md` | `DECKENT.md` | Yes |
| Plugin manifest | `manifest.json` (v1 shape) | `manifest.json` (v2 shape) | Yes |
| Task files | `.tasks/*.json` (no `sprintId`) | `.tasks/*.json` (with `sprintId`) | Auto |
| Brain planning | `structured` only | `ai \| structured \| auto` | Optional |
| Worker count | Fixed integer | `number \| "auto"` | Optional |

### Task Status Changes

v1.0 adds the `DRAFT` status to the task lifecycle. Tasks are now created as `DRAFT` and promoted to `PENDING` before spawning. If you have tooling that reads task files directly, update status checks:

```ts
// v0.x
if (task.status === 'PENDING') { ... }

// v1.0 — account for DRAFT → PENDING promotion
if (task.status === 'PENDING' || task.status === 'DRAFT') { ... }
```

### Heartbeat Format

The `status` field in heartbeat files (`.tasks/*.hb`) now uses `AgentStatus` enum values instead of plain strings:

```json
// v0.x
{ "status": "running" }

// v1.0
{ "status": "EXECUTING" }
```

Valid values: `IDLE | PLANNING | EXECUTING | EVALUATING | SCANNING | CODING | VERIFYING | TESTING | DOCUMENTING | DONE | ERROR | PAUSED`

### Task Result Format

The `selfAssessment` field is now required in result files:

```json
// v0.x (selfAssessment missing → treated as DONE)
{ "taskId": "001-001", "testsPassed": true }

// v1.0 (required)
{ "taskId": "001-001", "testsPassed": true, "selfAssessment": "DONE" }
```

---

## Config Format Changes

### v0.x Flat Config

```json
{
  "max_workers": 4,
  "brain_model": "opus",
  "default_model": "sonnet",
  "haiku_allowed": false,
  "language": "en"
}
```

### v1.0 Mode-Based Config

```json
{
  "mode": "economic",
  "language": "en",
  "projectName": "my-project",
  "version": "1.0.0",
  "modes": {
    "performance": {
      "max_workers": 8,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "brain_planning": "ai"
    },
    "balanced": {
      "max_workers": 5,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "brain_planning": "auto"
    },
    "economic": {
      "max_workers": 3,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": false,
      "brain_planning": "structured"
    },
    "api": {
      "max_workers": 2,
      "brain_model": "haiku",
      "default_model": "haiku",
      "haiku_allowed": true
    }
  }
}

> **Legacy aliases:** `max_plan` → `performance`, `max5x_plan` → `balanced`, `pro_plan` → `economic`. Old names still work but are deprecated.
```

### New Config Fields (v1.0)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `PlanMode` | `"performance"` | Active plan mode (legacy: `pro_plan`) |
| `modes` | `Record<PlanMode, PlanModeConfig>` | — | Per-mode configuration |
| `language` | `"en" \| "tr"` | `"en"` | UI language |
| `projectName` | `string` | directory name | Project display name |
| `version` | `string` | `"1.0.0"` | Config schema version |
| `auto_docs` | `AutoDocsConfig` | — | Automatic doc update tiers |
| `brain_planning` | `"ai" \| "structured" \| "auto"` | `"auto"` | Planning strategy (per mode) |
| `max_workers` | `number \| "auto"` | `4` | Worker count (`"auto"` = CPU-based) |

### Migrating Flat Config Manually

1. Wrap your existing fields under the appropriate mode (e.g. `economic`).
2. Add the `mode` field pointing to that mode.
3. Run `deckent doctor` to validate.

Or run `deckent upgrade` to migrate automatically (see [below](#automatic-migration-deckent-upgrade)).

---

## DECKENT.md → AGENTS.md Transition

### Background

Before Sprint 15, deckent used `AGENTS.md` (for Claude agents) and `CLAUDE.md` (for Claude Code) as separate files, often kept in sync via a symlink. Sprint 15 introduced `DECKENT.md` as the single source of truth.

### v0.x Structure

```
AGENTS.md          ← agent rules
CLAUDE.md          ← symlink to AGENTS.md (or copy)
```

### v1.0 Structure

```
DECKENT.md         ← single source of truth
CLAUDE.md          ← @DECKENT.md reference (injected by deckent init/sync)
AGENTS.md          ← @DECKENT.md reference (injected by deckent sync)
```

### Migration Steps

**Option A: Automatic (recommended)**

```bash
deckent sync
```

`deckent sync` will:
1. Detect existing `AGENTS.md` content.
2. Create `DECKENT.md` if it does not exist, copying the content from `AGENTS.md`.
3. Inject `@DECKENT.md` reference into `CLAUDE.md` without overwriting existing content.
4. Inject `@DECKENT.md` reference into `AGENTS.md` without overwriting existing content.

**Option B: Manual**

1. Create `DECKENT.md` and copy your agent rules into it.
2. Add to `CLAUDE.md` (at the top, additive — do not overwrite existing content):
   ```
   @DECKENT.md
   ```
3. Add to `AGENTS.md`:
   ```
   @DECKENT.md
   ```

### Verification

```bash
deckent doctor
# Expected: ✓ DECKENT.md found
# Expected: ✓ CLAUDE.md references DECKENT.md
```

---

## Plugin System v1 → v2

### Manifest Changes

The v2 plugin manifest adds lifecycle hooks, permission declarations, and a model hint.

**v1 manifest (`manifest.json`)**

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "entrypoint": "index.js"
}
```

**v2 manifest (`manifest.json`)**

```json
{
  "name": "my-plugin",
  "version": "2.0.0",
  "description": "Does something useful",
  "entrypoint": "index.js",
  "triggers": ["beforeSprint", "afterTask"],
  "permissions": ["read:tasks", "write:docs"],
  "hooks": {
    "beforeSprint": "hooks/before-sprint.js",
    "afterSprint": "hooks/after-sprint.js",
    "beforeTask": "hooks/before-task.js",
    "afterTask": "hooks/after-task.js"
  },
  "model": "haiku",
  "enabled": true,
  "dependencies": ["other-plugin"]
}
```

### New v2 Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `triggers` | `string[]` | No | Lifecycle events this plugin listens to |
| `permissions` | `string[]` | No | Declared access requirements |
| `hooks` | `object` | No | File paths for hook scripts |
| `hooks.beforeSprint` | `string` | No | Runs before sprint starts |
| `hooks.afterSprint` | `string` | No | Runs after sprint completes |
| `hooks.beforeTask` | `string` | No | Runs before each task |
| `hooks.afterTask` | `string` | No | Runs after each task |
| `model` | `ModelType` | No | Preferred model (`opus \| sonnet \| haiku`) |
| `enabled` | `boolean` | No | Toggle without removing (default: `true`) |
| `dependencies` | `string[]` | No | Other plugin names this plugin requires |

### Migration Steps

1. Add `"enabled": true` to all existing v1 manifests (backward compatible — v1 manifests are still loaded).
2. If your plugin needs lifecycle hooks, add the `hooks` block and create the referenced scripts.
3. Declare `permissions` for any file system access your plugin performs.
4. Run `deckent doctor` to validate all plugin manifests.

### Plugin Directory Structure

```
.deckent/plugins/
  my-plugin/
    manifest.json      ← v2 shape
    index.js           ← entrypoint
    hooks/
      before-sprint.js ← optional lifecycle hook
      after-task.js    ← optional lifecycle hook
  .gitkeep             ← tracked; plugin dirs are gitignored
```

### Disabling a Plugin Without Removing It

```json
// manifest.json
{ "enabled": false }
```

Or via CLI:

```bash
# Not yet implemented — edit manifest.json directly
```

---

## Automatic Migration (`deckent upgrade`)

### Current Status

`deckent upgrade` is implemented and supports the following options:

```bash
deckent upgrade               # Check for and install the latest release
deckent upgrade --check       # Check for updates only, do not install
deckent upgrade --changelog   # Show changelog for the latest version and exit
deckent upgrade --beta        # Upgrade to the latest beta pre-release
deckent upgrade --canary      # Upgrade to the latest canary pre-release
deckent upgrade --rollback    # Revert to the previous installed version
deckent upgrade --local <tgz> # Install from a local .tgz file (development)
```

After upgrading, run `deckent sync` and `deckent doctor` to verify your project configuration is up to date.

### Upgrade Steps

1. **Upgrade the binary**:
   ```bash
   deckent upgrade
   ```

2. **Sync adapter files**:
   ```bash
   deckent sync
   ```

3. **Validate**:
   ```bash
   deckent doctor
   ```

4. **Check config** — if you have a flat v0.x config, migrate it to mode-based format (see [Config Format Changes](#config-format-changes)).

---

## Troubleshooting

### `deckent doctor` Fails After Upgrade

**Symptom**: `✗ .deckent/config.json missing or invalid`

**Cause**: Config schema changed between versions.

**Fix**:
```bash
# Re-initialize (does not overwrite existing fields):
deckent init

# Then validate:
deckent doctor
```

---

### CLAUDE.md Lost Custom Content

**Symptom**: Custom rules in `CLAUDE.md` were overwritten.

**Cause**: `deckent init` in v0.x replaced `CLAUDE.md` entirely. v1.0 uses additive injection only.

**Fix**:
```bash
git log --oneline -- CLAUDE.md    # find last good commit
git show <commit>:CLAUDE.md       # inspect content
git checkout <commit> -- CLAUDE.md  # restore
deckent sync                       # re-inject @DECKENT.md reference
```

---

### Plugin Not Loading

**Symptom**: Plugin is installed but not running.

**Causes and fixes**:

1. **Missing `enabled` field** — add `"enabled": true` to `manifest.json`.
2. **Invalid manifest** — run `deckent doctor` to see validation errors.
3. **Plugin directory gitignored but empty** — ensure `manifest.json` exists.
4. **Dependency not installed** — install the listed `dependencies` plugins first.

---

### Workers Spawning with Wrong Model

**Symptom**: All workers use `haiku` even for complex tasks.

**Cause**: `haiku_allowed: true` in active mode config causes aggressive downgrade in structured planning mode.

**Fix**: Set `brain_planning: "ai"` in your active mode to use the AI planner, which infers appropriate models per task. Or set `haiku_allowed: false` to prevent haiku assignment.

```json
{
  "modes": {
    "economic": {
      "haiku_allowed": false,
      "brain_planning": "auto"
    }
  }
}
```

---

### `deckent start` Exits Immediately

**Symptom**: Sprint starts but no workers appear.

**Causes**:

1. **No `DIRECTIVES.md`** — create it with at least one task description.
2. **tmux not installed** — install tmux: `apt install tmux` / `brew install tmux`.
3. **Config `max_workers: 0`** — set to a positive integer or `"auto"`.

Verify with:
```bash
deckent doctor
deckent start --dry-run   # shows planned tasks without spawning
```

---

### `tsc --noEmit` Fails After Upgrade

**Symptom**: TypeScript errors after upgrading deckent.

**Cause**: New types or changed interfaces in the updated version.

**Common fixes**:

1. **`@types/node` missing**:
   ```bash
   npm install --save-dev @types/node
   ```

2. **`structuredClone` not recognized** — requires `@types/node` ≥ 18.

3. **Plugin type mismatch** — update plugin manifests to match v2 `PluginManifest` shape.

---

### Heartbeat Timestamps Show as Invalid

**Symptom**: Auditor reports stale agents immediately after spawn.

**Cause**: Heartbeat file uses locale date string instead of UTC ISO 8601.

**Fix**: Ensure heartbeat files use `new Date().toISOString()`:

```json
// Wrong (locale string)
{ "timestamp": "3/20/2026, 12:00:00 AM" }

// Correct (UTC ISO 8601)
{ "timestamp": "2026-03-20T00:00:00.000Z" }
```

---

### Task Queue Shows Fewer Tasks Than Expected

**Symptom**: Only `max_workers` tasks are planned instead of all directive tasks.

**Cause**: This was a bug in v0.x (`planSprint` limited tasks to `max_workers`). Fixed in Sprint 21 / v0.1.0-sprint21.

**Fix**: Upgrade to at least v0.1.0-sprint21. All tasks are now planned; `spawnWorkers` applies the parallelism limit.

---

## Version Reference

| Version Tag | Key Feature | Test Count |
|-------------|-------------|------------|
| `0.1.0-sprint23` | AI planner post-validation fallback | 1422 |
| `0.1.0-sprint22` | MCP enrichment, CLI hints, doctor --profile | 1392 |
| `0.1.0-sprint21` | Subscription detection, auto workers, task queue fix | 1260 |
| `0.1.0-sprint20` | Fix validation sprint | 1027 |
| `0.1.0-sprint19` | Heartbeat fix, alert dedup, auto doc update | 1123 |
| `0.1.0-sprint18` | First real runSprint execution, 8 doc tasks | 1027 |
| `0.1.0-sprint17` | MCP background jobs, cleanup fix | 1027 |
| `0.1.0-sprint16` | deckent watch, worker log capture | 987 |
| `0.1.0-sprint15` | DECKENT.md, deckent sync, additive init | 967 |
| `0.1.0-sprint12-13` | AI planning (Zod), DRAFT status, auditor in-process | 938 |
| `0.1.0-sprint11` | Web dashboard (React+Vite) | — |

---

*Last updated: Sprint 286 — deckent v1.0.0-beta.1*
