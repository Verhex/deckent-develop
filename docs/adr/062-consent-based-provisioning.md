# ADR-062: Consent-Based Prerequisite Provisioning

**Status:** accepted
**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)
**Date:** 2026-05-19
**Sprint:** Sprint 175 (1 Haziran Beta — Kusursuz Kurulum Deneyimi, Workstream A)

---

## Status

accepted — implements the blueprint §3.4 "anyone can install & use" promise. Documents an
implemented + TDD-tested capability (`src/core/provisioner.ts`, 23 tests). Geç-ADR pattern
(implementation-first documentation), accepted Deckent practice (cf. ADR-053, ADR-061 Notes).

## Context

`deckent init` / `deckent doctor` only **detected** missing prerequisites and printed a hint
string (`getProviderInstallHint` in `doctor.ts:410` + duplicated in `doctor-format.ts:69`).
blueprint §3.4 falsely claimed "tmux auto-installed on first run if missing" — no install path
existed anywhere (`spawnSync('npm', ['install', ...])` was absent from the codebase).

For the 1 Haziran OSS public beta the critical-path goal is a frictionless install experience
("Deckent herkesin kurabileceği kolaylık"). A non-developer running `deckent init` should be
guided to a working setup, not handed a list of manual `npm i -g` commands. But silently
installing global packages / running OS package managers is a security- and trust-sensitive
action that must not happen without explicit user consent.

## Decision

A single provisioning module (`src/core/provisioner.ts`) is the source of truth for "how is a
prerequisite installed", consent-gated and OS-aware:

1. **`planInstall(tool, opts)`** — deterministic, pure mapping `ToolId → InstallPlan`:
   - `claude/codex/gemini` → `method: 'npm-global'`, `npm install -g <pkg>`
   - `tmux` → `method: 'os-package'` — OS-aware instruction (apt/dnf/pacman/brew)
   - `node`, `docker` → `method: 'manual'` — never auto-installed (runtime / privileged)
2. **`installTool`** — only `npm-global` plans are auto-executed, and only when
   `consent === true`. Array args, `shell: false` (shell:true ONLY on win32 for the npm `.cmd`
   wrapper, mirroring `provider.ts:detectCliVersion`). Executable checked against
   `PROVISIONER_BIN_WHITELIST` (frozen, `['npm']` — `sh`/`bash` intentionally absent). Non-zero
   exit returns `{ status: 'failed' }` (never throws). `os-package`/`manual` are surfaced as an
   instruction string the user runs themselves — **no silent sudo**.
3. **`provisionMissing`** — orchestration: `mode` ∈ `prompt | yes | no-install`.
   - `prompt` (default) — per-tool consent prompt
   - `yes` (CLI `--yes`, MCP `installMissing:true`) — install all without prompting (CI)
   - `no-install` (CLI `--no-install`) — legacy hint-only behavior preserved (backward compat)
4. **Single source of truth** — `getProviderInstallHint` (both `doctor.ts` and
   `doctor-format.ts` copies) now delegates the package mapping to `planInstall`; legacy hint
   string format preserved (no test/UX regression).
5. **MCP parity** — `deckent_init` gains an `installMissing` opt-in (MCP has no interactive
   consent channel, so it is explicit opt-in === CLI `--yes`; default reports only).

## Alternatives Considered

- **Silent auto-install (no consent).** Rejected — installing global npm packages / OS
  packages without consent violates user trust and the security DNA (ROADMAP §11 anchor #9).
- **Keep hint-only.** Rejected — does not meet the beta "frictionless install" goal.
- **Bundle provider CLIs as deps.** Rejected — bloats the package, conflicts with ADR-010
  (minimal runtime dependencies) and provider-agnostic vision.

## Consequences

### Positive
- `deckent init` becomes a real provisioner — closes the blueprint §3.4 reality gap.
- Security-preserving: consent-gated, whitelist + shell-free spawn (companion to ADR-006
  spawnSync pattern + `spawn-safety.ts`), no silent sudo.
- Single source of truth removes the duplicated install-hint mapping (DRY across 3 sites).
- Backward compatible: `--no-install` preserves the prior hint-only behavior exactly.

### Negative / Risks
- Global `npm i -g` may require elevated permissions on some setups; failures are reported
  with the manual command (graceful, non-fatal) rather than auto-escalating.
- OS-package (tmux) still requires a manual user step on Linux (sudo) — by design.
- Provider CLI package names (`@anthropic-ai/claude-code`, `@openai/codex`,
  `@google/gemini-cli`) are now centralized; if a vendor renames a package, update one place.

## Related ADRs

- **ADR-006** — spawnSync Security Pattern: provisioner spawn obeys the array-args /
  shell-free invariant; `PROVISIONER_BIN_WHITELIST` is a companion to `spawn-safety.ts`.
- **ADR-010** — Minimal runtime dependencies: provisioner installs *external* CLIs on
  consent rather than bundling them as deps.
- **ADR-011** — node:readline/promises prompt: the interactive consent prompt uses the
  existing `promptConfirm` helper.
- **ADR-036** — ADR Governance: this ADR is the runtime contract for the provisioning
  capability; written as governance record for the implemented behavior.

## Notes

ADR number selected as the next free slot above the highest existing ADR (061). Slots
049–052 / 054 / 056–059 are intentionally left for the TaskType-taxonomy ADR family
(ADR-053/055/060 already exist; cf. `project-task-type-taxonomy-vision` memory) to avoid
cross-family collision. Verified against both `docs/adr/` and `memory.db` (`type='adr'`).

DB sync: this `.md` is upserted into `memory.db` via the ADR-046 `adrInsert` post-finalize
hook (`adr-file-sync.ts`) — never via destructive rebuild (cf. `feedback_db_silmek_yasak`).

**İmza:** Brain (orchestrator) — Sprint 175 Workstream A, behavior implemented + 23 tests PASS.
