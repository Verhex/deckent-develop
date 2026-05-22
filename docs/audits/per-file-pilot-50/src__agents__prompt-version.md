# Audit: `src/agents/prompt-version.ts`

**Sprint:** sprint-186 (per-file pilot — 50 task)
**Task:** 186-013
**File:** `src/agents/prompt-version.ts`
**LoC:** 226 (manifest declared 227 — −1 trailing newline drift, immaterial)
**Generated:** 2026-05-21

---

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/agents/prompt-version.ts` |
| LoC | 226 |
| Module type | TypeScript ESM class (`PromptVersionManager`) |
| Public exports | `interface PromptVersion`, `class PromptVersionManager` |
| Public methods | `createVersion`, `getVersion`, `getCurrentVersion`, `listVersions`, `activateVersion`, `updateVersionStats` (6 total) |
| Private methods | `_agentDir`, `_versionsDir`, `_versionFilePath`, `_currentFilePath`, `_promptFilePath`, `_saveVersionFile`, `_setCurrentVersion`, `_getCurrentVersionNumber`, `_writePromptFile`, `_pruneOldVersions` (10 total) |
| Imports | `node:fs` (`existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`, `readdirSync`, `unlinkSync`), `node:path` (`join`) |
| Runtime deps | None beyond Node stdlib — aligns with ADR-010 |
| Constants | `AGENTS_DIR = '.deckent/agents'`, `VERSIONS_SUBDIR = 'versions'`, `CURRENT_FILE = 'current.json'`, `PROMPT_FILE = 'PROMPT.md'`, `MAX_VERSIONS = 10` |

### Reverse dependencies (production)

| Consumer | Symbol | Notes |
|----------|--------|-------|
| `src/agents/prompt-rollback.ts:5` | `PromptVersionManager` (value) | Rollback orchestrator constructs the manager directly |
| `src/agents/prompt-analytics.ts:7` | `PromptVersion` (type-only) | Pure structural dependency — no runtime coupling |

### Reverse dependencies (tests)

| Test file | Symbol(s) | Cases |
|-----------|-----------|-------|
| `tests/agents/prompt-version.test.ts` | `PromptVersionManager`, `PromptVersion` | 22 `it()` cases in 6 `describe()` blocks (createVersion, getVersion, getCurrentVersion, listVersions, activateVersion, updateVersionStats) |
| `tests/agents/prompt-rollback.test.ts` | `PromptVersionManager` (value) | Uses manager as fixture builder (5 occurrences) |
| `tests/agents/prompt-metrics.test.ts` | `PromptVersion` (type) | Type-only |
| `tests/agents/prompt-analytics.test.ts` | `PromptVersion` (type) | Type-only |
| `tests/core/non-null-safety.test.ts` | `PromptVersion` (type) | Null-safety regression matrix |

---

## 2. Baglam (Architectural Context)

`PromptVersionManager` is the **persistence-layer primitive** for the agent prompt evolution pipeline. It owns the on-disk layout under `.deckent/agents/<agentId>/`:

```
.deckent/agents/<agentId>/
├── current.json         ← { currentVersion: <number> }
├── PROMPT.md            ← rendered active prompt body (consumed by worker prompt injection)
└── versions/
    ├── v1.json
    ├── v2.json          ← { version, content, reason, createdAt, stats: { uses, successRate } }
    └── ...
