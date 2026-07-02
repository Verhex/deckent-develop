# POSIX-sh Portability (Container/Wrapper Scripts)

> born-466 + born-467 (WRAPPER-P0-FIX, `spawn-backend-docker.ts` + `tmux.ts` 466-parity):
> two independent `$?`/tracked-diff traps shipped and were only caught by a live analysis
> pass. Both are fixed in every backend now — this skill exists so a THIRD backend doesn't
> reintroduce them.

### `$?` Masking
- `$?` reflects the LAST command that ran — an intervening `rm`, `echo`, or trap-internal
  command silently resets it to 0 on every path (born-466). If you need the REAL exit code
  of a specific command, capture it into a named variable (`CLAUDE_EXIT=$?`) IMMEDIATELY
  after that command, before any other statement runs — never read `$?` several lines
  later inside a trap/function and assume it is still that command's code.
- In an EXIT trap, prefer the captured variable over a bare `$?`:
  `local exit_code=${CLAUDE_EXIT:-$?}`.

### `local` in POSIX sh
- `local` is not in the strict POSIX spec but IS supported by `dash`, `bash`, and BusyBox
  `ash` — the shells `sh -c` actually resolves to in every container base image this
  project targets. Safe inside a shell FUNCTION; do not assume it works at the top level
  of a script (it does not — there is no enclosing function scope there).

### Trap Exit Codes
- `trap '...' EXIT` fires on every exit path (normal, crash, timeout) — the one place
  cleanup is guaranteed to run.
- A `TERM` trap should `exit 143` explicitly (128 + signal 15) so the parent's exit-code
  classification is unambiguous instead of falling through to whatever the last command
  happened to return.
- `timeout -k 30 $T cmd` sends TERM at `$T`, then hard-KILLs after a 30s grace if the
  process swallows TERM — without `-k`, a TERM-ignoring worker never actually dies.
- Gate a `.timeout` marker write on the EXACT codes that mean timeout: 124 (GNU
  `timeout`'s own TERM-timeout code) or 137 (128+9, KILL) — any other non-zero code is a
  real failure, not a timeout, and must not be misclassified as one.

### Untracked Files in Git Diff Detection
- `git diff --name-only` only shows TRACKED file changes — a worker that creates brand-new
  files (the common case: new test files) produces an empty diff even though real work
  happened (born-467). Always union in `git ls-files --others --exclude-standard` so
  untracked-but-not-gitignored new files count as "work present".

## Anti-Patterns to Avoid
- Reading `$?` after any command other than the one you meant to check.
- `timeout $T cmd` without `-k` — a signal-ignoring process never actually terminates.
- Classifying any non-zero exit as a timeout instead of checking 124/137 specifically.
- `git diff --stat` alone as a "did the worker do anything" check — misses new files.

## Karpathy Notes
- **Think before coding:** POSIX-sh footguns are invisible until the exact shell/exit-path
  combination that triggers them runs in production — read the wrapper's actual
  `trap`/exit flow before touching it, do not pattern-match from a different script.
- **Goal-driven:** a wrapper fix is not done until it is verified against the SAME parity
  gap in every backend that shares the pattern (tmux.ts mirrored spawn-backend-docker.ts).
