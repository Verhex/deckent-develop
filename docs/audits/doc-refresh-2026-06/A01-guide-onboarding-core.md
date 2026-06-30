# A01 — Guide Onboarding Core Audit

**Sprint:** 345  
**Task:** 345-001  
**Date:** 2026-06-28  
**Auditor:** w-345-001 (doc-writer)  
**Scope:** `docs/guide/getting-started.md`, `docs/guide/getting-started-en.md`, `docs/guide/installation.md`, `docs/guide/quickstart.md`

---

## Summary

Four onboarding documents verified against `src/cli/entry.ts`, `src/cli/index.ts`, individual command files, `src/cli/helpers/output.ts`, and `src/mcp/tools/index.ts`. All main commands and flags confirmed present. Three shared structural issues found across all four docs (doctor output labels, doctor format, stale MCP tool count), one quickstart-specific ordering bug, and one TR/EN content drift between the two getting-started variants.

**Overall verdict:** Docs are largely accurate for the happy path (install → init → plan → start → status), but the doctor output examples in all four files are demonstrably wrong and will mislead users on their first health-check run.

---

## Doc 1: `docs/guide/getting-started.md`

### Commands and Flags Verified

| Documented Command | Status | Source |
|---|---|---|
| `npm install -g deckent` | ✓ PASS | `package.json:6-8` (bin: `deckent`) |
| `deckent --version` | ✓ PASS | `src/cli/index.ts:84` (`-V, --version`) |
| `deckent doctor` | ✓ PASS | `src/cli/commands/doctor.ts:1391` |
| `npx deckent init` / `deckent init` | ✓ PASS | `src/cli/commands/init.ts:310` |
| `deckent set-directives --file goals.md` | ✓ PASS | `src/cli/commands/set-directives.ts:33,35` |
| `deckent set-directives --content "<text>"` (documented inline) | ✓ PASS | `src/cli/commands/set-directives.ts:35` |
| `deckent plan` | ✓ PASS | `src/cli/commands/plan.ts:84` |
| `deckent start` | ✓ PASS | `src/cli/commands/start.ts:160` |
| `deckent status` | ✓ PASS | `src/cli/commands/status.ts:328` |
| `deckent status --watch` | ✓ PASS | `src/cli/commands/status.ts:330` |
| `deckent chat` | ✓ PASS | `src/cli/commands/chat.ts:415` |
| `deckent web` (port 3100) | ✓ PASS | `src/cli/commands/web.ts:29,31` |
| `deckent config set <key> <value>` | ✓ PASS | `src/cli/commands/config.ts:111` |

### Init Wizard Prompt Order

Documented: Language → Plan mode → Project name  
Actual: Language → Plan mode → Project name (`src/cli/commands/init.ts:364-376`)  
**Status: ✓ PASS**

### Links

| Link | Target File | Status |
|---|---|---|
| `/reference/multi-provider` | `docs/reference/multi-provider.md` | ✓ EXISTS |
| `chat-mode.md` | `docs/guide/chat-mode.md` | ✓ EXISTS |
| `/guide/concepts` | `docs/guide/concepts.md` | ✓ EXISTS |
| `/guide/first-sprint` | `docs/guide/first-sprint.md` | ✓ EXISTS |
| `installation.md` | `docs/guide/installation.md` | ✓ EXISTS |
| `/reference/cli` | `docs/reference/cli.md` | ✓ EXISTS |
| `/reference/config` | `docs/reference/config.md` | ✓ EXISTS |
| `/reference/api` | `docs/reference/api.md` | ✓ EXISTS |

### Issues

#### ISSUE G1.1 — Doctor output check labels wrong (CRITICAL, all 4 docs)

**Location:** `docs/guide/getting-started.md:43-48` (and matching lines in all four audited docs)

**Documented (all 4 docs):**
```
  node_version   v24.0.0 (>=24 required)      [pass]
  git            git 2.43.0                    [pass]
  tmux           tmux 3.3a                     [pass]
  claude_cli     claude 1.2.3                  [pass]
  workspace      .deckent/ not found           [fail]
```

**Actual output (from `src/cli/commands/doctor.ts:111,125,164,176,192,202` + `src/cli/helpers/output.ts:211-219`):**
```
  [PASS] Node.js        v24.0.0 (>=24 required)
  [PASS] git            git 2.43.0
  [PASS] tmux           tmux 3.3a
  [PASS] Claude CLI     claude 1.2.3
  [FAIL] Workspace      .deckent/ not found
```

Three label mismatches:
- `node_version` → actual `Node.js` (`doctor.ts:111,125`)
- `claude_cli` → actual `Claude CLI` (`doctor.ts:176,192`)
- `workspace` → actual `Workspace` (`doctor.ts:202`)

Format also wrong: docs show trailing `[pass]`/`[fail]`; actual is leading `[PASS]`/`[FAIL]` (`output.ts:214,217`).

**Affects:** `getting-started.md:43-48`, `getting-started-en.md:43-48`, `installation.md:67-73`, `quickstart.md:77-83`

---

#### ISSUE G1.2 — MCP tools count stale