```

It is the **single writer** to this layout. Higher-level pipelines compose it:

- **`prompt-rollback.ts`** — reads version history, calls `activateVersion()` to revert
- **`prompt-evolution.ts` / `promotion-pipeline.ts`** (per CLAUDE.md architecture) — call `createVersion()` after an A/B-test promotion
- **`prompt-analytics.ts`** — read-only consumer of the `PromptVersion` shape (uses, successRate)
- **`agent-pool.ts`** — resolves the active `PROMPT.md` for worker prompt injection (downstream of `_writePromptFile`)

This module sits **below** the prompt-lifecycle policy layer (ADR-048) and **above** the filesystem. It encodes the **retention policy** (`MAX_VERSIONS = 10`) and the **success-rate accounting formula** (`(prevSuccessCount + isSuccess) / uses`).

Two evaluation outcomes are treated as success per the `updateVersionStats` contract: `DONE` and `GO_WITH_TECH_DEBT` — consistent with the worker self-assessment vocabulary defined in `docs/reference/api-surface.md`.

---

## 3. Debt Risk

| Risk | Severity | Location | Description |
|------|----------|----------|-------------|
| **Sync I/O on hot paths** | Medium | All public methods | Uses `readFileSync` / `writeFileSync` / `readdirSync`; ADR-005 marks Sync I/O as *deprecated*. Acceptable for low-frequency version writes but bypasses the ADR direction. |
| **Race condition on `createVersion`** | Medium | L34–L60 | `listVersions()` → `Math.max(...).version + 1` → `_saveVersionFile()` is non-atomic. Two concurrent callers can pick the same `nextVersion`, last-writer-wins overwrites version file. No advisory lock, no `wx` flag, no `.locks/` integration. |
| **`_writePromptFile` non-atomic** | Medium | L203–L207 | `writeFileSync(PROMPT.md, content)` is a single-shot write — partial writes on crash leave a truncated `PROMPT.md` that workers will then inject. Compare with `atomicWriteFileSync` pattern enshrined for heartbeats (Sprint 139 T13). |
| **Silent malformed-file swallow** | Medium | L72–73, L98–106, L195–199 | Every `JSON.parse` is wrapped in `try { … } catch {}` returning `null` / skipping the entry. Manifest corruption is invisible to Brain/Auditor — no log, no metric, no alert. |
| **`successRate` float drift** | Low | L142–L144 | Stored as a float, rounded back via `Math.round(rate * prevTotal)` to recover the success count. After enough updates the round-trip can off-by-one (e.g. 0.9999999 → 9 successes on 10 uses where 10 was correct). For analytics-grade tracking, store `successCount` directly. |
| **`_pruneOldVersions` best-effort** | Low | L209–L225 | `unlinkSync` wrapped in `try {} catch {}` — file leaks are invisible. Disk leak is bounded by external pruning, but the silent failure mirrors the JSON.parse pattern. |
| **No content-hash dedup** | Low | L33–L60 | A no-op `createVersion(agentId, sameContent, …)` still mints a fresh version, consuming a slot in the 10-version ring. Wastes a slot on no-change re-prompts. |
| **Missing `agentId` validation** | Low | All public methods | `agentId` is concatenated into a path with no sanitization — `'..'` or absolute paths escape the agents dir. Trusted-internal-caller assumption; not a CVE because Brain owns the call sites. |
| **Lossy stats reset on activate** | Note | — | `activateVersion()` re-writes `PROMPT.md` but does **not** zero or carry stats. Intentional design (stats are per-version), but worth documenting. |

---

## 4. Dead Code Candidates

Grep evidence (`grep -rn "PromptVersionManager\|from .*prompt-version" src/ tests/`):

| Member | Production callers | Test callers | Verdict |
|--------|-------------------|--------------|---------|
| `PromptVersionManager` (class) | 1 (`prompt-rollback.ts:5`) | 2 (`prompt-version.test.ts`, `prompt-rollback.test.ts`) | **Live** |
| `interface PromptVersion` | 1 (`prompt-analytics.ts:7` type-only) | 4 test files | **Live** (type) |
| `createVersion` | Indirect via promotion pipeline (see Baglam) | Yes | **Live** |
| `getVersion` | Within file (`getCurrentVersion`, `activateVersion`, `updateVersionStats`) + tests | Yes | **Live** |
| `getCurrentVersion` | No direct grep hits in `src/` outside file itself | Yes | **Suspect** — verify if `agent-pool.ts` or `worker-ipc.ts` reads `current.json` directly bypassing this API |
| `listVersions` | `prompt-rollback.ts` (semantic — verified by manager usage) | Yes | **Live** |
| `activateVersion` | `prompt-rollback.ts` (semantic) | Yes | **Live** |
| `updateVersionStats` | Promotion/evaluation pipeline (semantic) | Yes | **Live** — but grep this exact symbol across `src/orchestra/` to confirm wire-through |
| `_promptFilePath` | Used only by `_writePromptFile` | — | **Live (internal)** |
| `_currentFilePath` | Used by `_setCurrentVersion` / `_getCurrentVersionNumber` | — | **Live (internal)** |

> Two callsite-confirmation gaps remain for `getCurrentVersion` and `updateVersionStats` — flagged in §8 follow-ups.

---

## 5. Documentation Gaps

| Item | Current state | Gap |
|------|---------------|-----|
| File header doc-block | Single line: `// Prompt Version Manager — Manages versioned prompt history for agents. Max 10 versions per agent.` | No TSDoc class-level block. No reference to ADR-048. |
| `PromptVersion` interface | No field docs | Each field (`content`, `reason`, `stats`) should have one-liner TSDoc. `stats.successRate` semantics (when is it 0? float range?) are implicit. |
| `createVersion` | TSDoc present (2 lines) | Does not document the **race condition** caveat, the silent-overwrite-on-collision behaviour, or the `MAX_VERSIONS` pruning side-effect. |
| `getVersion` | TSDoc one-liner | Does not document the silent-null return for malformed JSON. |
| `updateVersionStats` | TSDoc one-liner | Does not enumerate which `evaluation` strings count as success (currently `'DONE'` and `'GO_WITH_TECH_DEBT'`). |
| `activateVersion` | TSDoc 2 lines | OK |
| Layout doc | None | The on-disk schema under `.deckent/agents/<agentId>/` is implicit. Should live in a top-of-file ASCII tree comment (see §2). |
| Cross-link to ADR-048 | Missing | Per ADR-036 mandatory governance, prompt-lifecycle modules should cite ADR-048 in their header. |
| README / `docs/reference/` | No reference page | The on-disk layout is not in `docs/reference/api-surface.md`. |

