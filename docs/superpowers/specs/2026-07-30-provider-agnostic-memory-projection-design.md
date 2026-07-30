# Provider-Agnostic Core-Memory Projection — Design (rev 2)

- **Date:** 2026-07-30 (rev 2 — same day, after owner P0 review)
- **Owner:** Alperen (round-1 decisions approved in session; rev 2 incorporates the owner's P0 review verbatim)
- **Status:** revised design — pending owner approval; implementation not started
- **Scope decision:** product feature + dogfood (deckent gains the capability; deckent-dev consumes it)
- **Approach decision:** A — sibling module + shared assistant-surface registry (rule-generator untouched behaviorally)

## Problem

Dogfood core-memory has a single authority — `.deckent/docs/core-memory/` (MEMORY.md index + law/feedback files) — but its projection mechanism is single-target (`scripts/sync-core-memory.mjs --target <one path>`) and the Stop hook that drives it is broken (still passes the removed `--backup` flag, so projection has been silently dead since memory-reform-2, commit `0d94ee12`).

Goal: make the memory usable by **all** assisting surfaces — Claude Code, Codex, Gemini CLI, Cursor, Copilot — via each surface's native loading convention, as a product capability of deckent itself (DUAL LENS), not a repo-local script hack.

Non-goal: product Brain memory (`.brain/memory.db`, ADR-G-035) is a separate system and is not touched by this design.

## Decisions (owner-approved)

Round 1:
1. **Scope:** product feature + dogfood.
2. **Format:** native file + managed block per surface.
3. **Trigger:** `deckent sync` (CLI + MCP parity) + sprint-finalizer + repo Stop hook as thin consumer.
4. **Architecture:** Approach A — sibling module + shared registry; rule-generator not refactored in this slice.

Round 2 (owner P0 review, all verified against the codebase):
5. **Namespaced markers** — never reuse rule-generator's generic `AUTO-START/END`.
6. **Ownership manifest** — stale cleanup may delete only manifest-owned files.
7. **Native writable memory is off-limits** — Claude auto-memory dirs are never valid `extra_targets`.
8. **Registry is an assistant-surface registry**, not an execution-provider registry.
9. **Cursor skeleton exception** — `.mdc` frontmatter must be line 1.
10. **Copilot import + duplicate-context contract** — Copilot is not import-less; co-loaded instruction files must not duplicate the index.
11. **Index link rewrite contract** — mirror byte-verbatim; instruction block links deterministically rewritten.
12. **Shared workspace-sync service** — CLI, MCP and the compatibility wrapper call one service.

## Architecture

### `src/core/assistant-surface-registry.ts`

Single source of assistant-surface contracts. Runtime domain type is deliberately distinct from execution `ProviderName` (the codebase already separates these: `src/cli/commands/sync.ts:463` — "The keys identify supported host surfaces, not execution providers"; Cursor and Copilot are not execution providers).

```ts
type AssistantSurfaceId = 'claude-code' | 'codex' | 'gemini-cli' | 'cursor' | 'copilot';

interface AssistantSurface {
  id: AssistantSurfaceId;
  instructionFile: string;                     // repo-relative managed-block target
  memoryDir: string;                           // repo-relative projector-owned mirror dir
  instructionFormat: 'markdown' | 'mdc';
  importStyle: 'none' | 'at-relative';         // native import support in the instruction file
  coLoadedInstructionFiles: string[];          // other instruction files this surface also loads
  skeleton: 'markdown-title' | 'mdc-always-apply';
}
```

The JSON config key stays `providers` (owner decision); it is mapped to `AssistantSurfaceId` at resolution time and never mixes with execution `ProviderName`.

### Surface target table

| Surface | Memory file mirror (projector-owned) | Managed block target | importStyle | Notes |
|---|---|---|---|---|
| claude-code | `.claude/memory/*.md` | `CLAUDE.md` | at-relative | |
| codex | `.codex/memory/*.md` | `AGENTS.md` | none | `.codex/memory/` is **projector-owned supporting storage**, not native Codex memory; Codex's guaranteed repo surface is `AGENTS.md`, whose instruction chain defaults to a **32 KiB** limit — the embedded index must stay well under it. Ref: Codex AGENTS.md contract (learn.chatgpt.com/docs/agent-configuration/agents-md.md). |
| gemini-cli | `.gemini/memory/*.md` | `GEMINI.md` | at-relative | |
| cursor | `.cursor/memory/*.md` | `.cursor/rules/memory.mdc` | none | `.mdc` file MUST begin at line 1 with frontmatter:<br>`---`<br>`description: Deckent core-memory index`<br>`globs:`<br>`alwaysApply: true`<br>`---`<br>then the managed block. Ref: Cursor Rules (docs.cursor.com/context/rules). |
| copilot | `.github/deckent-memory/*.md` | `.github/copilot-instructions.md` | at-relative | Copilot CLI supports `@relative/path` imports **and co-loads** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` alongside its own file. Duplicate-free contract below. Ref: GitHub Copilot custom instructions (docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions). |

**Copilot duplicate-free contract:** because Copilot co-loads other surfaces' instruction files, its own block must NOT re-embed the index. The copilot renderer emits a short pointer block (source header + `@`-import of the mirror index / relative link), and the registry's `coLoadedInstructionFiles` capability is what the renderer keys on — any future surface with co-loading gets the same treatment. Rollout includes a live `/instructions` verification, not just a structural test.

### Managed block contract — namespaced markers

`rule-generator.ts:15` owns the generic `<!-- AUTO-START -->` markers (now visible in live `CLAUDE.md` / `.claude/rules/*`). Memory projection uses its own namespace:

```
<!-- DECKENT:CORE-MEMORY:AUTO-START -->
...
<!-- DECKENT:CORE-MEMORY:AUTO-END -->
```

- Everything outside the namespaced pair is **opaque owner-authored content** — never parsed, never rewritten.
- Missing one marker, reversed order, or more than one pair ⇒ **typed error** for that target (surface-isolated); the generator never guesses.
- Markers absent entirely ⇒ block appended at end of file. Instruction file absent ⇒ created per the surface's `skeleton` capability: `markdown-title` = one `# <project> — assistant instructions` title line + block, nothing else; `mdc-always-apply` = the frontmatter above + block.

### Index rendering contract

- **Mirror `MEMORY.md`:** byte-verbatim copy of the authority index.
- **Instruction-block index:** label/order/text preserved; link targets deterministically rewritten from instruction-file-relative to the surface's mirror dir (authority-relative `law_x.md` links would break if embedded verbatim into a root-level `AGENTS.md`).
- Surfaces with `importStyle: 'at-relative'` may render the index via native `@relative/path` import instead of embedding.
- Codex embeds the rewritten index directly (no import support), bounded by the 32 KiB chain budget.

### Ownership manifest — the only deletion authority

The current script deletes every non-authority `*.md` in the target (`scripts/sync-core-memory.mjs:112`) — destructive against foreign files. Replacement: each target dir carries a stable manifest:

```json
{
  "schemaVersion": 1,
  "authorityDigest": "sha256:…",
  "ownedFiles": { "MEMORY.md": "sha256:…", "law_x.md": "sha256:…" }
}
```

- Only files listed as owned in the **previous** manifest may be deleted as stale.
- Foreign files are preserved and reported (`foreignFilesPreserved`).
- **Deprovision:** a target present in a previous manifest but absent from the resolved surface set is deprovisioned deterministically — owned files + managed block removed, manifest removed, all reported in `filesDeleted`. `enabled: false` ⇒ zero writes; orphaned managed artifacts surface as drift in `--check` and are removable only via explicit `deckent sync --memory-deprovision`.

### `src/core/memory-projection-generator.ts`

Follows `rule-generator.ts` discipline (per-target isolation, marker hygiene) with the rev-2 contracts above. Write safety:

- per-file **temp-file + atomic rename**;
- **symlink escape fail-closed** — a target path resolving outside its declared dir is a typed error, never followed;
- **project-scoped projection lock** — Stop hook, CLI and finalizer can race; a lock file under `.deckent/` serializes runs (stale-lock timeout + honest error, consistent with `.locks/` conventions).

### Result contract (string-free generator)

```ts
interface MemoryProjectionResult {
  mode: 'write' | 'check' | 'dry-run';
  authorityDigest?: string;
  filesWritten: string[];
  filesDeleted: string[];
  filesUnchanged: string[];
  driftedFiles: string[];
  foreignFilesPreserved: string[];
  targets: TargetResult[];
  errors: ProjectionError[];
}

interface TargetResult {
  surface: AssistantSurfaceId | 'extra-target';
  targetDir: string;
  state: 'written' | 'unchanged' | 'drifted' | 'deprovisioned' | 'error' | 'held';
  manifestUpdated: boolean;
}

interface ProjectionError {
  code: string;                 // stable machine code
  surface: AssistantSurfaceId | 'extra-target';
  operation: 'mirror' | 'block' | 'manifest' | 'deprovision' | 'lock';
  path: string;
  messageKey: string;           // i18n key — CLI/MCP render via getMessage()
  params?: Record<string, string>;
}
```

The generator emits no user-facing strings; CLI/MCP render `messageKey` via `getMessage` (en+tr, i18n-FIRST). Generated file content remains English mechanism-content (ADR-032 pattern, like rule-generator).

### Config (product-safe)

`memory_projection: { enabled?, providers?, extra_targets?, authority_dir? }` on `DeckentConfig` + `ResolvedConfig`.

- `enabled` **defaults to `false`**; deckent-dev's own config sets it explicitly `true` (dogfood enablement is a config change, not a code default).
- `providers` omitted while enabled ⇒ the full registry.
- `authority_dir` override must be **repo-relative and project-root-contained** (escape ⇒ typed config error).
- `extra_targets`: absolute paths **or** `~/`-prefixed with a cross-platform home resolver (Windows dahil). Accepted only for **isolated, projector-owned dirs**: each extra target gets the same ownership manifest, and a target that is a known native writable memory surface — starting with Claude's auto-memory `~/.claude/projects/<slug>/memory/` (Claude writes its own MEMORY.md/topic files there; ref: code.claude.com/docs/en/memory) — produces a high-severity typed warning/HOLD, never a silent overwrite. The legacy `DECKENT_MEMORY_PROJECTION_PATH` env target passes through the same guard.
- Config validation + `CONFIG_METADATA` + generated config reference + **both twin literals** (`loadConfig` `src/core/config.ts:2148`-area, `mergeConfigs` `:2964`-area) updated together; `config-flag-roundtrip` parity test covers the key (born-464 lesson).
- One-way absolute: `backup/restore/bidirectional` are typed errors in the product; timestamp newer-wins forbidden; projection target ≠ authority dir assert preserved.

### Shared workspace-sync service — CLI/MCP parity

Today CLI `sync` runs a broad pipeline (`src/cli/commands/sync.ts:659+`) while MCP `deckent_sync` only ensures the `@DECKENT.md` import in `CLAUDE.md`/`AGENTS.md` (`src/mcp/tools/sync.ts:8+`) — adding separate generator calls to each would not be parity. New shared service:

```ts
runWorkspaceSync({
  projectRoot,
  mode: 'write' | 'check' | 'dry-run',
  scope: 'all' | 'memory',
  resolvedConfig,
})
```

CLI, MCP and the compatibility wrapper call **only** this. Flag matrix (fixed):

| Flag | Behavior |
|---|---|
| `--git-only` | skips ALL managed-file sync, memory included |
| `--adapters-only` | adapter + memory projection, no git analysis |
| `--memory-only` | projection only (Stop hook / operational use) |
| `--dry-run` | no changes, drift report, exit 0 |
| `--check` | no changes; clean=0, drift=1, operational/config error=2 |
| `--check` + `--dry-run` | mutually exclusive ⇒ usage error |

MCP `deckent_sync` carries the same `mode`/`scope` arguments and returns the structured drift result.

### Sprint-finalizer — independent Step 5

Memory projection is NOT hidden inside the `onRuleRegen` callback. The numbered post-finalize contract (`src/core/identity-generator.ts:444+`, where rule regen is Step 4) gains an independent Step 5 with result fields:

```ts
memoryProjection: MemoryProjectionResult | null;
memoryProjectionCalled: boolean;
```

Default wiring happens in **one** central place — CLI finalize, Brain-driven finalize and the default finalizer must not each construct their own callback. A projection failure never rolls back the sprint result, but it is visible in the completion receipt, debug log and user notification — never buried in a log line alone.

### Dogfood consumers

- `.claude/settings.json` Stop hook → thin call into the shared service (`--memory-only` equivalent).
- `scripts/sync-core-memory.mjs` becomes a thin compatibility wrapper delegating to `runWorkspaceSync` (forbidden-mode guard and target≠authority assert preserved verbatim; legacy env target passes the native-memory guard).

## Data flow & invariants

```
.deckent/docs/core-memory/   (SINGLE authority)
        │  (one-way — never written back; lock-serialized)
        ▼
runWorkspaceSync(scope:'memory') → memory-projection-generator
        ├─ per-surface memoryDir mirror (manifest-owned, atomic, idempotent)
        ├─ per-surface instruction-file namespaced block (outside-block content opaque)
        ├─ extra_targets (projector-owned only; native-memory guard)
        └─ deprovision of surfaces removed from the resolved set (manifest-driven)
```

- Idempotent: identical content ⇒ zero writes (second run = 0 writes; Stop hook cost near-zero).
- Drift visibility: `--check` exit 1 + `driftedFiles`; operational/config error exit 2.

## Testing & rollout (revised order)

1. Spec + MASTER-PLAN reconciliation (below).
2. Assistant-surface registry, typed contracts, config validation/twins/CONFIG_METADATA.
3. Snapshot/digest + ownership manifest + atomic/locked projector.
4. Namespaced instruction-block renderers + all five surface adapter tests (incl. Cursor frontmatter-line-1, Copilot duplicate-free pointer, Codex 32 KiB bound, link-rewrite determinism).
5. Shared workspace-sync service; CLI/MCP parity, `--memory-only`/`--check` matrix + exit codes.
6. Finalizer Step 5 + structured settlement evidence (completion receipt visibility).
7. Thin compatibility wrapper + `.claude/settings.json:9` hook fix.
8. Dogfood config enablement (`enabled: true` in deckent-dev config).
9. Docs + generated-reference gates (`config-reference`, `features.md`, DECKENT.md).
10. Targeted hermetic tests (tmpdir, async spawn, ≤16 GB, VITEST_MAX_FORKS=2) → build → real-binary smoke → second run zero writes → `--check` clean.
    `Smoke: node dist/cli/entry.js sync --memory-only → 5 surfaces projected; rerun → 0 writes; --check → exit 0`
11. **Fresh-session host proof:** Claude context shows the index; Codex loaded instructions; Gemini `/memory show`; Cursor active rule; Copilot `/instructions`. An unreachable host is typed `unavailable`/HOLD — a structural test is never presented as live proof.

## MASTER-PLAN reconciliation (no duplicate row)

Existing rows already carry this work — reconcile, don't duplicate:

- **Row 190 `MEMORY-AUTHORITY-001`** (`docs/MASTER-PLAN.md:434`) — "Repo-local provider-neutral canonical memory; provider HOME surfaces projections only" — this design implements it; scope note extended from Claude/Codex/Gemini parity to **+ Cursor + Copilot**.
- **Row 230 `MEMORY-SYNC-001`** (`docs/MASTER-PLAN.md:438`) — acceptance currently includes "backup/restore", which conflicts with the approved one-way/forbidden-mode decision. Same-day amendment: acceptance becomes hash/revision conflict journal, **no silent delete (ownership manifest)**, dry-run/check, **one-way only + typed forbidden modes**, platform adapters, Cursor+Copilot coverage.

## References (owner-supplied)

- Claude memory contract: code.claude.com/docs/en/memory
- Cursor Rules (`.cursor/rules/*.mdc`, alwaysApply): docs.cursor.com/context/rules
- Copilot custom instructions + imports + co-loading: docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions
- Codex AGENTS.md contract (32 KiB chain default): learn.chatgpt.com/docs/agent-configuration/agents-md.md

## Follow-ups (explicitly out of this slice)

- rule-generator consuming `assistant-surface-registry` + Copilot rules adapter (separate MASTER-PLAN row).
- Host-global multi-target UX (`deckent config` helpers for `extra_targets`).
