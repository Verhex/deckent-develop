# ADR-G-005: Secret File System (Dedicated `.deck` + Per-Provider Credential Model)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`.deck` + `DECKENT_` registry + `ensureDeckGitignore` (auto) + `$DECK:KEY` interpolation + **per-provider env-forward allowlist to workers** (F1-014r — each worker gets ONLY its own provider credential) + **DECK-WORKER-ISOLATION: docker workers can no longer read `.deck`** (an empty read-only overlay shadows `/workspace/.deck` — DECK-WORKER-ISOLATION done for the docker backend, 2026-07-01) → tomorrow=extend file-isolation to the subprocess backend (host-side credential broker) → true zero-exposure across ALL backends; global+project scope
**Status:** accepted (file-separation + per-provider credential model live; **zero-worker-exposure is TRUE for the docker backend** — `.deck` shadowed out of the mount + env-forward already a per-provider allowlist; **subprocess backend still runs in the project root so `.deck` stays disk-readable there** — the host-side broker is the remaining DECK-WORKER-ISOLATION half) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-014 (.deck Secret File System) · **Supersedes:** —
**Crosswalk:** ADR-014 → ADR-G-005

---

## Context

Provider API keys originally lived in `.env`, which collided with the user's own project `.env`: deckent's `DECKENT_`-prefixed keys polluted the user file and complicated `.gitignore` management. ADR-014 (Sprint 044) separated deckent secrets into a dedicated **`.deck`** file, auto-added to `.gitignore` at init, so the user's `.env` is never touched.

A Sprint 281 re-audit (classification: BOTH — secret hygiene is directly user-product security) re-verified the core. The original ADR said "Brain injects only the needed keys per task scope," and a later draft over-strengthened this to "zero exposure / workers cannot read `.deck` under any backend." **The 2026-06-30 code-grounded review corrects that over-claim.** deckent does **not** *explicitly* transport `.deck` to a worker — but two real paths expose secrets to the worker today: (a) the **docker backend mounts the project root** (read-only) at `/workspace`, and `.deck` lives in the project root with **no exclusion**, so a worker **can read `/workspace/.deck`**; (b) host-side, `.deck` → `process.env` (`loadDeckSecrets`) and the docker backend **forwards the provider key per-provider** into the container (`-e ANTHROPIC_API_KEY` for api-mode). The honest model is therefore **dedicated-file separation + a per-provider credential allowlist**, not zero-exposure. Closing both gaps is the DECK-WORKER-ISOLATION roadmap item.

## Decision (Today)

### 1. Dedicated secret file
deckent's secrets live in a separate **`.deck`** file using a `DECKENT_`-prefixed key registry (`KNOWN_DECK_KEYS` + dynamic provider keys — see DECK-KEYS-SYNC). The user's `.env` is never read or written. `ensureDeckGitignore` adds `.deck` to `.gitignore` automatically at init; `isDeckFileCommitted` guards against an accidentally-committed secret file. Core helpers: `parseDeckFile` / `loadDeckSecrets` / `validateDeckFile` / `createDeckTemplate` / `ensureDeckGitignore` / `isDeckFileCommitted` (`src/core/deck-file.ts`).

### 2. Worker credential model — per-provider env-allowlist + docker `.deck` isolation

deckent never *explicitly* copies `.deck` into a worker. File-level isolation is now enforced for the docker backend and remains open for the subprocess backend:

- **Docker: `.deck` is shadowed out of the mount (DECK-WORKER-ISOLATION, done).** The docker backend bind-mounts the project root **read-write** at `/workspace` (`spawn-backend-docker.ts`), and `.deck` lives in the project root — so a worker *could* `read('/workspace/.deck')`. It no longer can: when a `.deck` exists, an **empty read-only file is overlaid at `/workspace/.deck`** (`buildDeckShadowMountArgs`), so the worker sees a 0-byte file while the host `.deck` is untouched (verified live: a real container reads empty). The shadow is **conditional** — mounting over a *missing* `.deck` would materialize a phantom host `.deck` via the nested bind mount, so no file ⇒ no mount.
- **Subprocess: `.deck` is still disk-readable (roadmap).** The subprocess backend runs the worker as a **host process inside the project root**, where no mount trick applies — the file stays readable; isolation there rests on env-scrubbing (below) until the host-side credential broker lands.
- **Credentials are env-forwarded via a per-provider allowlist (F1-014r).** Host-side, `.deck` → `process.env` (`loadDeckSecrets`, `provider.ts`); each backend then hands a worker **only its own provider credential** — docker forwards exactly one key (`ANTHROPIC_API_KEY` only in api-mode, `OPENAI_API_KEY` for codex, `GOOGLE_API_KEY` for gemini; `cross-provider-keys.ts`), subprocess scrubs every foreign provider key from the inherited env and re-injects only the owner's. A worker never sees a foreign provider's credential.
- **Most consumers are host-side** (provider bootstrap auto-register — ADR-G-008 / ADR-077 Part-C, `server.ts`, `doctor.ts`, `$DECK:KEY` config interpolation), which limits *broad* secret spread.

