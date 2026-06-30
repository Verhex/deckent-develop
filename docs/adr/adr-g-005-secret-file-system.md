# ADR-G-005: Secret File System (Dedicated `.deck` + Per-Provider Credential Model)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`.deck` + `DECKENT_` registry + `ensureDeckGitignore` (auto) + `$DECK:KEY` interpolation + **per-provider env-forward to workers** (NOT zero-exposure — `.deck` is readable via the project-root mount) → tomorrow=**DECK-WORKER-ISOLATION** (exclude `.deck` from the worker mount + narrow the env-forward) → true zero-exposure across all backends; global+project scope
**Status:** accepted (file-separation + per-provider credential model live; **true zero-worker-exposure is roadmap — DECK-WORKER-ISOLATION, not yet enforced**) · **Date:** 2026-06-30 · **Absorbs:** ADR-014 (.deck Secret File System) · **Supersedes:** —
**Crosswalk:** ADR-014 → ADR-G-005

---

## Context

Provider API keys originally lived in `.env`, which collided with the user's own project `.env`: deckent's `DECKENT_`-prefixed keys polluted the user file and complicated `.gitignore` management. ADR-014 (Sprint 044) separated deckent secrets into a dedicated **`.deck`** file, auto-added to `.gitignore` at init, so the user's `.env` is never touched.

A Sprint 281 re-audit (classification: BOTH — secret hygiene is directly user-product security) re-verified the core. The original ADR said "Brain injects only the needed keys per task scope," and a later draft over-strengthened this to "zero exposure / workers cannot read `.deck` under any backend." **The 2026-06-30 code-grounded review corrects that over-claim.** deckent does **not** *explicitly* transport `.deck` to a worker — but two real paths expose secrets to the worker today: (a) the **docker backend mounts the project root** (read-only) at `/workspace`, and `.deck` lives in the project root with **no exclusion**, so a worker **can read `/workspace/.deck`**; (b) host-side, `.deck` → `process.env` (`loadDeckSecrets`) and the docker backend **forwards the provider key per-provider** into the container (`-e ANTHROPIC_API_KEY` for api-mode). The honest model is therefore **dedicated-file separation + a per-provider credential allowlist**, not zero-exposure. Closing both gaps is the DECK-WORKER-ISOLATION roadmap item.

## Decision (Today)

### 1. Dedicated secret file
deckent's secrets live in a separate **`.deck`** file using a `DECKENT_`-prefixed key registry (`KNOWN_DECK_KEYS` + dynamic provider keys — see DECK-KEYS-SYNC). The user's `.env` is never read or written. `ensureDeckGitignore` adds `.deck` to `.gitignore` automatically at init; `isDeckFileCommitted` guards against an accidentally-committed secret file. Core helpers: `parseDeckFile` / `loadDeckSecrets` / `validateDeckFile` / `createDeckTemplate` / `ensureDeckGitignore` / `isDeckFileCommitted` (`src/core/deck-file.ts`).

### 2. Worker credential model — per-provider env-allowlist (NOT zero-exposure today)

deckent does not *explicitly* copy `.deck` into a worker, but the worker is **not** isolated from it today:

- **Project-root mount exposes the file.** The docker backend mounts the project root **read-only** at `/workspace` (`spawn-backend-docker.ts`), and `.deck` is in the project root with **no exclusion** — so a worker can `read('/workspace/.deck')`. Subprocess/host backends run the worker inside the project root directly.
- **Credentials are env-forwarded.** Host-side, `.deck` → `process.env` (`loadDeckSecrets`, `provider.ts`); the docker backend then forwards the **provider key** into the container per-provider (`-e ANTHROPIC_API_KEY` for api-mode). A worker therefore sees its **own provider credential** in env.
- **Most consumers are host-side** (provider bootstrap auto-register — ADR-G-008 / ADR-077 Part-C, `server.ts`, `doctor.ts`, `$DECK:KEY` config interpolation), which limits *broad* secret spread — but it is a **per-provider allowlist, not a zero-exposure invariant**.

**True zero-worker-exposure** — excluding `.deck` from the worker mount and narrowing/removing the env-forward (e.g. a host-side credential broker) — is the **DECK-WORKER-ISOLATION** roadmap item, not today's reality.

