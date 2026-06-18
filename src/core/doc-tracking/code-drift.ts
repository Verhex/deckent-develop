import { spawn } from 'node:child_process';
import { matchGlob } from './glob.js';
import { getFileGitDateAsync } from './git-date.js';

// `git ls-files` → tracked repo-relative POSIX paths. Empty list on any failure
// (no git, error, timeout) — code-drift then resolves to null (no fabrication).
function gitLsFiles(root: string): Promise<string[]> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (v: string[]) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const p = spawn('git', ['ls-files'], { cwd: root });
      const timer = setTimeout(() => { p.kill(); done([]); }, 5000);
      p.stdout.on('data', (d) => { out += d.toString(); });
      p.on('error', () => { clearTimeout(timer); done([]); });
      p.on('close', () => {
        clearTimeout(timer);
        done(out.split('\n').map((s) => s.trim()).filter(Boolean));
      });
    } catch {
      done([]);
    }
  });
}

export async function resolveTrackedFiles(root: string, tracks: string[]): Promise<string[]> {
  if (!tracks.length) return [];
  const all = await gitLsFiles(root);
  const result = new Set<string>();
  for (const t of tracks) {
    if (t.includes('*')) {
      for (const f of all) if (matchGlob(f, t)) result.add(f);
    } else {
      // plain path — include regardless of tracked status; getFileGitDateAsync
      // falls back to mtime for untracked files.
      result.add(t);
    }
  }
  return [...result];
}

export async function computeCodeDrift(
  root: string,
  tracks: string[] | null,
  docLastUpdatedMs: number,
): Promise<boolean | null> {
  if (!tracks || tracks.length === 0) return null;
  const files = await resolveTrackedFiles(root, tracks);
  if (files.length === 0) return null;
  for (const f of files) {
    const ms = await getFileGitDateAsync(root, f);
    if (ms > 0 && ms > docLastUpdatedMs) return true;
  }
  return false;
}
