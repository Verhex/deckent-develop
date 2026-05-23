# Security Policy

## Supported Versions

| Version        | Supported                        |
| -------------- | -------------------------------- |
| 1.0.0-beta.x   | Yes (active)                     |
| < 1.0          | No — legacy, no security updates |

## Reporting Vulnerabilities

If you discover a security vulnerability in deckent, please report it responsibly.

**Preferred:** [GitHub Security Advisory](https://github.com/VerhexIO/deckent/security/advisories/new) — keeps the report private until a fix is ready.

**Alternative Email:** security@verhex.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

**Do not** open a public GitHub issue for security vulnerabilities — this exposes users before a fix is available.

## Threat Model (Summary)

> Full threat model: [`docs/security/threat-model.md`](docs/security/threat-model.md)

### Attack Surface

| Surface | Risk | Mitigation |
|---------|------|------------|
| Worker code execution | AI worker runs arbitrary shell/code | AST-sandbox for skills; `spawn-safety.ts` whitelist |
| Provider API key leakage | Keys in config, logs, or env | `.deck` secret interpolation (ADR-014); 0600 file permissions |
| Multi-project boundary | Workers from project A writing to project B | Per-project isolation (ADR-034); auditor `git diff --stat` |
| MCP stdio channel | Tool call injection via malicious input | Input validation; stdio-only transport (no network) |
| tmux session access | Same OS user sees all sessions | Document clearly — deckent is single-user by design |

### Role Boundary Disclosure (ADR-037 V1.0)

**ADR-037 V1.0 implements advisory/soft role boundaries.** The scope enforcement layer:
- Detects violations via `git diff --stat` in the Auditor scan loop
- Emits structured events and logs (audit trail) for every violation
- **Does NOT block** workers from writing outside scope at runtime (V1.0 intentional — Layer-2 hard enforcement planned for V2 post-GA)

Workers self-flag boundary violations (`BOUNDARY_VIOLATION → NO_GO`). Brain applies FIX/cascade on self-reported violations.

Hard runtime enforcement (Layer-2) is planned for V2 post-GA. See [`docs/security/threat-model.md`](docs/security/threat-model.md) for full details.

## Security Model Overview

### Scope Isolation
Each worker operates within a defined scope (`scope.directories`, `scope.filesRead`, `scope.filesWrite`). The Auditor continuously monitors for boundary violations using `git diff --stat` and raises alerts when workers access files outside their assigned scope.

> **V1.0 advisory note:** Scope enforcement in V1.0 is advisory — violations are detected and logged but not blocked at the OS/filesystem level. Hard enforcement ships in V2 post-GA.

### Lock Files
File-level locking prevents concurrent writes. Lock files are stored in `.locks/` with owner information and timestamps. Stale locks (older than 5 minutes) are automatically detected and reported.

### Auditor Monitoring
The Auditor agent runs as an independent scan loop that:
- Detects stale heartbeats (workers unresponsive for >2 minutes)
- Identifies boundary violations
- Checks for circular dependencies and deadlocks
- Monitors usage thresholds to prevent runaway costs

### Process Isolation
Workers run in separate tmux sessions or subprocess instances, providing process-level isolation. The subprocess backend supports additional sandboxing with memory limits and directory restrictions.

## Known Limitations

- **No network isolation by default:** Workers can make network requests unless sandbox mode is enabled.
- **File permissions are advisory (V1.0):** Scope enforcement relies on Auditor detection, not OS-level restrictions. Hard enforcement planned for V2.
- **Credentials storage:** API keys stored in `~/.deckent/credentials/` use file permissions (0600) but are not encrypted at rest.
- **tmux session visibility:** All tmux windows within the deckent session are accessible to the same OS user.
- **ADR-037 V1.0 soft boundaries:** Role boundary violations are detected and logged but not blocked. Self-reporting by workers + Auditor audit trail is the enforcement mechanism in this release.

## Best Practices

1. **Use sandbox mode** (`--sandbox-mode`) for untrusted or experimental tasks.
2. **Review DIRECTIVES.md** before starting sprints to ensure task scopes are appropriate.
3. **Monitor the dashboard** (`.dashboard` file or `deckent dashboard`) during sprints.
4. **Keep deckent updated** to receive security fixes.
5. **Set appropriate file permissions** on `~/.deckent/credentials/` directory.
6. **Do not commit** `.deckent/credentials/` or API keys to version control.
7. **Use environment variables** for API keys in CI/CD pipelines instead of credential files.
8. **Prefer GitHub Security Advisories** over email for vulnerability reports — faster triage.
