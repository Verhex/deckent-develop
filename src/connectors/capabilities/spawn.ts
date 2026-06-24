import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnFn, SpawnResult } from './types.js';

// Async spawn wrapper (NEVER spawnSync). Rejects on spawn error (e.g. ENOENT),
// resolves with {code, stdout, stderr} otherwise. Honors an optional timeout.
export const defaultSpawn: SpawnFn = (cmd, args, opts) =>
  new Promise<SpawnResult>((resolve, reject) => {
    const child = nodeSpawn(cmd, [...args], { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    const timer = opts?.timeoutMs
      ? setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`spawn timeout: ${cmd}`)); }, opts.timeoutMs)
      : undefined;
    child.stdout?.on('data', (d: Buffer) => out.push(d));
    child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code: code ?? 0, stdout: Buffer.concat(out), stderr: err }); });
  });
