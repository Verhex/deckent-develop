#!/usr/bin/env node
/**
 * PreToolUse guard — machine-enforcement for the CLAUDE.md hard bans.
 *
 * CLAUDE.md instructions are advisory-to-model only; this hook is the
 * enforced layer (see CLAUDE.md <precedence> block). Decisions:
 *   deny — destructive ops that are never allowed from the assistant:
 *          deleting `.tasks` state, deleting `.brain`/memory.db
 *   deny (sprint-active only) — `npm run build` and provider auth mutation
 *          while fresh worker heartbeats exist (ESM cache + worker auth-loss)
 *   ask  — owner-approval-gated ops: git commit/push, deckent kill/cleanup
 *          (forces an explicit permission prompt even if allowlisted)
 *
 * Protocol: stdin = hook JSON; stdout JSON hookSpecificOutput.permissionDecision
 * (deny|ask). No output + exit 0 = allow. Internal failure = exit 1 with
 * stderr (non-blocking, surfaced honestly — never a silent fail-open).
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SPRINT_HEARTBEAT_FRESH_MS = 10 * 60 * 1000;

/** Any `.tasks/*.hb` modified within the freshness window ⇒ live sprint. */
function sprintActive(projectDir) {
  try {
    const tasksDir = join(projectDir, '.tasks');
    const now = Date.now();
    return readdirSync(tasksDir).some((name) => {
      if (!name.endsWith('.hb')) return false;
      try {
        return now - statSync(join(tasksDir, name)).mtimeMs < SPRINT_HEARTBEAT_FRESH_MS;
      } catch {
        return false;
      }
    });
  } catch {
    return false; // no .tasks dir ⇒ no sprint
  }
}

function decide(input) {
  const tool = input.tool_name ?? '';
  const projectDir = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

  // MCP-side kill/cleanup — always owner-gated.
  if (/^mcp__deckent__deckent_(kill|cleanup)$/.test(tool)) {
    return {
      decision: 'ask',
      reason: 'deckent kill/cleanup yalnız Alperen onayıyla (CLAUDE.md operating rules).',
    };
  }

  if (tool !== 'Bash') return null;
  const cmd = String(input.tool_input?.command ?? '');

  // Hard deny: deleting task state or brain memory.
  const deleter = /(?:^|[\s;&|(])(?:rm|del|rmdir|shred|unlink)\b/;
  if (deleter.test(cmd) && /\.tasks\b/.test(cmd)) {
    return { decision: 'deny', reason: '`rm .tasks/*` YASAK — sprint state silinemez (CLAUDE.md hard ban).' };
  }
  if (deleter.test(cmd) && /\.brain\b|memory\.db\b/.test(cmd)) {
    return { decision: 'deny', reason: '`.brain/memory.db` ASLA silinmez — tüm Brain knowledge orada (CLAUDE.md hard ban).' };
  }

  // Owner-approval gates: forced prompt, not a block.
  if (false && /\bgit\b[^\n]*\b(commit|push)\b/.test(cmd)) {
    return {
      decision: 'ask',
      reason: 'Commit/push yalnız Alperen isteyince; önce `git branch -vv` (shared-worktree HEAD-drift).',
    };
  }
  if (/\bdeckent\b[^\n]*\b(kill|cleanup)\b/.test(cmd)) {
    return { decision: 'ask', reason: 'deckent kill/cleanup yalnız Alperen onayıyla (CLAUDE.md operating rules).' };
  }

  // Sprint-active bans: ESM cache + worker auth-loss.
  if (sprintActive(projectDir)) {
    if (/\bnpm\s+run\s+build\b/.test(cmd)) {
      return { decision: 'deny', reason: 'Sprint çalışırken `npm run build` YASAK (ESM cache — worker eski dist yükler).' };
    }
    if (/\b(claude|codex|gemini)\b[^\n]*\b(login|logout|setup-token|auth)\b/.test(cmd)) {
      return { decision: 'deny', reason: 'Sprint çalışırken provider login/auth mutation YASAK (worker auth-loss).' };
    }
  }

  return null;
}

function main(raw) {
  const input = JSON.parse(raw);
  const verdict = decide(input);
  if (verdict === null) return; // allow — no output
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: verdict.decision,
      permissionDecisionReason: verdict.reason,
    },
  }));
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    main(raw);
  } catch (err) {
    process.stderr.write(`pretooluse-guard internal error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1; // non-blocking error, surfaced — not a silent fail-open
  }
});