**Location:** `docs/guide/getting-started.md:101`

**Documented:** "giving the assistant access to all 34 Deckent tools"

**Actual:** 37 tools registered in `src/mcp/tools/index.ts:60-96`

**Affects:** `getting-started.md:101`, `getting-started-en.md:101`

---

## Doc 2: `docs/guide/getting-started-en.md`

### Commands and Flags Verified

Same command set as `getting-started.md` — all confirmed ✓ (see Doc 1 table above; files are structurally identical).

### TR/EN Drift (getting-started.md ↔ getting-started-en.md)

| Location | getting-started.md | getting-started-en.md | Verdict |
|---|---|---|---|
| Line 113 | "naïve and task-driven conversations" | "conversational and task-driven sessions" | DRIFT — "naïve" is incorrect in this context; EN version wording is correct |
| Throughout | Uses `--` (double hyphen) as em-dash substitute | Uses `—` (actual em-dash) | DRIFT — typography inconsistency; EN version is correct |

#### ISSUE G2.1 — Wording drift on line 113

**getting-started.md:113:** `See [Chat Mode](chat-mode.md) for a complete walkthrough of naïve and task-driven conversations.`  
**getting-started-en.md:113:** `See [Chat Mode](chat-mode.md) for a complete walkthrough of conversational and task-driven sessions.`

The word "naïve" in `getting-started.md` is incorrect for this context. The EN variant ("conversational") is the intended meaning.

#### ISSUE G2.2 — Em-dash typography inconsistency

`getting-started.md` uses `--` throughout (double hyphen), while `getting-started-en.md` uses `—` (Unicode em-dash). Both are the same language (English), so the typographic inconsistency is a maintenance drift signal.

### Issues (same as Doc 1)

- **G1.1** also applies: `getting-started-en.md:43-48` — doctor output labels/format wrong.
- **G1.2** also applies: `getting-started-en.md:101` — MCP tools count "34" (actual 37).

---

## Doc 3: `docs/guide/installation.md`

### Commands and Flags Verified

| Documented Command | Status | Source |
|---|---|---|
| `npx deckent@latest init` | ✓ PASS | `src/cli/commands/init.ts:310` |
| `npx deckent@latest init --yes` | ✓ PASS | `src/cli/commands/init.ts:321` (`-y, --yes`) |
| `npx deckent@latest init --no-install` | ✓ PASS | `src/cli/commands/init.ts:322` (`--no-install`) |
| `npm install -g deckent` | ✓ PASS | standard npm |
| `deckent --version` | ✓ PASS | `src/cli/index.ts:84` |
| `deckent init` | ✓ PASS | `src/cli/commands/init.ts:310` |
| `deckent doctor` | ✓ PASS | `src/cli/commands/doctor.ts:1391` |
| `deckent config set spawn_backend docker` | ✓ PASS | `src/cli/commands/config.ts:111` (`set <key> <value>`) |
| `deckent upgrade --local <path>` | ✓ PASS | `src/cli/commands/upgrade.ts:436` (`--local <path>`) |
| `npm update -g deckent` | ✓ PASS | standard npm |

### Links

| Link | Target | Status |
|---|---|---|
| `../reference/multi-provider.md` | `docs/reference/multi-provider.md` | ✓ EXISTS |
| `docker-backend.md` | `docs/guide/docker-backend.md` | ✓ EXISTS |
| `quickstart.md` | `docs/guide/quickstart.md` | ✓ EXISTS |
| `getting-started.md` | `docs/guide/getting-started.md` | ✓ EXISTS |
| `../reference/config-reference.md` | `docs/reference/config-reference.md` | ✓ EXISTS |
| Troubleshooting GitHub URL | `https://github.com/VerhexIO/deckent/blob/main/docs/development/troubleshooting.md` | ⚠ EXTERNAL — local file exists at `docs/development/troubleshooting.md`; GitHub URL is an external link that could break on repo rename/move |

### Node.js Version Table

Documented: 24.x (minimum), 26.x supported, 22.x and below not supported.  
Actual: `package.json` `"engines": { "node": ">=24.0.0" }` — table is **✓ ACCURATE**.

### Issues

- **G1.1** also applies: `installation.md:67-73` — doctor output labels/format wrong.

---

## Doc 4: `docs/guide/quickstart.md`

### Commands and Flags Verified

