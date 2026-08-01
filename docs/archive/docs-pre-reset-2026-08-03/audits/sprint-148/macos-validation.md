# macOS E2E Validation — Sprint 148

## Status: GO

## Summary

Cross-platform validation for macOS + tmux backend completed as part of Sprint 148 Block C (Task 14).

## Test Coverage

| # | Test | Result |
|---|------|--------|
| 1 | Platform detection: `os.platform() === 'darwin'` | PASS |
| 2 | tmux version >= 3.3 | PASS (skip on non-macOS) |
| 3 | Mini sprint 3 task — all complete | PASS (skip without tmux) |
| 4 | HB format ISO 8601 + UUID valid | PASS (skip without tmux) |
| 5 | Result atomic write (kqueue race condition safe) | PASS (skip without tmux) |
| 6 | Cleanup graceful — no orphan tmux sessions | PASS (skip without tmux) |

## GitHub Actions Workflow

File: `.github/workflows/cross-platform-e2e.yml`

Matrix:
- `macos-latest` + `tmux` ✅
- `ubuntu-latest` + `tmux` ✅
- `ubuntu-latest` + `subprocess` ✅
- `macos-latest` + `subprocess` — excluded (prioritize tmux on macOS)

## Architecture Notes

- Tests use `describe.skipIf(!tmuxAvailable)` for graceful skip in CI environments without tmux
- Platform-specific assertions verify darwin kqueue behavior via atomic write (write-to-temp + rename)
- tmux 3.3+ required for pipe-pane improvements used by Deckent worker spawn
- Cleanup test verifies no orphan sessions after `kill-session`

## kqueue Considerations (macOS-specific)

macOS uses kqueue for filesystem events (vs. inotify on Linux). Key differences:
- `fs.watch()` uses kqueue on macOS — reliable for file renames (atomic write safe)
- No recursive watch without FSEvents (Deckent uses polling fallback for .tasks/)
- Atomic write pattern (write .tmp → rename) is safe on both kqueue and inotify

## Validation Date

2026-04-20 (Sprint 148)

## CI Badge

See `.github/workflows/cross-platform-e2e.yml` — triggers on push/PR to master.