**True zero-worker-exposure is now real for the docker backend** (`.deck` shadowed + per-provider env allowlist). Extending file-isolation to the **subprocess** backend — e.g. a host-side credential broker so the worker never touches the secret file regardless of backend — is the remaining **DECK-WORKER-ISOLATION** half.

### 3. `$DECK:KEY` interpolation + signing
Config values may reference secrets as `"$DECK:KEY"` (e.g. `"token": "$DECK:DISCORD_TOKEN"`), resolved at runtime host-side from `.deck` with a missing-secret warning (`src/core/deck-interpolation.ts`). Ed25519 signing for secret / skill-publish signatures uses `@noble/ed25519` + `@noble/hashes` (`src/core/signature.ts`, private key written `0o600`); per the ADR-D-005 amendment these two crypto dependencies are governed here.

## Intent / Roadmap (Tomorrow)

- **DECK-WORKER-ISOLATION (P0) — ✅ docker half done (source, 2026-07-01); subprocess half open.** The docker project-root mount now shadows `.deck` with an empty read-only overlay (`buildDeckShadowMountArgs`, conditional on `.deck` existing to avoid a phantom host file) and the env-forward is already a per-provider allowlist (F1-014r) — so a docker worker can neither read `.deck` nor see a foreign credential. **Remaining:** the subprocess backend runs the worker in the project root where no mount trick applies, so `.deck` stays disk-readable there; closing it needs a **host-side credential broker** (secrets resolved host-side, never exposed to the worker filesystem, regardless of backend). Also pending: `dist/` rebuild for the running docker backend to pick up the shadow (BUILD-GATE).
- **Global + project scope.** Today `.deck` is effectively project-local. As deckent ships global-install + project-scope (ADR-G-001 layering), secrets resolve across a **global `~/.deck`** (machine-wide provider keys set once) and a **project `.deck`** (per-repo overrides), same precedence spine as config (global < project).
- **Multi-tenant secret isolation.** Once DECK-WORKER-ISOLATION holds, the host-side-only consumer model becomes the foundation for per-tenant secret scoping (enterprise) — secrets never crossing the worker boundary regardless of backend (docker / subprocess / future firecracker / cloud).
- **Consent + provisioning tie-in.** Secret setup folds into the conversational onboarding / consent flow (ADR-G-030) so a user provisions provider keys without hand-editing `.deck` (and `createDeckTemplate` must never overwrite an existing `.deck` — DECK-OVERWRITE-GUARD).

## Consequences

**(+)** deckent secrets are fully separated from the user's `.env`; auto-gitignore + committed-file guard prevent accidental git leaks; the per-provider env-allowlist limits a worker to its own provider credential rather than the whole secret set; `$DECK:KEY` interpolation keeps raw secrets out of config files; signing deps are governed, not ad-hoc.

**(−)** **Zero-worker-exposure is true for the docker backend but not yet the subprocess backend:** a subprocess worker runs in the project root and can still read `.deck` from disk (env is scrubbed to its own provider credential, but the file is reachable) — closing it needs the host-side credential broker (DECK-WORKER-ISOLATION, subprocess half). The docker shadow is source-true but the running backend reflects it only after a `dist/` rebuild (BUILD-GATE). Other open gaps: `createDeckTemplate` writes `.deck` unconditionally and can **overwrite an existing secret file** on re-init (DECK-OVERWRITE-GUARD); `KNOWN_DECK_KEYS` (9 keys) drifts from real usage (`DECKENT_DEEPSEEK_API_KEY`, `DASHSCOPE`, `ZHIPU`, `WEBHOOK_KEY` warn as "unknown" — DECK-KEYS-SYNC); `.deck` is written without `0o600` perms and is absent from `.npmignore` (defense-in-depth — DECK-HARDEN, though `package.json` `files` currently excludes it from publish). Global+project secret scope is roadmap.

