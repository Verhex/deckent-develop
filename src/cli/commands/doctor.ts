import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import type { DoctorResult } from '../../core/types.js';
import { print, formatDoctorResult } from '../helpers/output.js';

interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
  required: boolean;
}

function checkNode(): DoctorCheck {
  const result = spawnSync('node', ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    return { name: 'Node.js', passed: false, message: 'not found', required: true };
  }
  const version = result.stdout.trim();
  const major = parseInt(version.replace('v', '').split('.')[0] ?? '0', 10);
  return {
    name: 'Node.js',
    passed: major >= 18,
    message: `${version} (>=18 required)`,
    required: true,
  };
}

function checkGit(): DoctorCheck {
  const result = spawnSync('git', ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    return { name: 'git', passed: false, message: 'not found', required: true };
  }
  const match = result.stdout.trim().match(/(\d+\.\d+\.\d+)/);
  return {
    name: 'git',
    passed: true,
    message: match ? `v${match[1]}` : result.stdout.trim(),
    required: true,
  };
}

function checkTmux(): DoctorCheck {
  const result = spawnSync('tmux', ['-V'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    return { name: 'tmux', passed: false, message: 'not found', required: true };
  }
  return {
    name: 'tmux',
    passed: true,
    message: result.stdout.trim(),
    required: true,
  };
}

function checkClaude(): DoctorCheck {
  const result = spawnSync('claude', ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    return { name: 'Claude CLI', passed: false, message: 'not found', required: true };
  }
  return {
    name: 'Claude CLI',
    passed: true,
    message: `v${result.stdout.trim()}`,
    required: true,
  };
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check system dependencies and health')
    .action(() => {
      const checks: DoctorCheck[] = [checkNode(), checkGit(), checkTmux(), checkClaude()];
      const result: DoctorResult = {
        ok: checks.every((c) => c.passed),
        checks,
      };
      print(formatDoctorResult(result));
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