### 3. `$DECK:KEY` interpolation + signing
Config values may reference secrets as `"$DECK:KEY"` (e.g. `"token": "$DECK:DISCORD_TOKEN"`), resolved at runtime host-side from `.deck` with a missing-secret warning (`src/core/deck-interpolation.ts`). Ed25519 signing for secret / skill-publish signatures uses `@noble/ed25519` + `@noble/hashes` (`src/core/signature.ts`, private key written `0o600`); per the ADR-D-005 amendment these two crypto dependencies are governed here.

## Intent / Roadmap (Tomorrow)

- **🔴 DECK-WORKER-ISOLATION (P0) — make zero-exposure true.** Exclude `.deck` from the docker project-root mount (a `.deck`-stripped overlay, a mount sub-path, or moving the worker workspace out of the project root) **and** narrow the env-forward so a worker receives only the minimum credential it needs — ideally via a host-side credential broker rather than raw env. Until this lands, the `.deck` file is worker-readable and the provider key is env-forwarded.
- **Global + project scope.** Today `.deck` is effectively project-local. As deckent ships global-install + project-scope (ADR-G-001 layering), secrets resolve across a **global `~/.deck`** (machine-wide provider keys set once) and a **project `.deck`** (per-repo overrides), same precedence spine as config (global < project).
- **Multi-tenant secret isolation.** Once DECK-WORKER-ISOLATION holds, the host-side-only consumer model becomes the foundation for per-tenant secret scoping (enterprise) — secrets never crossing the worker boundary regardless of backend (docker / subprocess / future firecracker / cloud).
- **Consent + provisioning tie-in.** Secret setup folds into the conversational onboarding / consent flow (ADR-G-030) so a user provisions provider keys without hand-editing `.deck` (and `createDeckTemplate` must never overwrite an existing `.deck` — DECK-OVERWRITE-GUARD).

## Consequences

**(+)** deckent secrets are fully separated from the user's `.env`; auto-gitignore + committed-file guard prevent accidental git leaks; the per-provider env-allowlist limits a worker to its own provider credential rather than the whole secret set; `$DECK:KEY` interpolation keeps raw secrets out of config files; signing deps are governed, not ad-hoc.

**(−)** **The headline "zero-worker-exposure" is NOT yet true:** the docker project-root mount exposes `.deck` to the worker (read-only, no exclusion) and the provider credential is env-forwarded — a worker sees its own credential and can read the secret file (DECK-WORKER-ISOLATION, P0). Other gaps: `createDeckTemplate` writes `.deck` unconditionally and can **overwrite an existing secret file** on re-init (DECK-OVERWRITE-GUARD); `KNOWN_DECK_KEYS` (9 keys) drifts from real usage (`DECKENT_DEEPSEEK_API_KEY`, `DASHSCOPE`, `ZHIPU`, `WEBHOOK_KEY` warn as "unknown" — DECK-KEYS-SYNC); `.deck` is written without `0o600` perms and is absent from `.npmignore` (defense-in-depth — DECK-HARDEN, though `package.json` `files` currently excludes it from publish). Global+project secret scope is roadmap.

## References / Absorbed

- **Absorbs:** ADR-014 (.deck Secret File System — dedicated file, `DECKENT_` registry, auto-gitignore).
- **Implementation:** `src/core/deck-file.ts` (parse/load/validate/template/gitignore/committed-guard), `src/core/deck-interpolation.ts` (`$DECK:KEY`), `src/core/signature.ts` (Ed25519, `@noble/ed25519` + `@noble/hashes`), `src/orchestra/spawn-backend-docker.ts` (project-root mount + per-provider env-forward).
- **Cross-ref:** ADR-D-005 (Dependency Policy — crypto-deps bridge), ADR-G-008 (Provider Abstraction — bootstrap auto-register, host-side consumer; ADR-077 Part-C), ADR-G-001 (Layered Config & Scope — shared global<project precedence), ADR-G-014 (Spawn Backend — the mount/env model lives here), ADR-G-030 (Consent-Based Provisioning — secret-setup onboarding), ADR-G-031 (multi-tenant secret scoping).
- **Born work-items:** **DECK-WORKER-ISOLATION** (P0 — exclude `.deck` from worker mount + narrow env-forward) · DECK-OVERWRITE-GUARD (P1 — `createDeckTemplate` no-op-if-exists) · DECK-KEYS-SYNC (P1 — `KNOWN_DECK_KEYS` → built-ins + dynamic provider-key pattern) · DECK-HARDEN (P2 — `.deck` `0o600` + `.npmignore` entry).
- **Direction:** global+project secret scope (MASTER-PLAN); `.analysis/adr-review-crosswalk.md` row 014.
