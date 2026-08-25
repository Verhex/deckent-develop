// ─── deckent rbac CLI Command (Sprint 210 210-014) ────────────────────────────
// ADR-012: register<Name>(program) pattern
// ADR-010: no new runtime dependencies

import type { Command } from 'commander';
import { can, isValidRole, PERMISSION_MATRIX } from '../../core/rbac.js';
import type { Role, Permission } from '../../core/rbac.js';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { bindGovernanceArgumentDescriptions } from '../helpers/message-catalog/cli-governance.js';

const DEFAULT_TENANT = 'default';

// ─── User Role Store (in-memory) ─────────────────────────────────────────────
// Maps userId → Role for runtime grant/revoke CLI operations.

export const userRoles = new Map<string, Role>();

/** Clear store — for test isolation only. */
export function clearUserRoles(): void {
  userRoles.clear();
}

// ─── registerRbac ─────────────────────────────────────────────────────────────

export function registerRbac(program: Command): void {
  const rbac = program
    .command('rbac')
    .description(getMessage('cli.rbac.desc', getLanguage(undefined)));

  // ── deckent rbac check <role> <action> ──────────────────────────────────────
  bindGovernanceArgumentDescriptions(
    rbac.command('check <role> <action>'),
    getLanguage(undefined),
    {
      role: 'cli.governance.rbac.arg.role',
      action: 'cli.governance.rbac.arg.action',
    },
  )
    .description(getMessage('cli.rbac.check.desc', getLanguage(undefined)))
    .option('--tenant <id>', getMessage('cli.governance.rbac.opt.tenant', getLanguage(undefined)), DEFAULT_TENANT)
    .action((role: string, action: string, opts: { tenant: string }) => {
      if (!isValidRole(role)) {
        printError(new Error(`Unknown role: "${role}". Valid roles: admin, operator, viewer`));
        process.exitCode = 1;
        return;
      }

      const allowed = can(role, action as Permission, opts.tenant);
      if (allowed) {
        print(`  ALLOWED  ${role} → ${action}`);
        process.exitCode = 0;
      } else {
        print(`  DENIED   ${role} → ${action}`);
        process.exitCode = 1;
      }
    });

  // ── deckent rbac roles ───────────────────────────────────────────────────────
  rbac
    .command('roles')
    .description(getMessage('cli.rbac.roles.desc', getLanguage(undefined)))
    .action(() => {
      const roleOrder: Role[] = ['viewer', 'operator', 'admin'];
      print('');
      print('  Role          Permissions');
      print('  ─────────────────────────────────────────────────────────────');
      for (const role of roleOrder) {
        const perms = [...PERMISSION_MATRIX[role]].join(', ');
        print(`  ${role.padEnd(14)}${perms}`);
      }
      print('');
    });

  // ── deckent rbac grant <user> <role> ────────────────────────────────────────
  bindGovernanceArgumentDescriptions(
    rbac.command('grant <user> <role>'),
    getLanguage(undefined),
    {
      user: 'cli.governance.rbac.arg.user',
      role: 'cli.governance.rbac.arg.role',
    },
  )
    .description(getMessage('cli.rbac.grant.desc', getLanguage(undefined)))
    .action((user: string, role: string) => {
      if (!isValidRole(role)) {
        printError(new Error(`Unknown role: "${role}". Valid roles: admin, operator, viewer`));
        process.exitCode = 1;
        return;
      }
      userRoles.set(user, role);
      print(`  GRANTED  ${user} → ${role}`);
      process.exitCode = 0;
    });

  // ── deckent rbac revoke <user> ───────────────────────────────────────────────
  bindGovernanceArgumentDescriptions(
    rbac.command('revoke <user>'),
    getLanguage(undefined),
    { user: 'cli.governance.rbac.arg.user' },
  )
    .description(getMessage('cli.rbac.revoke.desc', getLanguage(undefined)))
    .action((user: string) => {
      if (!userRoles.has(user)) {
        print(`  WARN     no role assigned to "${user}"`);
        process.exitCode = 0;
        return;
      }
      userRoles.delete(user);
      print(`  REVOKED  ${user}`);
      process.exitCode = 0;
    });
}
