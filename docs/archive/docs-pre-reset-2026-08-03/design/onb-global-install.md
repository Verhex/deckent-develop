# Global Install + Project Scope — Layer Model Design (ONB-GLOBAL)

**Master-Plan Reference:** Sıra-200 ONB-GLOBAL (P0 — "kesinlikle revize edilecek")
**ADR References:** ADR-G-001 (Layered Config & Scope Precedence — "Tomorrow" scope-aware resolution), ADR-G-017 (Multi-Project Isolation), ADR-D-002 (STATE-RESOLVER work-item), ADR-G-005 (Secret File System)
**Status:** Draft — design + first core slice only; **the ADR decision in §8 belongs to Alperen**
**Date:** 2026-07-02
**Author:** doc-writer agent (Sprint 361, Task 361-008)

---

## 1. Overview

deckent is moving from "cloned-repo tool" to a **globally installed product with per-project scope**: one `npm install -g` (or platform installer) serves every project on the machine, while each project keeps its own orchestration state. This document formalizes the two-scope layer model:

- **Global scope** (`~/.deckent` today; platform-correct directories tomorrow) — state that belongs to the *user + machine*, shared across all projects.
- **Project scope** (`.deckent/`, `.brain/`, `.tasks/`, `.locks/` under the repo root) — state that belongs to *one project*, never shared.

It delivers three things:

1. A **layer table** (§4): every existing state item classified global vs project, with a role (config / data / cache / state) and a rationale — including the **pivot rule** that learnings always stay project-scope.
2. A **platform matrix** (§5, Yasa#2): the platform-correct global-directory layout for macOS · Linux · Windows (native) · WSL, and the **resolver core** (§6) that computes it — `resolveGlobalScopePaths(platform, env)`, shipped in this slice as `src/core/global-scope-resolver.ts`.
3. A **migration design** (§7) and an **ADR draft** (§8). Migration is design-only in this slice (no migration code ships); the ADR is a proposal — accepting, amending, or rejecting it is Alperen's decision.

**What this slice deliberately does NOT do:** it does not change the existing config precedence, does not rewire `constants.ts` / `config.ts` / `state-paths.ts`, and does not move a single file on disk. The resolver is intentionally **unwired** — the first core, not the flip.

---

## 2. Current State (disk-verified)

### 2.1 Config precedence — verified unchanged

`src/core/config.ts` (`loadConfig`, ~line 1396–1487) loads config in layered precedence, last wins (ADR-G-001; historically called "3-layer" counting the three *file* layers — the live runtime adds env overrides, making four effective layers):

```
defaults (hardcoded floor)
  → ~/.deckent/config.json        (global, user-machine-wide)
    → .deckent/config.json        (project, per-repo)
      → DECKENT_* env overrides   (per-invocation; curated allowlist)
```

Merge is `deepMerge`: nested objects merge, arrays replace, `undefined` skipped. **This design keeps that precedence byte-for-byte intact** — the global scope may *relocate physically* (per platform), but its position in the merge chain never changes.

### 2.2 Global-state inventory (everything under `homedir()` today)

Verified by grep over `src/` (2026-07-02):

| State item | Path today | Owner module |
|---|---|---|
| Global config | `~/.deckent/config.json` | `src/core/constants.ts:10`, `src/core/global-config.ts` |
| Credentials store | `~/.deckent/credentials/` | `src/core/constants.ts:11`, `src/core/credentials.ts:59` |
| Marketplace auth | `~/.deckent/credentials/` | `src/core/marketplace/marketplace-auth.ts:17` |
| Keyring (credential encryption) | `~/.deckent/` | `src/core/credential-encryption.ts:26` |
| Signature keypair | `~/.deckent/keys/` | `src/core/signature.ts:15` |
| Model-catalog cache | `~/.deckent/cache/` | `src/core/model-catalog.ts:30` |
| Model auto-detect cache | `~/.deckent/cache/` | `src/core/model-auto-detect.ts:68` |
| Gateway pairing/session | `~/.deckent/gateway/` | `src/connectors/gateway/gateway-paths.ts:8` |
| User-scope MCP config | `~/.deckent/mcp.json` | `src/mcp-client/config.ts:38`, `src/cli/commands/mcp.ts:36` |
| Limits ledger (read source) | `~/.claude/projects/` | `src/core/limit-ledger.ts:96` — **provider-owned, read-only; NOT deckent state** |

Two structural facts about today's layout:

- It is **flat and platform-blind**: `join(homedir(), '.deckent')` on every OS (`src/core/constants.ts:9`). No XDG / AppData / Library awareness.
- One env seam already exists: `src/core/state-paths.ts` honors `DECKENT_HOME` / `BRAIN_HOME` (call-time read, empty string = unset) — but only a handful of call-sites use it; ~150 hardcoded joins remain (ADR-D-002 STATE-RESOLVER work-item).

---

## 3. Design Principles

1. **Scope follows ownership, not convenience.** State is global iff it describes the *user + machine* (who you are, what providers you can reach, what the machine has cached). State is project iff it describes *one project's work* (what was planned, learned, decided).
2. **Pivot rule — learnings stay project-scope.** `memory.db` (ADRs, sprint learnings, retros, routing stats) is the project's accumulated judgment. It never migrates to global scope and never leaks across projects (ADR-G-017). A future opt-in "shared insight" channel would be a *new, explicit* mechanism — never a silent relocation of `memory.db`.
3. **Precedence is sacred.** `defaults → global → project → env` (ADR-G-001) is untouched. Physical relocation of the global layer must be invisible to the merge chain.
4. **Yasa#2 — full matrix up front, honest failure.** All four platforms are designed now; an unsupported platform throws a typed error, never a silent fallback.
5. **Yasa#3 — no MVP.** The resolver covers the full role model (config/data/cache/state), env overrides, legacy probing, and WSL as a first-class platform from day one.
6. **Migration is explicit, reversible, and probe-first.** No background rewrites of a user's home directory.

---

## 4. Layer Model (katman-tablosu)

### 4.1 Scope classification

| State item | Scope | Role | Rationale |
|---|---|---|---|
| `config.json` (global) | **Global** | config | Machine-wide defaults (plan tier, language, providers); floor under every project (ADR-G-001) |
| Provider auth / credentials (`credentials/`, keyring) | **Global** | data | Identity is per-user-per-machine; secrets never belong in a repo working tree (ADR-G-005) |
| Signature keypair (`keys/`) | **Global** | data | Machine identity for signing; one per user |
| Model catalog + auto-detect cache (`cache/`) | **Global** | cache | Provider/model facts are machine-level and rebuildable; re-fetching per project wastes quota |
| Skill-marketplace cache | **Global** | cache | Downloaded marketplace artifacts are project-independent and rebuildable; *installed/activated* skills remain a project decision |
| Limits / usage ledgers | **Global** | state | Rate/usage limits are per-account-per-machine, aggregated across projects (today read from provider-owned `~/.claude/projects/` — read-only source, deckent-side aggregation is deckent state) |
| Gateway pairing/session | **Global** | data | Messaging-channel pairing is user-level; sessions are project-scoped *inside* the gateway store |
| User-scope `mcp.json` | **Global** | config | Mirrors the existing user-vs-project MCP scope split (`deckent mcp --scope user`) |
| `config.json` (project, `.deckent/`) | **Project** | config | Per-repo overrides; checked in beside the code |
| `memory.db` (`.brain/`) — ADRs, learnings, retros | **Project** | data | **Pivot rule (§3.2):** learnings are the project's judgment; cross-project leakage banned (ADR-G-017) |
| `.tasks/`, `.locks/` | **Project** | state | Ephemeral sprint mechanics, meaningless outside the project |
| Agent/skill pools (`.deckent/agents/`, `.deckent/skills/`) | **Project** | data | Which agents/skills a project uses is a project decision (builtin catalog ships with the install itself) |
| Metrics / dashboards (`.deckent/metrics.jsonl`, `.dashboard`) | **Project** | state | Observability of *this* project's sprints |
| Runtime decisions / approvals (`.deckent/runtime/`) | **Project** | state | Approval trails are project governance artifacts |

### 4.2 Role definitions

The four roles map 1:1 onto XDG base directories (and analogues on darwin/win32):

| Role | Meaning | Loss tolerance |
|---|---|---|
| **config** | User-editable configuration | Must survive; user-authored |
| **data** | Durable user data (credentials, keys, pairing) | Must survive; loss = re-auth / re-pair |
| **cache** | Rebuildable derived data | Safe to delete at any time |
| **state** | Machine-local operational state (ledgers, runtime) | Should survive; loss = degraded history, not breakage |

### 4.3 Installation artifact vs global state

The **installed product** (npm global package: `dist/`, builtin agent/skill catalogs) is not "global state" — it is code, owned by the package manager, replaced on upgrade. Global state (§4.1) must therefore never live inside the install directory; upgrades must not touch user state.

---

## 5. Platform Matrix (Yasa#2)

### 5.1 Target layout per platform

`<app>` = `deckent`. All rows are computed by `resolveGlobalScopePaths` (§6); role roots MAY physically coincide where the platform convention merges roles.

| Role | Linux | WSL | macOS | Windows (native) |
|---|---|---|---|---|
| config | `$XDG_CONFIG_HOME/<app>` → `~/.config/<app>` | same as Linux | `~/Library/Application Support/<app>` | `%APPDATA%\<app>` |
| data | `$XDG_DATA_HOME/<app>` → `~/.local/share/<app>` | same as Linux | `~/Library/Application Support/<app>` | `%APPDATA%\<app>` |
| cache | `$XDG_CACHE_HOME/<app>` → `~/.cache/<app>` | same as Linux | `~/Library/Caches/<app>` | `%LOCALAPPDATA%\<app>` |
| state | `$XDG_STATE_HOME/<app>` → `~/.local/state/<app>` | same as Linux | `~/Library/Application Support/<app>` | `%LOCALAPPDATA%\<app>` |
| legacy (today) | `~/.deckent` | `~/.deckent` | `~/.deckent` | `%USERPROFILE%\.deckent` |

### 5.2 Platform rules and nuances

- **Linux** — XDG Base Directory spec: each of the four `XDG_*` env vars overrides its default independently; empty string = unset.
- **WSL** — Linux userland, so **XDG rules apply verbatim**; deliberately a *distinct platform tag* so tooling (doctor / migration) can apply WSL-specific guidance:
  - Global dirs must live on the **Linux filesystem** (`/home/...`), never on `/mnt/c` (9P translation: slow I/O, unreliable fsync — dangerous for SQLite if the global scope ever hosts a DB).
  - Each WSL distro has its own `$HOME` → its own global scope. Windows-side deckent and WSL-side deckent are **two machines** by design (no cross-boundary state sharing; a Windows↔WSL bridge would be a separate, explicit feature).
  - Detection: `WSL_DISTRO_NAME` / `WSL_INTEROP` env markers (`normalizeGlobalScopePlatform`), not fs sniffing.
- **macOS** — Apple conventions: config/data/state in `~/Library/Application Support/deckent`, cache in `~/Library/Caches/deckent` (Caches is excluded from Time Machine and purgeable — exactly the cache contract). `XDG_*` vars are **ignored** on darwin.
- **Windows (native)** — Known Folders: roaming (`%APPDATA%`) for config+data, machine-local (`%LOCALAPPDATA%`) for cache+state. Fallback chain when env is stripped: `%USERPROFILE%\AppData\{Roaming,Local}`; home itself falls back `%USERPROFILE%` → `%HOMEDRIVE%%HOMEPATH%`. Paths are joined with the **win32 backend** regardless of host OS (deterministic tests).
- **Unsupported platforms** (freebsd, openbsd, sunos, aix, android, …) — typed `GlobalScopeResolutionError` with code `UNSUPPORTED_PLATFORM`, message pointing at the `DECKENT_HOME` escape hatch. Honest failure per Yasa#2; extending the matrix (BSD → XDG is the likely rule) is an ADR amendment, not a silent fallback.

### 5.3 Escape hatch — `DECKENT_HOME`

`DECKENT_HOME` (already honored by `src/core/state-paths.ts`) stays the top-precedence override: when set, **all four role dirs collapse onto that single flat directory** — exactly today's `~/.deckent` shape. This keeps one knob for sandboxes, CI, and tests, and guarantees the hermetic-test story (`test:ci-sim`) is unaffected by platform-correct layouts.

---

## 6. Resolver Core — `resolveGlobalScopePaths(platform, env)`

Shipped in this slice: `src/core/global-scope-resolver.ts` + `tests/core/global-scope-resolver.test.ts`.

### 6.1 Contract

```typescript
type GlobalScopePlatform = 'darwin' | 'linux' | 'win32' | 'wsl';
type GlobalScopeEnv = Readonly<Record<string, string | undefined>>;

function resolveGlobalScopePaths(
  platform: GlobalScopePlatform,
  env: GlobalScopeEnv,
): GlobalScopePaths;

interface GlobalScopePaths {
  platform: GlobalScopePlatform;
  source: 'env-override' | 'platform-convention';
  home: string | null;          // null only under env-override without a resolvable home
  configDir: string;
  dataDir: string;
  cacheDir: string;
  stateDir: string;
  legacyDir: string | null;     // <home>/.deckent — the migration/dual-read probe seam
}

function normalizeGlobalScopePlatform(
  nodePlatform: string,          // process.platform-shaped, injected
  env: GlobalScopeEnv,
): GlobalScopePlatform;          // linux + WSL markers → 'wsl'; outside matrix → typed error
```

### 6.2 Guarantees

- **Pure** — no filesystem access, no `process.env` / `process.platform` reads; both inputs injected. Tests pass plain objects: no os mocking, no real fs, no `process.env` mutation.
- **Deterministic cross-host** — the path backend (`path.win32` vs `path.posix`) is selected by the *injected* platform, so resolving win32 paths on a Linux CI host produces byte-identical results to a real Windows host.
- **Typed failures** — `GlobalScopeResolutionError` with `code: 'HOME_NOT_RESOLVED' | 'UNSUPPORTED_PLATFORM'`; never a silent guess.
- **Unwired** — nothing consumes it yet; `constants.ts` still resolves the flat `~/.deckent`. Wiring order is defined by the migration plan (§7) and gated on the ADR decision (§8).

---

## 7. Migration Design (design-only — no code in this slice)

### 7.1 Phases

| Phase | Name | Behavior | Trigger |
|---|---|---|---|
| **M0** | Probe & report | `deckent doctor` reports legacy (`legacyDir`) vs platform-correct layout: what exists where, what *would* move. Zero writes. | Ships with resolver wiring |
| **M1** | Dual-read, legacy-write | Readers check platform-correct path first, fall back to `legacyDir`; **writes still go to legacy**. Behavior identical for every existing install. | Config flag `global_scope_layout: 'platform'` (default `'legacy'`) |
| **M2** | Explicit migrate | `deckent migrate global` — interactive, consented copy (never move-then-delete in one step): copy → verify (hash/size) → mark legacy `MIGRATED.md` breadcrumb → writes flip to new layout. Idempotent; re-run resumes/verifies. | User command only |
| **M3** | Default flip | New installs default to platform-correct layout; legacy detection keeps M1 dual-read for old installs indefinitely (no forced migration). | Major/minor release after ADR acceptance |

### 7.2 Invariants

- **Project scope never migrates.** `.deckent/`, `.brain/`, `.tasks/`, `.locks/` under project roots are untouched by every phase — this migration concerns the *global* scope only.
- **Precedence never changes.** In every phase the merge chain stays `defaults → global → project → env`; only the physical location of the "global" layer varies.
- **Rollback = flag flip.** Legacy files are preserved (breadcrumb, not deletion) until the user explicitly runs a cleanup (`deckent migrate global --cleanup-legacy`, separate consent).
- **Secrets move with permissions.** Credential/key files are copied with owner-only permissions (0600/0700 semantics on POSIX; user-ACL on Windows) and verified before the write-flip; partial migration of `credentials/` is an abort, never a half-state.
- **Per-platform edge cases:** WSL migration refuses to target `/mnt/*` (see §5.2); Windows migration handles `APPDATA` redirection (roaming profiles) by trusting env over derived defaults; macOS accepts that Caches may be purged by the OS (cache role only).

### 7.3 Out of scope for this document

- Windows↔WSL state bridging (explicitly a non-goal; two machines by design).
- Multi-tenant / per-org layering (ADR-G-001 "Tenant/scope extension" roadmap).
- `BRAIN_HOME` global-scope semantics (`.brain` remains project-scope per the pivot rule; the env var exists purely as a test/sandbox seam).

---

## 8. ADR Draft (taslak — karar Alperen'in)

> **PROPOSAL — NOT ACCEPTED.** This section is a ready-to-insert draft for `.brain/memory.db` (`type: 'adr'`). Accepting, amending, or rejecting it is **Alperen's decision**; nothing in this slice depends on the outcome.

---

**ADR-G-0XX: Global Scope Topology & Platform-Correct Global Paths**

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Source:** publisher
**Status:** *proposed* · **Date:** 2026-07-02
**Cross-ref:** ADR-G-001 (precedence spine — unchanged), ADR-G-017 (isolation), ADR-D-002 (STATE-RESOLVER), ADR-G-005 (secrets)

**Context.** deckent ships as a global install serving many projects. Its global state is a flat, platform-blind `~/.deckent`. Platform conventions (XDG / AppData / Library) exist for backup semantics, purgeability, and roaming; enterprise environments increasingly *enforce* them.

**Options.**
- **(A) Keep flat `~/.deckent` everywhere.** Zero migration; simple docs. Violates platform conventions; caches are Time-Machine'd/roamed; enterprise profile policies fight it.
- **(B) Platform-correct layout with legacy dual-read (this design, §5–§7).** Convention-correct roles (config/data/cache/state); staged, consent-based migration; `DECKENT_HOME` collapse-override keeps the sandbox story flat. Cost: dual-read complexity until legacy retires.
- **(C) Hybrid — flat default forever, platform-correct opt-in.** Cheapest, but forks the ecosystem into two permanent layouts and makes docs/tooling permanently conditional.

**Proposed decision.** Option **B**: adopt `resolveGlobalScopePaths` as the single authority for global-scope paths; wire via M0→M3 (§7.1); `DECKENT_HOME` remains the top-precedence flat override; unsupported platforms fail typed-honest. Config precedence (ADR-G-001) is explicitly reaffirmed and untouched.

**Consequences.** (+) Convention-correct on all four platforms; cache/data separation gives correct backup+purge semantics; migration is consented and reversible; one resolver replaces platform guesswork. (−) Dual-read window adds a probe branch to global-path reads; docs must show per-platform paths; ~10 owner modules (§2.2) must migrate onto the resolver (tracked work-items, same motion as ADR-D-002 STATE-RESOLVER).

**Born work-items.** ONB-GLOBAL-WIRE (owner modules → resolver, dual-read), ONB-GLOBAL-DOCTOR (M0 probe/report), ONB-GLOBAL-MIGRATE (M2 command), CONFIG-CACHE-GLOBAL interaction (global-mtime cache key must track the *resolved* global path).

---

## 9. Test Strategy

- **This slice:** `tests/core/global-scope-resolver.test.ts` — 34 tests, 4-platform matrix, env-injection only (plain objects; no fs, no os mocks, no `process.env` mutation): XDG defaults + per-var overrides, darwin Library rules, win32 fallback chain + backslash-backend proof, `DECKENT_HOME` collapse on all four platforms, empty-string-is-unset, `legacyDir` seam, typed errors (`HOME_NOT_RESOLVED`, `UNSUPPORTED_PLATFORM`), WSL normalization markers, purity (no env mutation, deterministic).
- **Future slices (with wiring):** dual-read precedence tests (platform-correct hit vs legacy fallback), migration idempotency/abort tests in tmpdir sandboxes (hermetic per `test:ci-sim`), doctor-report golden tests per platform.

---

## 10. References

- `src/core/global-scope-resolver.ts` — the resolver core (this slice)
- `tests/core/global-scope-resolver.test.ts` — 4-platform test suite (this slice)
- `src/core/config.ts` (`loadConfig`) — layered precedence, unchanged
- `src/core/constants.ts`, `src/core/global-config.ts` — today's flat global dir
- `src/core/state-paths.ts` — `DECKENT_HOME`/`BRAIN_HOME` seam precedent
- [Multi-Project Isolation Design](./multi-project-isolation.md) — project-scope isolation guarantees this design builds on
- ADR-G-001 / ADR-G-017 / ADR-D-002 / ADR-G-005 — `.brain/memory.db` (query via `deckent recall`)
- XDG Base Directory Specification; Apple File System Programming Guide (Library layout); Windows Known Folders — external platform conventions mirrored in §5