---

## 6. ADR Compliance Check

| ADR | Title | Applies? | Compliance | Evidence |
|-----|-------|----------|------------|----------|
| ADR-001 | TypeScript + ESM | Yes | ✅ | ESM imports with `.js` extensions for downstream consumers (`./prompt-version.js`), strict types, no `any`. |
| ADR-002 | Node16 Module Resolution | Yes | ✅ | All consumer imports use `.js` suffix (verified at `prompt-rollback.ts:5`, `prompt-analytics.ts:7`). |
| ADR-005 | Synchronous I/O | Yes (deprecated direction) | ⚠️ Partial | File uses `readFileSync`/`writeFileSync` throughout. ADR-005 status: **deprecated** — not strictly forbidden but new code should prefer async. Acceptable here (low-frequency); flag for future migration. |
| ADR-006 | spawnSync Security Pattern | No | n/a | No subprocess calls. |
| ADR-008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | Yes | ✅ | No imports from `orchestra/`, no imports from `brain.ts`. Pure leaf module. |
| ADR-010 | Tek Runtime Dependency | Yes | ✅ | Only `node:fs` and `node:path`. Zero third-party deps. |
| ADR-036 | ADR Governance Integration | Yes | ⚠️ Partial | Module does not reference ADR-048 in its header comment despite being the canonical implementation. Doc-only gap. |
| ADR-037 | Brain-Auditor-Worker Authority Matrix | Yes | ✅ | Writes only to `.deckent/agents/` (Brain-owned namespace per RBAC matrix). Worker scope cannot reach this path. |
| ADR-038 | Dead Code Disposition | Yes | ⚠️ | `getCurrentVersion` and `updateVersionStats` callsite confirmation pending (§4). |
| ADR-048 | Prompt Lifecycle Contract | **Yes — canonical** | ✅ Behavioural | This module **is** the storage half of the contract. `version`/`content`/`reason`/`createdAt`/`stats` shape and the `current.json` indirection match the contract semantics. No header cross-reference (see ADR-036 row). |

---

## 7. Refactor Recommendations

Ordered by ROI:

