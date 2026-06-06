// ═══ scope-guard — write/edit path enforcement for agentic worker (T-233-001) ═══
//
// ADR-037 RBAC: the agentic worker (F1-013) hard-rejects write/edit attempts
// outside the assigned task scope. Local-model workers HARD-enforce (not the
// advisory/soft path used by tmux CLI workers) so the model self-corrects via
// a tool-result error string instead of silently corrupting the working tree.
//
// Pure function — no I/O. Used by `agentic-worker-runner.ts` *before* it hands
// a write_file/edit_file call to the chat-tool-exec dispatcher.
//
// Path semantics:
//   • `scope.filesWrite` entries are project-root-relative file paths
//     (exact match against the target's relative path).
//   • `scope.directories` entries are project-root-relative directory paths
//     (prefix match — both "src/agents" and "src/agents/" are accepted).
//   • Absolute targets that resolve outside `projectRoot` are always rejected
//     (escape attempts via `..` or absolute paths to /tmp/etc).

import { isAbsolute, resolve, relative, sep } from 'node:path';

export interface ScopeLike {
  filesWrite: string[];
  directories: string[];
}

/**
 * Return `true` iff `targetPath` is a safe write target inside `scope` rooted
 * at `projectRoot`. Returns `false` for any out-of-root escape, unlisted file,
 * or directory mismatch.
 */
export function isPathInScope(
  targetPath: string,
  scope: ScopeLike,
  projectRoot: string,
): boolean {
  if (typeof targetPath !== 'string' || targetPath.length === 0) return false;

  const absRoot = resolve(projectRoot);
  const absTarget = isAbsolute(targetPath) ? resolve(targetPath) : resolve(absRoot, targetPath);

  // Reject escape: target must be inside projectRoot.
  const relFromRoot = relative(absRoot, absTarget);
  if (relFromRoot.length === 0 || relFromRoot.startsWith('..') || isAbsolute(relFromRoot)) {
    return false;
  }

  // Normalize to forward slashes for cross-platform comparison.
  const relPosix = relFromRoot.split(sep).join('/');

  // Exact match against scope.filesWrite.
  for (const f of scope.filesWrite) {
    const norm = f.replace(/^\.\/+/, '').replace(/\/+$/, '');
    if (norm === relPosix) return true;
  }

  // Prefix match against scope.directories — trailing slash tolerant.
  for (const d of scope.directories) {
    const norm = d.replace(/^\.\/+/, '').replace(/\/+$/, '');
    if (norm.length === 0) continue;
    if (relPosix === norm) return false; // a bare directory is not a file target
    if (relPosix.startsWith(norm + '/')) return true;
  }

  return false;
}
