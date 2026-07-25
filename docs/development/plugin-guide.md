# PLUGIN-GUIDE.md — Plugin Development Guide

> **Deckent Plugin System**
> Plugins extend Deckent with custom skills, automated hooks, and reusable agent behaviors. This guide covers everything from creating your first plugin to publishing it for others to use.

---

## Table of Contents

1. [Plugin System Overview](#1-plugin-system-overview)
2. [Plugin Directory Structure](#2-plugin-directory-structure)
3. [manifest.json Format](#3-manifestjson-format)
4. [SKILL.md Writing Guide](#4-skillmd-writing-guide)
5. [Hook System](#5-hook-system)
6. [Creating a Plugin](#6-creating-a-plugin)
7. [Installing and Managing Plugins](#7-installing-and-managing-plugins)
8. [Publishing a Plugin](#8-publishing-a-plugin)
9. [Best Practices](#9-best-practices)
10. [Example Plugin Walkthrough](#10-example-plugin-walkthrough)

---

## 1. Plugin System Overview

Plugins are self-contained packages that live in `.deckent/plugins/<name>/`. Each plugin defines:

- A **manifest** (`manifest.json`) — metadata, permissions, model preference, and hook declarations
- A **skill** (`SKILL.md`) — the agent instructions that define behavior
- An optional **README** — documentation for plugin users

When Deckent runs a sprint, the Brain loads all enabled plugins, registers their hooks, and makes their skills available to workers. Plugins can:

- Inject behavior **before or after** sprints and tasks via hooks
- Provide reusable **skill templates** that workers follow
- Declare **permissions** controlling which files/directories they can access
- Specify a preferred **model** (opus / sonnet / haiku)

### Key Files

```
.deckent/plugins/
  <plugin-name>/
    manifest.json     ← required: metadata and configuration
    SKILL.md          ← required: agent instructions (entrypoint)
    README.md         ← recommended: user documentation
```

---

## 2. Plugin Directory Structure

Each plugin lives in its own subdirectory under `.deckent/plugins/`:

```
.deckent/
  plugins/
    my-plugin/
      manifest.json
      SKILL.md
      README.md
    another-plugin/
      manifest.json
      SKILL.md
```

### Rules

- The directory name **must match** the `name` field in `manifest.json`
- Plugins with `"enabled": false` are loaded but not activated
- System plugins have `"system": true` and cannot be removed via CLI
- `.deckent/plugins/.gitkeep` preserves the directory in version control — do not delete it

---

## 3. manifest.json Format

The manifest defines how Deckent loads and uses your plugin.

### Minimal Example

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "What this plugin does",
  "entrypoint": "SKILL.md"
}
```

### Full Example

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Detailed description of the plugin",
  "entrypoint": "SKILL.md",
  "enabled": true,
  "model": "sonnet",
  "triggers": [
    "run analysis",
    "analyze code",
    "code metrics"
  ],
  "permissions": [
    "src/**",
    "tests/**",
    "docs/**"
  ],
  "hooks": {
    "beforeSprint": "hooks/before-sprint.md",
    "afterSprint": "hooks/after-sprint.md"
  },
  "dependencies": []
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **Yes** | Plugin identifier. Must match directory name. Use kebab-case. |
| `version` | string | **Yes** | Semantic version (e.g., `"1.0.0"`). |
| `description` | string | **Yes** | One-line description shown in `deckent plugin list`. |
| `entrypoint` | string | **Yes** | Path to the skill file, relative to plugin dir. Usually `"SKILL.md"`. |
| `enabled` | boolean | No | Default `true`. Set to `false` to deactivate without removing. |
| `model` | string | No | Preferred model: `"opus"`, `"sonnet"`, or `"haiku"`. Default: `"sonnet"`. |
| `triggers` | string[] | No | Keywords that activate this skill. Used for auto-routing. |
| `permissions` | string[] | No | Glob patterns for file access. Workers respect these boundaries. |
| `hooks` | object | No | Hook script paths. See [Hook System](#5-hook-system). |
| `dependencies` | string[] | No | Names of other plugins this plugin requires. |

### Validation Rules

Deckent validates manifests on load and rejects invalid plugins with a `PluginError`. Common validation failures:

- Missing required fields (`name`, `version`, `description`, `entrypoint`)
- Empty string values for required fields
- `model` not one of `opus`, `sonnet`, `haiku`
- `triggers`, `permissions`, or `dependencies` containing non-string items
- `hooks` value not being an object

---

## 4. SKILL.md Writing Guide

`SKILL.md` is the agent instructions file — it tells workers (Claude agents) how to behave when this plugin is active. It uses YAML frontmatter followed by a Markdown body.

### Frontmatter Format

```yaml
---
name: my-plugin
version: 1.0.0
description: Brief description of what this skill does
model: claude-sonnet-5
triggers:
  - keyword one
  - keyword two
permissions:
  - src/**
  - docs/**
---
```

The frontmatter mirrors `manifest.json`. Both must be consistent. The `manifest.json` is used for loading/registration; the `SKILL.md` frontmatter is used by the agent runtime.

### Body Structure

The body provides instructions to the AI agent. Use clear, imperative language:

```markdown
# My Plugin Skill

Brief description of what this skill does and when to use it.

## Workflow

Step-by-step instructions the agent must follow:

1. **First step** — describe what to do
2. **Second step** — describe what to do
3. **Third step** — describe what to do

## Rules

- Rule 1: Must always do X
- Rule 2: Never do Y
- Rule 3: When Z happens, do W

## Output Format

Describe the expected output structure:

```
Result Summary:
  Items processed: `<N>`
  Status: `<OK | ERROR>`
  Details: <description>
```

## When to Use

- Situation where this skill applies
- Another situation
- Edge case to be aware of
```

### Writing Tips

- **Be explicit** — agents follow instructions literally; ambiguity causes errors
- **Use numbered steps** for ordered workflows, bullet points for unordered rules
- **Include output format** — workers need to know what format to produce
- **Add examples** — code blocks with realistic inputs/outputs
- **Specify constraints** — what the skill should NOT do is as important as what it should do
- **Reference project conventions** — mention ADRs, patterns, or file locations relevant to the skill

### Model Selection Guide

| Model | Use When |
|-------|----------|
| `claude-haiku-4-5-20251001` | Simple transformations, formatting, low-complexity tasks |
| `claude-sonnet-5` | Standard implementation, analysis, documentation |
| `claude-opus-4-8` | Security-sensitive, complex logic, architecture decisions |

---

## 5. Hook System

Hooks let plugins inject behavior at specific points in the sprint lifecycle. There are four hook points:

### Hook Points

| Hook | When It Runs | Context Available |
|------|-------------|-------------------|
| `beforeSprint` | After planning, before workers start | `sprintId`, `tasks[]`, `config`, `projectRoot` |
| `afterSprint` | After all workers complete, before retro | `sprint`, `projectRoot` |
| `beforeTask` | Before a single worker begins | `task`, `projectRoot` |
| `afterTask` | After a single worker finishes | `task`, `result`, `projectRoot` |

### Hook Context Types

```typescript
// beforeSprint
interface BeforeSprintContext {
  hook: 'beforeSprint';
  sprintId: string;
  tasks: Task[];
  config: ResolvedConfig;
  projectRoot: string;
}

// afterSprint
interface AfterSprintContext {
  hook: 'afterSprint';
  sprint: Sprint;
  projectRoot: string;
}

// beforeTask
interface BeforeTaskContext {
  hook: 'beforeTask';
  task: Task;
  projectRoot: string;
}

// afterTask
interface AfterTaskContext {
  hook: 'afterTask';
  task: Task;
  result: TaskResult;
  projectRoot: string;
}
```

### Declaring Hooks in manifest.json

```json
{
  "hooks": {
    "beforeSprint": "hooks/before-sprint.md",
    "afterSprint": "hooks/after-sprint.md",
    "beforeTask": "hooks/before-task.md",
    "afterTask": "hooks/after-task.md"
  }
}
```

The value is a path (relative to the plugin directory) to an instruction file for the hook. The Brain reads this file and executes its instructions at the appropriate lifecycle point.

### Hook Behavior

- Hooks are **non-fatal** — if a hook fails, the sprint continues
- Hooks run **sequentially** in registration order
- Hooks from **multiple plugins** all run at each lifecycle point
- Use `clearHooks()` to reset hook state between sprints (handled by Brain automatically)

### Hook Use Cases

**`beforeSprint`** — Useful for:
- Validating environment prerequisites
- Fetching external data needed by tasks
- Setting up shared state or config

**`afterSprint`** — Useful for:
- Posting results to external systems (CI, Slack, etc.)
- Generating reports or summaries
- Cleanup of temporary resources

**`beforeTask`** — Useful for:
- Acquiring external locks or resources
- Pre-loading data for a specific task

**`afterTask`** — Useful for:
- Recording task metrics
- Triggering downstream automation
- Releasing resources acquired in `beforeTask`

---

## 6. Creating a Plugin

### Using the CLI (Recommended)

```bash
deckent plugin create <name>
```

This scaffolds a new plugin directory with `manifest.json`, `SKILL.md`, and `README.md`.

**Example:**

```bash
deckent plugin create security-scanner
```

Creates:
```
.deckent/plugins/security-scanner/
  manifest.json   ← pre-filled with name and version 0.1.0
  SKILL.md        ← template with frontmatter
  README.md       ← template with standard sections
```

### Manual Creation

1. Create the plugin directory:
   ```bash
   mkdir .deckent/plugins/my-plugin
   ```

2. Create `manifest.json`:
   ```json
   {
     "name": "my-plugin",
     "version": "0.1.0",
     "description": "My plugin description",
     "entrypoint": "SKILL.md",
     "enabled": true,
     "model": "sonnet",
     "triggers": ["my trigger phrase"],
     "permissions": ["src/**"]
   }
   ```

3. Create `SKILL.md` with frontmatter and body (see [Section 4](#4-skillmd-writing-guide))

4. Create `README.md` documenting the plugin

### Verifying Your Plugin

After creating, verify it loads correctly:

```bash
# List all installed plugins
deckent plugin list

# Validate manifest + entrypoint
deckent plugin test <name>
```

If your plugin does not appear, check:
- `manifest.json` is valid JSON
- All required fields are present and non-empty
- `name` field matches the directory name

---

## 7. Installing and Managing Plugins

### Install from Local Path

```bash
deckent plugin install /path/to/my-plugin
```

Copies the plugin directory into `.deckent/plugins/`.

### Install from Git URL

```bash
deckent plugin install https://github.com/user/deckent-my-plugin.git
```

Clones the repository into `.deckent/plugins/<name>` where `<name>` comes from the manifest.

### List Installed Plugins

```bash
deckent plugin list

# JSON output (pipe-friendly)
deckent plugin list --json
```

Shows all installed plugins with their version and description. Warns if a plugin's entrypoint file is missing.

### Enable / Disable

There is no CLI command for enable/disable. Set the `"enabled"` field directly in the plugin's `manifest.json`:

```json
{
  "enabled": false
}
```

Save the file — the next sprint load picks up the change. The `scanPlugins()` loader reads all plugins from disk; whether one is "active" depends on the `enabled` field.

### Update a Plugin

```bash
deckent plugin update <source>
```

Accepts the same `<source>` formats as `install` (npm package, git URL, local path). Replaces the installed version in place.

### Inspect a Plugin

```bash
deckent plugin info <dir>
```

Shows manifest fields and validates that the entrypoint file exists. Accepts an absolute or project-relative path to a plugin directory.

### Test a Plugin

```bash
deckent plugin test <name>
```

Validates the manifest and entrypoint for an already-installed plugin. Runs hooks if available. Reports PASSED or FAILED.

### Remove a Plugin

```bash
deckent plugin remove my-plugin
```

Permanently deletes the plugin directory. System plugins (`"system": true`) cannot be removed.

---

## 8. Publishing a Plugin

### Repository Structure

Publish your plugin as a standalone Git repository. Recommended layout:

```
deckent-my-plugin/          ← repo root (name it deckent-<plugin-name>)
  manifest.json             ← at root level
  SKILL.md                  ← at root level
  README.md                 ← user documentation
  hooks/                    ← optional: hook instruction files
    before-sprint.md
    after-sprint.md
  examples/                 ← optional: usage examples
  CHANGELOG.md              ← version history
```

### Naming Convention

- Repository: `deckent-<plugin-name>` (e.g., `deckent-security-scanner`)
- Plugin `name` field: `<plugin-name>` without the `deckent-` prefix (e.g., `security-scanner`)

### README Requirements

Your plugin's README should include:

1. **What it does** — clear one-paragraph description
2. **Installation** — `deckent plugin install <url>`
3. **Triggers** — what phrases activate this plugin
4. **Permissions** — what files/directories it accesses
5. **Hooks** — which lifecycle hooks it uses and what they do
6. **Configuration** — any customization options
7. **Changelog** — version history

### Versioning

Follow [Semantic Versioning](https://semver.org):

- `MAJOR.MINOR.PATCH`
- Bump `MAJOR` for breaking changes to the skill interface
- Bump `MINOR` for new features (new hooks, new triggers)
- Bump `PATCH` for bug fixes and clarifications

---

## 9. Best Practices

### Manifest

- **Keep `description` concise** — one line, under 80 characters
- **List specific triggers** — vague triggers cause unwanted activations
- **Scope permissions tightly** — only request access to directories your skill needs
- **Choose model appropriately** — prefer `sonnet` unless the task truly requires `opus`
- **Set `enabled: true` explicitly** — makes intent clear

### SKILL.md

- **Write for the agent, not for humans** — use imperative mood: "Read the file", not "You should read the file"
- **Order matters** — put the most important rules first
- **Be specific about output** — define exact format; agents will follow it
- **Include a "When to Use" section** — helps Brain route tasks to the right skill
- **Avoid ambiguous instructions** — "Do X or Y" leaves agents guessing; pick one

### Hooks

- **Keep hooks fast** — hooks block sprint execution; avoid network calls unless essential
- **Hooks must be idempotent** — sprints may retry; hooks may run multiple times
- **Handle errors gracefully** — hook failures are logged but non-fatal; write defensive code
- **Log what you do** — write output to stdout so it appears in sprint logs

### Testing

- Test your SKILL.md manually before publishing: spawn a worker with your plugin enabled and verify behavior
- Test your hooks by running a sprint in dry-run mode: `deckent start --dry-run`
- Verify your manifest validates: check `deckent doctor` for plugin errors

### Security

- **Never request permissions you don't need** — follow principle of least privilege
- **Don't store secrets in plugin files** — use environment variables
- **Validate external inputs** — if your hook fetches external data, validate it before use
- **Avoid shell string interpolation** — use array arguments to prevent injection

---

## 10. Example Plugin Walkthrough

This section builds a complete `dependency-checker` plugin step by step.

### Goal

Create a plugin that, after each sprint, checks for outdated npm dependencies and logs findings.

### Step 1: Scaffold the Plugin

```bash
deckent plugin create dependency-checker
```

### Step 2: Edit `manifest.json`

```json
{
  "name": "dependency-checker",
  "version": "0.1.0",
  "description": "Checks for outdated npm dependencies after each sprint",
  "entrypoint": "SKILL.md",
  "enabled": true,
  "model": "haiku",
  "triggers": [
    "check dependencies",
    "outdated packages",
    "npm audit",
    "dependency update"
  ],
  "permissions": [
    "package.json",
    "package-lock.json"
  ],
  "hooks": {
    "afterSprint": null
  },
  "dependencies": []
}
```

Note: `"afterSprint": null` declares awareness of the hook point without providing an instruction file. To activate, replace `null` with a path to a hook instructions file.

### Step 3: Write `SKILL.md`

```markdown
---
name: dependency-checker
version: 0.1.0
description: Checks for outdated npm dependencies
model: claude-haiku-4-5-20251001
triggers:
  - check dependencies
  - outdated packages
  - npm audit
  - dependency update
permissions:
  - package.json
  - package-lock.json
---

# Dependency Checker Skill

Check for outdated npm dependencies and report findings. Do not update packages — report only.

## Workflow

1. **Read package.json** — identify all dependencies and devDependencies
2. **Run outdated check** — execute `npm outdated --json` and capture output
3. **Parse results** — identify packages with available updates
4. **Categorize updates** — separate major (breaking) from minor/patch (safe)
5. **Report findings** — produce structured output (see Output Format)

## Rules

- Never run `npm update` or `npm install` — report only, do not modify
- Flag major version updates as HIGH priority (may contain breaking changes)
- Flag minor and patch updates as LOW priority (generally safe)
- Include current version, wanted version, and latest version for each package
- If `npm outdated` returns exit code 0 (no outdated packages), report "All dependencies up to date"

## Output Format

```
Dependency Check Results:
  Total packages checked: `<N>`
  Up to date: `<N>`
  Outdated: `<N>`

Outdated Packages:
  [HIGH - Major] <package>: <current> → <latest>
  [LOW - Minor]  <package>: <current> → <latest>
  [LOW - Patch]  <package>: <current> → <latest>

Recommendation: `<UP_TO_DATE | UPDATES_AVAILABLE | ACTION_REQUIRED>`
Notes: <any relevant context>
```

## When to Use

- After completing a sprint to identify accumulating tech debt
- When a sprint task involves updating dependencies
- When security vulnerabilities are suspected in dependencies
```

### Step 4: Write `README.md`

```markdown
# dependency-checker Plugin

Checks for outdated npm dependencies after each sprint and reports packages that need updating.

## Installation

```bash
deckent plugin install https://github.com/yourname/deckent-dependency-checker.git
```

## Triggers

This plugin activates on:
- "check dependencies"
- "outdated packages"
- "npm audit"
- "dependency update"

## Permissions

Reads: `package.json`, `package-lock.json`
Writes: nothing (report only)

## Output

Reports categorized list of outdated packages with update priority.
```

### Step 5: Verify

```bash
# List plugins — should show dependency-checker
deckent plugin list

# Run doctor to validate manifest
deckent doctor

# Test with dry run
deckent start --dry-run
```

### Step 6: Test the Skill

Create a test task that invokes the skill:

```json
{
  "title": "Check npm dependencies",
  "description": "Run dependency checker to find outdated packages",
  "model": "haiku",
  "effort": "low"
}
```

Start the sprint and verify the worker follows the SKILL.md instructions correctly.

### Step 7: Publish

Once satisfied with the plugin:

1. Create a Git repository named `deckent-dependency-checker`
2. Push your plugin directory contents to the repo root
3. Tag the release: `git tag v0.1.0 && git push --tags`
4. Users install with: `deckent plugin install https://github.com/yourname/deckent-dependency-checker.git`

---

## Quick Reference

### Plugin File Checklist

- [ ] `manifest.json` — all required fields present and valid
- [ ] `SKILL.md` — frontmatter + body with Workflow, Rules, Output Format, When to Use
- [ ] `README.md` — description, installation, triggers, permissions, hooks
- [ ] Directory name matches `name` in manifest
- [ ] `enabled: true` set explicitly

### manifest.json Required Fields

```json
{
  "name": "string (kebab-case, matches dir name)",
  "version": "string (semver)",
  "description": "string (non-empty)",
  "entrypoint": "string (path to SKILL.md)"
}
```

### Hook Points Summary

| Hook | Timing |
|------|--------|
| `beforeSprint` | After plan, before any worker starts |
| `afterSprint` | After all workers done, before retro |
| `beforeTask` | Before each individual task |
| `afterTask` | After each individual task |

### Model Selection

| Model | Best For |
|-------|---------|
| `claude-haiku-4-5-20251001` | Simple checks, formatting, low-complexity |
| `claude-sonnet-5` | Standard implementation, analysis, docs |
| `claude-opus-4-8` | Security, complex logic, architecture |

### Plugin CLI Commands

| Command | Description |
|---------|-------------|
| `deckent plugin create <name>` | Scaffold a new plugin (manifest + SKILL.md + README.md) |
| `deckent plugin install <source>` | Install from npm, git URL, or local path |
| `deckent plugin update <source>` | Update an installed plugin in place |
| `deckent plugin list [--json]` | List installed plugins |
| `deckent plugin info <dir>` | Show manifest info + validate entrypoint |
| `deckent plugin test <name>` | Validate manifest + entrypoint, run hooks |
| `deckent plugin remove <name>` | Delete an installed plugin |

Enable/disable is done by setting `"enabled": true/false` in `manifest.json` — no dedicated CLI subcommand.
