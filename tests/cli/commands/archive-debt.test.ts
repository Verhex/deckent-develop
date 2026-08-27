import { afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { getLanguage, getMessage } from '../../../src/cli/helpers/messages.js';
import { registerArchiveDebt } from '../../../src/cli/commands/archive-debt.js';
import { registerAttach } from '../../../src/cli/commands/attach.js';
import { registerCheckpoint } from '../../../src/cli/commands/checkpoint.js';
import { registerConfirmationsCommand } from '../../../src/cli/commands/confirmations.js';
import { registerDashboard } from '../../../src/cli/commands/dashboard.js';
import { registerOutput } from '../../../src/cli/commands/output.js';
import { registerPlanNl } from '../../../src/cli/commands/plan-nl.js';
import { registerAuditVerify } from '../../../src/cli/commands/audit-verify.js';
import { registerAutonomousMission } from '../../../src/cli/commands/autonomous-mission.js';
import { registerExplain } from '../../../src/cli/commands/explain.js';
import { registerRecall } from '../../../src/cli/commands/recall.js';
import { registerRemember } from '../../../src/cli/commands/remember.js';

const aliases = [
  [registerArchiveDebt, 'archive-debt', 'status', ['--debt'], 'cli.batch.deprecated.archive_debt'],
  [registerAttach, 'attach', 'watch', [], 'cli.batch.deprecated.attach'],
  [registerCheckpoint, 'checkpoint', 'approvals', [], 'cli.batch.deprecated.checkpoint'],
  [registerConfirmationsCommand, 'confirmations', 'approvals', [], 'cli.batch.deprecated.confirmations'],
  [registerDashboard, 'dashboard', 'status', ['--watch'], 'cli.batch.deprecated.dashboard'],
  [registerOutput, 'output', 'watch', ['--logs'], 'cli.batch.deprecated.output'],
  [registerPlanNl, 'plan-nl', 'do', [], 'cli.batch.deprecated.plan_nl'],
  [registerAuditVerify, 'audit-verify', 'audit', [], 'cli.batch.deprecated.audit_verify'],
  [registerAutonomousMission, 'autonomous-mission', 'autonomous', [], 'cli.batch.deprecated.autonomous_mission'],
  [registerExplain, 'explain', 'retro', ['--explain'], 'cli.batch.deprecated.explain'],
  [registerRecall, 'recall', 'memory', [], 'cli.batch.deprecated.recall'],
  [registerRemember, 'remember', 'memory', [], 'cli.batch.deprecated.remember'],
] as const;

afterEach(() => vi.restoreAllMocks());

describe('deprecated aliases', () => {
  it.each(aliases)('%s emits one catalog warning and forwards every argument', async (
    register,
    alias,
    target,
    injected,
    warningKey,
  ) => {
    const program = new Command();
    const received = vi.fn();
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const root = program.command(`${target} [args...]`).allowUnknownOption(true)
      .action((args: string[]) => received(args));
    const nested = alias === 'audit-verify' ? 'verify'
      : alias === 'autonomous-mission' ? 'mission'
      : alias === 'recall' ? 'recall'
      : alias === 'remember' ? 'remember'
      : undefined;
    if (nested) {
      root.command(`${nested} [args...]`).allowUnknownOption(true)
        .action((args: string[]) => received(args));
    }
    register(program);

    await program.parseAsync(['node', 'test', alias, 'value', '--extra', 'flag'], { from: 'node' });

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith([...injected, 'value', '--extra', 'flag']);
    expect(write.mock.calls.map(([line]) => String(line))).toEqual([
      `${getMessage(warningKey, getLanguage(undefined))}\n`,
    ]);
  });
});
