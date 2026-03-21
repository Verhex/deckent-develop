import { execSync } from 'node:child_process';
import { platform } from 'node:os';

function tryExec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000 }).toString().trim();
  } catch {
    return '';
  }
}

export interface VersionJson {
  version: string;
  node: string;
  os: string;
  tmux: string;
  claude: string;
}

export function buildVersionJson(version: string): VersionJson {
  const tmuxOut = tryExec('tmux -V');
  const claudeOut = tryExec('claude --version');

  return {
    version,
    node: process.version,
    os: platform(),
    tmux: tmuxOut || 'n/a',
    claude: claudeOut || 'n/a',
  };
}

export function buildVersionString(version: string): string {
  const info = buildVersionJson(version);
  return `deckent v${info.version} | Node ${info.node} | ${info.os} | tmux ${info.tmux} | claude ${info.claude}`;
}
