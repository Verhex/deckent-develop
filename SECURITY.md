# Security Policy

deckent spawns AI workers that read, write, and execute code on your machine, with your credentials, against your projects. That is a lot of power, and this document is deliberately precise about what deckent enforces, what it only *detects*, and where the gaps are. We would rather you trust deckent because it tells you the truth than because it makes promises it can't keep.

---

## Reporting a vulnerability

**Report security issues privately — never in a public issue.** A public report exposes users before a fix exists.

- **Preferred:** open a [GitHub Security Advisory](https://github.com/VerhexIO/deckent/security/advisories/new) — it stays private until a fix ships.
- **Email:** `security@deckent.ai`

Please include a description and impact, steps to reproduce, and a suggested fix if you have one. We aim to acknowledge within **48 hours** and to ship a fix for critical issues within **7 days**.

## Supported versions

| Version | Supported |
|---------|-----------|
| `1.0.0-beta.x` | Yes — actively maintained |
| `< 1.0` | No — legacy, no security updates |

Run `npm install -g deckent@latest` to stay current.

---

## Security posture (read this first)

deckent is a **single-user, local-first** orchestrator. It assumes the machine and OS user running it are trusted, and that workers operate on **your** code with **your** credentials. It is **not** a sandbox that isolates an adversarial worker or an untrusted third party at the OS level.

The most important thing to understand is **which boundaries are hard and which are advisory.** deckent is honest about this rather than implying a uniform guarantee:

| Control | Reality | Detail |
|---------|---------|--------|
| **Cost gate** | 🟢 **Hard** | An over-budget sprint does not spawn a single worker until you acknowledge it. |
| **Safety floor** | 🟢 **Hard** | Five irreversible actions (kill a live sprint, delete files, destructive git, over-threshold cost, deprecate an accepted ADR) *always* require explicit approval — no automation mode can bypass them. |
| **Dashboard / API auth** | 🟢 **Hard** | Bearer tokens use constant-time comparison; OIDC JWTs are RS256-pinned, `alg:none` and algorithm-confusion are rejected, JWKS is HTTPS-only and fails closed. |
| **Spawn safety** | 🟢 **Hard** | Workers spawn with array args against a binary allow-list; shell-string execution is rejected. |
| **Docker isolation** | 🟢 **Hard** | The default backend runs each worker in its own container with memory limits and graceful shutdown. |
| **Local/agentic worker scope** | 🟢 **Hard** | Local-model and native-agent workers reject a write/edit outside their scope *before* it executes. |
| **CLI/tmux worker scope** | 🟡 **Advisory (V1.0)** | The Auditor detects out-of-scope writes via `git diff --stat` and logs/emits an event, but does **not** block them at the OS level. Hard runtime enforcement is planned for V2 (post-GA). |
| **RBAC roles (ADR-037)** | 🟡 **Advisory by default** | Role/authority violations are warned and written to the audit trail; they hard-block only when `enforce_rbac` is enabled in config. |

The advisory layers are robust for the cooperative, single-user case deckent is built for — a worker self-reports a boundary violation (`BOUNDARY_VIOLATION → NO_GO`), the Auditor records it, and the Brain applies a FIX. They are **not** a hard wall against a deliberately malicious worker. For untrusted or high-risk work, use the Docker backend.

---

## How the controls work

### Scope enforcement
Every task carries a scope (`scope.directories`, `scope.filesRead`, `scope.filesWrite`). The Auditor's scan loop diffs the working tree (`git diff --stat`) and raises an alert when a worker touches a file outside its assignment. For **local-model and native-agent workers**, a scope guard checks the path *before* the write tool runs and returns an error so the model self-corrects — a hard reject. For **CLI/tmux workers** the check is advisory in V1.0 (detect + log + event), with OS-level enforcement planned for V2.

### RBAC authority matrix (ADR-037)
Brain, Auditor, and Worker have distinct roles — the Brain is the only planner, the Auditor never writes source, workers never plan. Authority checks cover filesystem paths and event-stream channels, and every denial is written to a tamper-evident, HMAC-chained audit trail. Enforcement is advisory by default (warn + record) and becomes a hard block when `enforce_rbac` is turned on. Role capabilities are tenant-aware (`admin` / `operator` / `viewer`).

### Skill validation & spawn safety
Skills are validated against a strict schema before registration (id, name, category, model allow-list, prompt-injection position). Worker subprocesses are constrained by a **binary allow-list** (`node`, `npx`, `vitest`, `tsc`, `python`, `go`, `cargo`, …) with shells deliberately excluded, and every argument is checked against a metacharacter-rejecting regex. The result: no `sh -c "<model output>"` path exists. *(Note: this is schema + spawn-allowlist validation, not full AST sandboxing of arbitrary skill JavaScript — see Limitations.)*

### Secret handling (`.deck`)
Reference secrets as `$DECK:MY_TOKEN` anywhere in config or directives; they are resolved at runtime from a local `.deck` file that deckent keeps out of git (it ensures the `.gitignore` entry and can detect an accidentally-tracked file). Secrets are **never** written into git-tracked files. They are, however, stored in plaintext at rest and protected only by filesystem permissions (see Limitations).

### Cost & action gates
A pre-sprint **cost gate** estimates spend (with cache and retry buffers) and refuses to spawn workers if the estimate exceeds your budget, unless you acknowledge it (`--force` / `acknowledgeCost`). Small sprints under an auto-confirm threshold run without prompting. The **Nervous System** adds a safety floor of locked, irreversible actions and a configurable authority mode (from `STRICT` to `FULL_AUTO`) — but the safety floor is honored in every mode.

### Dashboard & API authentication
Every protected endpoint requires a bearer token, compared in constant time (SHA-256, `timingSafeEqual`) to prevent timing leaks. Optional OIDC/SSO login verifies JWTs with **RS256 pinning** — `alg:none` and algorithm-confusion attempts are rejected, the JWKS endpoint must be HTTPS, and an unresolvable key fails closed (never bypasses). Loopback auto-inject (for local dev) is opt-in and never applies to remote callers.

### Process isolation
Workers run in Docker containers (default — the strongest boundary, with memory limits), tmux sessions, or subprocesses. The `.tasks/` result directory is shared; everything else in a Docker worker is container-isolated.

---

## Known limitations

Stated plainly, because pretending otherwise would be the real security risk:

- **Advisory scope for CLI/tmux workers (V1.0).** Detected and logged, not OS-blocked. Use Docker or local-agent workers for a hard boundary; full runtime enforcement is a V2 goal.
- **No network isolation by default.** Workers can make outbound requests unless you run them in a network-restricted Docker configuration.
- **Credentials are plaintext at rest.** `.deck` and credential files rely on filesystem permissions, not encryption. Keep them off shared machines and out of backups.
- **tmux session visibility.** Any process running as the same OS user can attach to a worker's tmux session. The Docker backend avoids this.
- **Symlink resolution is incomplete.** A symlink pointing outside a worker's scope can bypass the `git diff`-based scope check. Targeted for V2 with the ADR-037 hardening.
- **Multi-tenant isolation is partial.** Audit and RBAC are tenant-aware, but there is no enforced filesystem boundary between tenants sharing a workspace. Treat multi-tenant as an audited convenience, not a hard isolation guarantee, in this release.
- **Resource caps only under Docker.** Memory/CPU limits apply to Docker workers; tmux and subprocess workers are uncapped.
- **The native agentic REPL is experimental.** The flag-gated `deckent --native` mode (off by default) has its own permission model — an immutable safety core plus an always-ask floor for destructive tools — but is not yet GA-hardened.

---

## Best practices

1. **Use the Docker backend** (`spawn_backend: "docker"`, the default) for untrusted or high-risk work — it gives you the hard isolation tmux/subprocess can't.
2. **Review `DIRECTIVES.md`** before `deckent start` — confirm each task's scope grants only the reach it needs.
3. **Keep secrets in `.deck`**, never inline. Never commit `.deck`, `.deckent/credentials/`, or `.deckent/config.json`.
4. **Use environment variables** for API keys in CI/CD rather than credential files.
5. **Set a cost ceiling** and keep the Nervous-System safety floor enabled for unattended or autonomous runs.
6. **Watch `deckent status` / the dashboard** during sprints to catch boundary or cost alerts early.
7. **Enable `enforce_rbac`** for shared/team deployments where you want role violations to hard-block, not just log.
8. **Keep deckent updated**, and prefer a GitHub Security Advisory over email for faster private triage.
