# ADR-G-005: Secret File System & Zero-Worker-Exposure

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`.deck` + `DECKENT_` prefix registry + `ensureDeckGitignore` (auto) + host-side-only consumers (never on the worker-spawn path) → tomorrow=global+project scope secret resolution, same zero-exposure invariant across all backends
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-014 (.deck Secret File System) · **Supersedes:** —
**Crosswalk:** ADR-014 → ADR-G-005

---

## Context

Provider API keys originally lived in `.env`, which collided with the user's own project `.env`: deckent's `DECKENT_`-prefixed keys polluted the user file and complicated `.gitignore` management. ADR-014 (Sprint 044) separated deckent secrets into a dedicated **`.deck`** file, auto-added to `.gitignore` at init, so the user's `.env` is never touched.

A Sprint 281 re-audit (classification: BOTH — secret hygiene is directly user-product security) re-verified the core against the code and **strengthened the isolation claim**. The original ADR said "Brain injects only the needed keys per task scope." In today's reality that is not selective-injection at all — it is **zero exposure**: `.deck` never enters the worker-spawn path (there is no deck-transport in the docker backend), and every consumer is host-side. The "workers never see `.deck`" guarantee is therefore *more strictly* true than originally written.

## Decision (Today)

### 1. Dedicated secret file
deckent's secrets live in a separate **`.deck`** file using a `DECKENT_`-prefixed key registry. The user's `.env` is never read or written. `ensureDeckGitignore` adds `.deck` to `.gitignore` automatically at init; `isDeckFileCommitted` guards against an accidentally-committed secret file. Core helpers: `parseDeckFile` / `loadDeckSecrets` / `validateDeckFile` / `createDeckTemplate` / `ensureDeckGitignore` / `isDeckFileCommitted` (`src/core/deck-file.ts`).

### 2. Zero-worker-exposure (stronger than selective-inject)
`.deck` is **never on the worker-spawn path** — workers cannot read it under any backend (no deck-transport in the docker backend). All secret consumers are **host-side only**: provider bootstrap auto-register (`provider.ts`, ADR-077 Part-C → ADR-G-008), `server.ts`, `doctor.ts`, and config interpolation. This is a zero-exposure invariant, not a per-task filter.

### 3. `$DECK:KEY` interpolation + signing
Config values may reference secrets as `"$DECK:KEY"` (e.g. `"token": "$DECK:DISCORD_TOKEN"`), resolved at runtime host-side from `.deck` with a missing-secret warning (`src/core/deck-interpolation.ts`). Ed25519 signing for secret / skill-publish signatures uses `@noble/ed25519` + `@noble/hashes` (`src/core/signature.ts`); per the ADR-D-005 amendment these two crypto dependencies are governed here.

## Intent / Roadmap (Tomorrow)

- **Global + project scope.** Today `.deck` is effectively project-local. As deckent ships global-install + project-scope (ADR-G-001 layering), secrets resolve across a **global `~/.deck`** (machine-wide provider keys set once) and a **project `.deck`** (per-repo overrides), with the same zero-worker-exposure invariant and the same precedence spine as config (global < project).
- **Multi-tenant secret isolation.** The host-side-only consumer model is the foundation for per-tenant secret scoping (enterprise) — secrets never cross the worker boundary regardless of backend (docker / subprocess / future firecracker / cloud).
- **Consent + provisioning tie-in.** Secret setup folds into the conversational onboarding / consent flow (ADR-G-030) so a user provisions provider keys without hand-editing `.deck`.

## Consequences

**(+)** deckent secrets are fully separated from the user's `.env`; auto-gitignore + committed-file guard prevent accidental leaks; the zero-worker-exposure invariant is architecturally enforced (no transport path) rather than policy-enforced, so it holds across backends; `$DECK:KEY` interpolation keeps raw secrets out of config files; signing deps are governed, not ad-hoc.

**(−)** The strong isolation depends on no backend ever adding a deck-transport to workers — a future backend must preserve the invariant explicitly; global+project secret scope is roadmap (today effectively project-local); `$DECK:KEY` resolution failures surface as warnings, so a missing secret degrades at runtime rather than blocking up front (acceptable, but must stay visible).

## References / Absorbed

- **Absorbs:** ADR-014 (.deck Secret File System — dedicated file, `DECKENT_` registry, auto-gitignore, worker non-exposure).
- **Implementation:** `src/core/deck-file.ts` (parse/load/validate/template/gitignore/committed-guard), `src/core/deck-interpolation.ts` (`$DECK:KEY`), `src/core/signature.ts` (Ed25519, `@noble/ed25519` + `@noble/hashes`).
- **Cross-ref:** ADR-D-005 (Dependency Policy & Inventory — crypto-deps bridge), ADR-G-008 (Provider Abstraction — bootstrap auto-register, host-side consumer; ADR-077 Part-C), ADR-G-001 (Layered Config & Scope — shared global<project precedence), ADR-G-030 (Consent-Based Provisioning — secret-setup onboarding).
- **Direction:** global+project secret scope (MASTER-PLAN); `.analysis/adr-review-crosswalk.md` row 014.