1. **Add advisory file lock on `createVersion`** (P1, ~20 LoC). Acquire a `.locks/agent-<id>-version.lock` via the existing `file-lock.ts` primitive (see Sprint 138 T4) or fall back to an atomic `writeFileSync(path, …, { flag: 'wx' })` probe loop. Prevents the version-collision race when two evolution paths fire on the same agent in the same sprint.
2. **Atomic write helper for `PROMPT.md` and `v*.json`** (P1, ~10 LoC). Apply the `atomicWriteFileSync` pattern (Sprint 139 T13 — `write tmp → rename`) so a crash mid-write never publishes a truncated prompt to workers.
3. **Surface JSON-parse failures** (P2, ~5 LoC). Replace silent `catch {}` with a `debugLog`/`emit('manifest_corruption', …)` call so Auditor can pick up corruption signals.
4. **Store `successCount` instead of `successRate`** (P2, ~10 LoC). Carry the integer; compute the float on read. Eliminates the round-trip rounding drift.
5. **Content-hash dedup in `createVersion`** (P2, ~5 LoC). If `sha256(content) === sha256(activeContent)` → return the active version without minting a new one. Reclaims the 10-slot ring from no-op writes.
6. **TSDoc the public surface + add file-level ASCII layout block** (P3, ~30 LoC). Covers §5 documentation gaps in one pass; lift the `.deckent/agents/<agentId>/` tree from this audit into a top-of-file comment.
7. **Add `agentId` whitelist regex** (P3, ~3 LoC). `/^[a-z0-9_-]+$/` guard at the top of every public method — defence-in-depth, even though Brain is the only caller.
8. **Cross-reference ADR-048 in the header** (P3, 1 line). Closes the ADR-036 doc gap.

Non-goals: no class-split needed; the 226 LoC are coherent around a single responsibility.

---

## 8. Sprint 188 Follow-up Items

| ID | Action | Owner | Files |
|----|--------|-------|-------|
| FU-186-013-A | Implement atomic-write + advisory lock on `createVersion`/`_writePromptFile` | bug-fixer | `src/agents/prompt-version.ts`, possibly `src/core/file-lock.ts` |
| FU-186-013-B | Confirm or remove dead methods — grep `getCurrentVersion`/`updateVersionStats` across `src/orchestra/` & `src/agents/` and either wire or delete | refactorer | `src/agents/prompt-version.ts` (audit only — write follow-up sprint) |
| FU-186-013-C | Add TSDoc to `PromptVersion` fields + class header + on-disk layout ASCII block (closes §5) | doc-writer | `src/agents/prompt-version.ts` |
| FU-186-013-D | Replace `successRate` float storage with integer `successCount` + migration shim for legacy `v*.json` files | refactorer | `src/agents/prompt-version.ts`, fresh test cases in `tests/agents/prompt-version.test.ts` |
| FU-186-013-E | Add ADR-048 reference to file header (ADR-036 governance compliance) | doc-writer | `src/agents/prompt-version.ts` |
| FU-186-013-F | Add `agentId` path-traversal guard (defence-in-depth, even though Brain is the only caller) | security-auditor | `src/agents/prompt-version.ts` |
| FU-186-013-G | Add on-disk layout to `docs/reference/api-surface.md` (under a new "Prompt Versioning" subsection) | doc-writer | `docs/reference/api-surface.md` |
| FU-186-013-H | Wire `debugLog`/event emission on JSON.parse failures (manifest corruption visibility) | bug-fixer | `src/agents/prompt-version.ts` |

---

## 9. Summary

`src/agents/prompt-version.ts` is a **healthy, well-scoped leaf module** (226 LoC, single class, zero third-party deps, 22-case unit test suite) that owns the on-disk persistence half of the agent prompt-lifecycle contract (ADR-048). ADR compliance is clean for the structural ADRs (001, 002, 008, 010, 037); behavioural debt clusters around three themes:

1. **Atomicity** — non-atomic `writeFileSync` + non-locking `createVersion` can corrupt the `PROMPT.md` consumed downstream by `agent-pool` and race on version numbers during parallel evolution.
2. **Observability** — every catch block swallows manifest corruption silently; the Auditor cannot see it.
3. **Documentation** — TSDoc is sparse, the on-disk layout is implicit, and the ADR-048 link is missing despite this module being the contract's canonical implementation.

No dead code is confirmed, but two methods (`getCurrentVersion`, `updateVersionStats`) need callsite verification across `src/orchestra/` to fully clear ADR-038. **Recommended disposition: keep, refactor in Sprint 188 with FU-186-013-A/B/C as the top wave** (atomicity + dead-code clearance + TSDoc).

Severity rollup: 0 P0 · 3 P1 · 3 P2 · 2 P3.
