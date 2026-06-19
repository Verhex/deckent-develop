import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../');

// ─── F1-DF: Dockerfile.worker ships in npm package ──────────────────────────

describe('F1-DF — Dockerfile.worker ships in npm package', () => {
  it('package.json files[] includes "assets"', () => {
    const pkg = JSON.parse(
      readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const files = pkg['files'] as string[];
    expect(files).toContain('assets');
  });

  it('assets/Dockerfile.worker exists', () => {
    const dockerfilePath = join(PROJECT_ROOT, 'assets', 'Dockerfile.worker');
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it('assets/Dockerfile.worker contains required build-arg markers', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'assets', 'Dockerfile.worker'),
      'utf-8',
    );
    expect(content).toContain('INSTALL_CODEX');
    expect(content).toContain('INSTALL_GEMINI');
    expect(content).toContain('ca-certificates');
    expect(content).toContain('@anthropic-ai/claude-code');
  });

  it('npm pack --dry-run lists assets/Dockerfile.worker', async () => {
    const packFiles = await new Promise<string[]>((resolve, reject) => {
      const proc = spawn(
        'npm',
        ['pack', '--dry-run', '--json', '--ignore-scripts'],
        { cwd: PROJECT_ROOT, env: { ...process.env } },
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`npm pack --dry-run failed (exit ${code}): ${stderr}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as Array<{ files?: Array<{ path: string }> }>;
          const files = (parsed[0]?.files ?? []).map((f) => f.path);
          resolve(files);
        } catch {
          // fallback: parse npm notice lines from stderr
          const files = stderr
            .split('\n')
            .filter((l) => l.includes('npm notice') && /\d+[kKmMbB]/.test(l))
            .map((l) => l.replace(/^.*npm notice\s+[\d.]+\s*[kKmMbBiI]+\s+/, '').trim())
            .filter(Boolean);
          resolve(files);
        }
      });
      proc.on('error', reject);
    });

    const hasDockerfile = packFiles.some((f) => f.includes('Dockerfile.worker'));
    expect(
      hasDockerfile,
      `Expected Dockerfile.worker in pack file list. Got: ${packFiles.slice(0, 20).join(', ')}`,
    ).toBe(true);
  }, 30_000);
});
