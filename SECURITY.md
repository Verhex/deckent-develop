# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | Yes                |
| < 0.1   | No                 |

## Reporting Vulnerabilities

If you discover a security vulnerability in deckent, please report it responsibly.

**Email:** security@verhex.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

**Do not** open a public GitHub issue for security vulnerabilities.

## Security Model Overview

### Scope Isolation
Each worker operates within a strictly defined scope (`scope.directories`, `scope.filesRead`, `scope.filesWrite`). The Auditor continuously monitors for boundary violations using `git diff --stat` and raises alerts when workers access files outside their assigned scope.

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
- **File permissions are advisory:** Scope enforcement relies on Auditor detection, not OS-level restrictions (except in sandbox mode).
- **Credentials storage:** API keys stored in `~/.deckent/credentials/` use file permissions (0600) but are not encrypted at rest.
- **tmux session visibility:** All tmux windows within the deckent session are accessible to the same OS user.

## Best Practices

1. **Use sandbox mode** (`--sandbox-mode`) for untrusted or experimental tasks.
2. **Review DIRECTIVES.md** before starting sprints to ensure task scopes are appropriate.
3. **Monitor the dashboard** (`.dashboard` file or `deckent dashboard`) during sprints.
4. **Keep deckent updated** to receive security fixes.
5. **Set appropriate file permissions** on `~/.deckent/credentials/` directory.
6. **Do not commit** `.deckent/credentials/` or API keys to version control.
7. **Use environment variables** for API keys in CI/CD pipelines instead of credential files.