## Status Note (2026-07-11 — RC-1, Task 411-001 + 411-002)

RC-1 closed two of this ADR's open gaps without waiting for the full
DECK-WORKER-ISOLATION subprocess half:

- **DECK-OVERWRITE-GUARD closed (Task 411-001).** `createDeckTemplate`
  (`src/core/deck-file.ts`) is now no-op-if-exists (byte-identical preserved
  on repeat calls), writes atomically (same-dir tmp + rename), and sets
  owner-only permissions (POSIX `0600` re-asserted via `chmodSync` to defeat a
  permissive umask; Windows gets an `icacls` owner-only ACL grant). A re-init
  can no longer erase or widen the exposure of a live `.deck`.
- **Subprocess-visibility honesty-slice landed (Task 411-002, SEC-02).** The
  subprocess backend's disk-readable `.deck` (see *Context* / Decision §2
  above — unchanged, still open) is no longer a silent gap: `deckent doctor`
  gains a `.deck Subprocess Visibility` check (`checkDeckSubprocessVisibility`,
  `src/cli/commands/doctor-checks.ts`) that WARNs when `spawn_backend ===
  'subprocess'` AND a real, non-empty `.deck` exists, pointing the user at the
  docker backend (already shadowed) for sensitive environments. It is
  advisory-only (`required: false`, never blocks `doctor`'s overall `ok`),
  stays silent-pass for every case where the risk doesn't apply (non-subprocess
  backend, missing `.deck`, template-only `.deck` with no non-empty value),
  and its warning text is a fixed, generic string — it never echoes a key name
  or secret value. This is a **surfacing fix, not a containment fix**: the
  file is still disk-readable to a subprocess worker; only the operator's
  visibility into that fact changed.
- **Credential-broker follow-up still open, unchanged.** Closing the
  subprocess half of DECK-WORKER-ISOLATION for real (a host-side credential
  broker so a subprocess worker never touches `.deck` regardless of backend,
  matching the docker backend's shadow-overlay guarantee) remains out of RC-1
  scope and is tracked as its own born work-item, per the roadmap below.
- **Known implementation gap (disk-verified, Task 411-002):** `src/cli/commands/doctor.ts`
  maintains its own separate, non-deduplicated `runDoctorChecks` (same
  duplication pattern the born-505/Task-410-003 dedup already closed for
  `runPreFlightHealthCheck`, but not for this function) — every real caller
  (`mcp/tools/doctor.ts`, `api/server.ts`, `cli/commands/start.ts`,
  `cli/commands/init.ts`) uses `doctor.ts`'s copy, not `doctor-checks.ts`'s.
  The new check above is implemented and tested in `doctor-checks.ts`; a
  follow-up task must mirror it into `doctor.ts` (or finish the dedup) before
  the live `deckent doctor` CLI actually prints the warning.

## References / Absorbed

- **Absorbs:** ADR-014 (.deck Secret File System — dedicated file, `DECKENT_` registry, auto-gitignore).
- **Implementation:** `src/core/deck-file.ts` (parse/load/validate/template/gitignore/committed-guard), `src/core/deck-interpolation.ts` (`$DECK:KEY`), `src/core/signature.ts` (Ed25519, `@noble/ed25519` + `@noble/hashes`), `src/orchestra/spawn-backend-docker.ts` (project-root mount + per-provider env-forward).
- **Cross-ref:** ADR-D-005 (Dependency Policy — crypto-deps bridge), ADR-G-008 (Provider Abstraction — bootstrap auto-register, host-side consumer; ADR-077 Part-C), ADR-G-001 (Layered Config & Scope — shared global<project precedence), ADR-G-014 (Spawn Backend — the mount/env model lives here), ADR-G-030 (Consent-Based Provisioning — secret-setup onboarding), ADR-G-031 (multi-tenant secret scoping).
- **Born work-items:** **DECK-WORKER-ISOLATION** (P0 — exclude `.deck` from worker mount + narrow env-forward) · DECK-OVERWRITE-GUARD (P1 — `createDeckTemplate` no-op-if-exists) · DECK-KEYS-SYNC (P1 — `KNOWN_DECK_KEYS` → built-ins + dynamic provider-key pattern) · DECK-HARDEN (P2 — `.deck` `0o600` + `.npmignore` entry).
- **Direction:** global+project secret scope (MASTER-PLAN); `.analysis/adr-review-crosswalk.md` row 014.
