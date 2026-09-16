#!/usr/bin/env node
/**
 * Codex PreToolUse guard for repository hard bans.
 *
 * Machine-denied here:
 *   - deleting `.tasks` state
 *   - deleting `.brain` or `memory.db`
 *   - `npm run build*` while a fresh worker heartbeat exists
 *   - provider auth mutation while a fresh worker heartbeat exists
 *
 * Owner-approval gates are intentionally not implemented here because Codex
 * PreToolUse does not support `permissionDecision: "ask"`. Shell gates live in
 * `.codex/rules/deckent-safety.rules`; MCP gates live in `.codex/config.toml`.
 *
 * Protocol: stdin is Codex hook JSON. A deny verdict is emitted as
 * hookSpecificOutput. No output plus exit 0 means allow. Malformed input and
 * internal failures fail closed with a valid deny verdict.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

const SPRINT_HEARTBEAT_FRESH_MS = 10 * 60 * 1000;
const DELETE_COMMAND_RE = /(?:^|[\s;&|()])(?:rm|del|rmdir|shred|unlink)(?=$|[\s;&|()])/i;
const TASK_STATE_RE = /\.tasks(?:[\\/]|(?=$)|(?=[\s"'`;&|()]))/i;
const BRAIN_STATE_RE = /\.brain(?:[\\/]|(?=$)|(?=[\s"'`;&|()]))|\bmemory\.db\b/i;
const BUILD_RE = /(?:^|[\s;&|()])npm\s+run\s+build(?=$|[\s:;&|()])/i;
const AUTH_RE =
  /(?:^|[\s;&|()])(?:claude|codex|gemini)(?:\.exe)?\b[^\n;&|]*\b(?:login|logout|auth|setup-token)\b/i;

function findProjectRoot(cwd) {
  let current = resolve(cwd);
  const filesystemRoot = parse(current).root;

  while (true) {
    if (existsSync(join(current, '.git')) || existsSync(join(current, '.deckent'))) {
      return current;
    }
    if (current === filesystemRoot) return resolve(cwd);
    current = dirname(current);
  }
}

/** Any `.tasks/*.hb` modified within the freshness window means live sprint. */
function sprintActive(projectRoot) {
  try {
    const tasksDir = join(projectRoot, '.tasks');
    const now = Date.now();
    return readdirSync(tasksDir).some((name) => {
      if (!name.endsWith('.hb')) return false;
      try {
        const ageMs = now - statSync(join(tasksDir, name)).mtimeMs;
        return ageMs >= 0 && ageMs < SPRINT_HEARTBEAT_FRESH_MS;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function deny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function decide(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return deny('Codex safety hook malformed input aldı; komut fail-closed engellendi.');
  }
  if (input.tool_name !== 'Bash') return null;

  const command = input.tool_input?.command;
  if (typeof command !== 'string') {
    return deny('Codex safety hook Bash command alanını okuyamadı; komut fail-closed engellendi.');
  }

  if (DELETE_COMMAND_RE.test(command) && TASK_STATE_RE.test(command)) {
    return deny('`.tasks` sprint state silinemez.');
  }
  if (DELETE_COMMAND_RE.test(command) && BRAIN_STATE_RE.test(command)) {
    return deny('`.brain` ve `memory.db` Brain knowledge silinemez.');
  }

  const cwd = typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : process.cwd();
  if (sprintActive(findProjectRoot(cwd))) {
    if (BUILD_RE.test(command)) {
      return deny('Fresh worker heartbeat varken `npm run build*` yasaktır (ESM cache riski).');
    }
    if (AUTH_RE.test(command)) {
      return deny('Fresh worker heartbeat varken provider auth mutation yasaktır (worker auth-loss riski).');
    }
  }

  return null;
}

function emit(verdict) {
  if (verdict !== null) process.stdout.write(JSON.stringify(verdict));
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    emit(decide(JSON.parse(raw)));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emit(deny(`Codex safety hook internal error verdi; komut fail-closed engellendi: ${detail}`));
  }
});
