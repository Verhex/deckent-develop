// ═══ pid-liveness — portable process-alive check ═════════════════════
// Sprint 178 Task 4 (worker 178-006).
//
// Replaces 7 ad-hoc copies of `process.kill(pid, 0)` scattered across
// the codebase with a single, deterministic, cross-platform helper.
//
// Behavior contract:
//  - Returns `false` for invalid input (NaN, ≤0, non-integer, Infinity).
//  - On linux: checks `/proc/<pid>` existence — avoids the EPERM ambiguity
//    that flakes CI on container runtimes where signal permissions vary.
//  - On darwin/win32: falls back to `process.kill(pid, 0)` and treats
//    EPERM as "alive but not ours" (POSIX convention).
//  - Never throws.

import { existsSync } from 'node:fs';

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  if (process.platform === 'linux') {
    return existsSync(`/proc/${pid}`);
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}