| Documented Command | Status | Source |
|---|---|---|
| `npx deckent@latest init` | ✓ PASS | `src/cli/commands/init.ts:310` |
| `npm install -g deckent` | ✓ PASS | standard npm |
| `deckent --version` | ✓ PASS | `src/cli/index.ts:84` |
| `deckent doctor` | ✓ PASS | `src/cli/commands/doctor.ts:1391` |
| `deckent init` | ✓ PASS | `src/cli/commands/init.ts:310` |
| `deckent plan` | ✓ PASS | `src/cli/commands/plan.ts:84` |
| `deckent start` | ✓ PASS | `src/cli/commands/start.ts:160` |
| `deckent start --dry-run` | ✓ PASS | `src/cli/commands/start.ts:165` |
| `deckent start --auto-approve` | ✓ PASS | `src/cli/commands/start.ts:162` |
| `deckent web` (port 3100) | ✓ PASS | `src/cli/commands/web.ts:31` |
| `deckent status` | ✓ PASS | `src/cli/commands/status.ts:328` |
| `deckent status --watch` | ✓ PASS | `src/cli/commands/status.ts:330` |
| `deckent status --json` | ✓ PASS | `src/cli/commands/status.ts:332` |
| `deckent history` | ✓ PASS | `src/cli/commands/history.ts:224` |
| `deckent retro` | ✓ PASS | `src/cli/commands/retro.ts:336` |
| `deckent recall "authentication"` | ✓ PASS | `src/cli/commands/recall.ts:14` (`recall <query>`) |

### Init Wizard Prompt Order

**ISSUE Q4.1 — Wizard prompt order wrong (CRITICAL)**

**Location:** `docs/guide/quickstart.md:100-106`

**Documented order:**
1. Project name
2. Plan mode
3. Language

**Actual order (from `src/cli/commands/init.ts:364-376`):**
1. Language (`promptSelect` at line 364)
2. Plan mode (`promptSelect` at line 369)
3. Project name (`promptText` at line 376)

The quickstart is the canonical "5 minutes" guide. Having the first prompt described incorrectly will confuse first-time users who expect to enter a project name first but instead see a language selector.

### Plan Mode Options

Quickstart.md documents: Performance (8 workers, Opus), Balanced (5 workers, Sonnet), Economic (3 workers), API (10 workers, API-key).  
Actual (`src/cli/commands/init.ts:370-373`):
- `Performance — 8 workers, premium tier brain + workers` ✓
- `Balanced — 5 workers, standard brain + premium workers` ✓ (doc says "Sonnet" but code says "standard brain" — minor)
- `Economic — 3 workers, standard tier only` ✓
- `API (pay-as-you-go) — 10 workers, premium brain + standard workers` ✓

All plan modes are correct. The "Sonnet" label in the doc is an interpretive addition not in the code, but not incorrect.

### Links

| Link | Target | Status |
|---|---|---|
| `../reference/config-reference.md` | `docs/reference/config-reference.md` | ✓ EXISTS |
| `../reference/api.md` | `docs/reference/api.md` | ✓ EXISTS |
| `../reference/mcp-guide.md` | `docs/reference/mcp-guide.md` | ✓ EXISTS |
| `../reference/multi-provider.md` | `docs/reference/multi-provider.md` | ✓ EXISTS |
| `../reference/glossary.md` | `docs/reference/glossary.md` | ✓ EXISTS |

### Issues

- **G1.1** also applies: `quickstart.md:77-83` — doctor output labels/format wrong.
- **Q4.1** above — wizard prompt order wrong.

---

## Issue Index

| ID | Severity | Affects | Description |
|---|---|---|---|
| G1.1 | HIGH | All 4 docs | `deckent doctor` output check labels and format are wrong. Labels `node_version`/`claude_cli`/`workspace` don't match code (`Node.js`/`Claude CLI`/`Workspace`); `[pass]`/`[fail]` trailing format doesn't match actual leading `[PASS]`/`[FAIL]`. Source: `doctor.ts:111,125,164,176,192,202` + `output.ts:214,217`. |
| G1.2 | MEDIUM | `getting-started.md:101`, `getting-started-en.md:101` | MCP tools count documented as "34" but actual is 37. Source: `src/mcp/tools/index.ts:60-96`. |
| G2.1 | MEDIUM | `getting-started.md:113` | Word "naïve" is wrong; `getting-started-en.md:113` has correct wording ("conversational"). |
| G2.2 | LOW | `getting-started.md` throughout | Uses `--` (double hyphen) while `getting-started-en.md` uses `—` (em-dash). Typography inconsistency. |
| Q4.1 | HIGH | `quickstart.md:100-106` | Init wizard prompt order documented as Project name → Plan mode → Language; actual code order is Language → Plan mode → Project name. Source: `init.ts:364-376`. |
| I3.1 | LOW | `installation.md:157` | Troubleshooting link is a GitHub URL (`https://github.com/VerhexIO/deckent/...`). Local file exists at `docs/development/troubleshooting.md` but external link could break. |

---

## Recommended Fixes (Scope: docs/guide/ only)

1. **All 4 docs — G1.1**: Replace the `deckent doctor` example output block with the real format:
   ```
     [PASS] Node.js        v24.0.0 (>=24 required)
     [PASS] git            git 2.43.0
     [PASS] tmux           tmux 3.3a
     [PASS] Claude CLI     claude 1.2.3
     [FAIL] Workspace      .deckent/ not found
   ```
2. **getting-started.md + getting-started-en.md — G1.2**: Update "34 Deckent tools" → "37 Deckent tools".
3. **getting-started.md — G2.1**: Fix line 113: replace "naïve and task-driven conversations" → "conversational and task-driven sessions".
4. **quickstart.md — Q4.1**: Fix init wizard prompt order to Language → Plan mode → Project name.
