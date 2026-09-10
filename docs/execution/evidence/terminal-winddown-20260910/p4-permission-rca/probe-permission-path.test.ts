/**
 * P4 permission RCA — deterministic permission-path probe (evidence-only).
 * Run: npx vitest run docs/execution/evidence/terminal-winddown-20260910/p4-permission-rca/probe-permission-path.test.ts
 */
import { describe, expect, it } from 'vitest';
import { decide, resolveTier } from '../../../../../src/agent/permission.js';
import { SAFE_DEFAULT_POLICY } from '../../../../../src/agent/permission-policy.js';
import { classifyNativeToolApproval } from '../../../../../src/agent/native-tool-approval.js';
import { permissionResource } from '../../../../../src/agent/loop.js';
import { buildNativeToolRegistry } from '../../../../../src/cli/repl/native-tool-registry.js';
import { classifyShellCommand } from '../../../../../src/agent/guards/shell-risk.js';
import { resolveShellDialectForPlatform } from '../../../../../src/core/shell-readonly-classifier.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type LoopAskGuard =
  | 'not-ask'
  | 'blocked-reasonCode'
  | 'blocked-invalid'
  | 'blocked-resource-mismatch'
  | 'would-prompt';

function loopAskGuard(
  decision: string,
  approval: ReturnType<typeof classifyNativeToolApproval>,
  resource: string,
): LoopAskGuard {
  if (decision !== 'ask') return 'not-ask';
  if ('reasonCode' in approval) return 'blocked-reasonCode';
  if (approval.resource !== resource) return 'blocked-resource-mismatch';
  const valid = ['file-read', 'file-write', 'shell-exec', 'git-mutation', 'network', 'credential', 'lifecycle'].includes(approval.scope)
    && ['none', 'low', 'medium', 'high', 'critical'].includes(approval.risk)
    && typeof approval.scopeId === 'string'
    && approval.scopeId.trim() === approval.scopeId
    && approval.scopeId.length > 0;
  return valid ? 'would-prompt' : 'blocked-invalid';
}

function resolvePermissionLikeLoop(options: {
  tool: string;
  args: Record<string, unknown>;
  cwd: string;
  mode: 'suggest' | 'auto-edit' | 'full-auto';
  policy?: typeof SAFE_DEFAULT_POLICY;
}) {
  const cwd = options.cwd;
  const registry = buildNativeToolRegistry({ cwd: () => cwd });
  const def = registry.get(options.tool);
  if (!def) throw new Error(`missing tool ${options.tool}`);
  const policy = options.policy ?? SAFE_DEFAULT_POLICY;
  const resource = permissionResource(options.tool, options.args);
  let tier = resolveTier(def, policy);
  const isShellTool = options.tool === 'bash' || options.tool.endsWith('_bash');
  if (isShellTool) {
    const rawShellCommand = options.args['command'] ?? options.args['cmd'] ?? resource;
    const shellCommand = typeof rawShellCommand === 'string' ? rawShellCommand : '';
    const shellRisk = classifyShellCommand(shellCommand, {
      projectRoot: cwd,
      dialect: resolveShellDialectForPlatform(),
    });
    if (shellRisk.risk === 'destructive') tier = 'always';
    else if (shellRisk.risk === 'safe-read') tier = 'silent';
  }
  const approval = classifyNativeToolApproval(def.approval, options.args, resource);
  const decision = decide(options.tool, resource, tier, {
    rules: [],
    denies: [],
    policy,
    mode: options.mode,
  });
  const askGuard = loopAskGuard(decision, approval, resource);
  return { tier, decision, approval, resource, askGuard, hasApprovalProducer: def.approval !== undefined };
}

describe('P4 permission RCA probe', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'deckent-p4-rca-'));

  it('default registry: deckent_read_file and deckent_list_dir auto-allow (silent, no approval producer)', () => {
    for (const tool of ['deckent_read_file', 'deckent_list_dir'] as const) {
      const r = resolvePermissionLikeLoop({
        tool,
        args: tool === 'deckent_read_file' ? { path: 'docs/MASTER-PLAN.md' } : { path: 'docs' },
        cwd,
        mode: 'suggest',
      });
      expect(r.tier).toBe('silent');
      expect(r.decision).toBe('allow');
      expect(r.askGuard).toBe('not-ask');
      expect(r.hasApprovalProducer).toBe(true);
      expect('reasonCode' in r.approval).toBe(false);
    }
  });

  it('list_dir with empty args uses permission resource "." on confirm tier', () => {
    const policy = {
      ...SAFE_DEFAULT_POLICY,
      tierMap: { deckent_list_dir: 'confirm' as const },
    };
    const r = resolvePermissionLikeLoop({
      tool: 'deckent_list_dir',
      args: {},
      cwd,
      mode: 'suggest',
      policy,
    });
    expect(r.resource).toBe('.');
    expect(r.decision).toBe('ask');
    expect(r.askGuard).toBe('would-prompt');
  });

  it('if tierMap forces confirm on read_file, missing approval producer blocks ask with reasonCode', () => {
    const policy = {
      ...SAFE_DEFAULT_POLICY,
      tierMap: { deckent_read_file: 'confirm' as const },
    };
    const r = resolvePermissionLikeLoop({
      tool: 'deckent_read_file',
      args: { path: 'README.md' },
      cwd,
      mode: 'suggest',
      policy,
    });
    expect(r.tier).toBe('confirm');
    expect(r.decision).toBe('ask');
    expect(r.askGuard).toBe('would-prompt');
  });

  it('deckent_bash: safe-read shellRisk downgrades confirm tier to silent allow without approval prompt path', () => {
    const repoCwd = join(process.cwd());
    const r = resolvePermissionLikeLoop({
      tool: 'deckent_bash',
      args: { cmd: 'grep -rn permission src/agent/loop.ts' },
      cwd: repoCwd,
      mode: 'suggest',
    });
    expect(r.tier).toBe('silent');
    expect(r.decision).toBe('allow');
    expect(r.askGuard).toBe('not-ask');
  });

  it('deckent_bash: non-safe-read stays confirm+ask with valid file-read/shell-exec classification when cmd present', () => {
    const r = resolvePermissionLikeLoop({
      tool: 'deckent_bash',
      args: { cmd: 'npm test' },
      cwd,
      mode: 'suggest',
    });
    expect(r.decision).toBe('ask');
    expect('reasonCode' in r.approval).toBe(false);
    expect(r.askGuard).toBe('would-prompt');
  });

  it('deckent_bash: empty cmd yields reasonCode on ask path', () => {
    const r = resolvePermissionLikeLoop({
      tool: 'deckent_bash',
      args: {},
      cwd,
      mode: 'suggest',
    });
    expect(r.decision).toBe('ask');
    expect(r.askGuard).toBe('blocked-reasonCode');
  });
});
