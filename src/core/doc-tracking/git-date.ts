import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

function gitLogDate(root: string, filePath: string): Promise<number> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (v: number) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const p = spawn('git', ['log', '-1', '--format=%aI', '--', filePath], { cwd: root });
      const timer = setTimeout(() => { p.kill(); done(0); }, 5000);
      p.stdout.on('data', (d) => { out += d.toString(); });
      p.on('error', () => { clearTimeout(timer); done(0); });
      p.on('close', () => {
        clearTimeout(timer);
        const ts = new Date(out.trim()).getTime();
        done(out.trim() && !isNaN(ts) ? ts : 0);
      });
    } catch {
      done(0);
    }
  });
}

export async function getFileGitDateAsync(root: string, filePath: string): Promise<number> {
  const gitMs = await gitLogDate(root, filePath);
  if (gitMs > 0) return gitMs;
  try {
    return statSync(join(root, filePath)).mtimeMs;
  } catch {
    return 0;
  }
}
