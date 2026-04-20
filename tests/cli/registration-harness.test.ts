/**
 * CLI Registration Harness
 *
 * Automatically verifies that every CLI command file with a `register*` function
 * is properly imported and called in src/cli/index.ts.
 *
 * Prevents regressions like the registerResume omission (Sprint 145 audit finding #5).
 *
 * ADR-012: register<Name>(program) pattern — each command file must export registerX
 * and that function must be imported + called in index.ts.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const COMMANDS_DIR = 'src/cli/commands';
const INDEX_FILE = 'src/cli/index.ts';

const indexContent = readFileSync(INDEX_FILE, 'utf-8');

// Commands that are worker-internal helpers — not user-facing CLI commands.
// These are excluded from the registration check.
const INTERNAL_COMMANDS = new Set([
  'heartbeat.ts', // worker heartbeat daemon — spawned internally, not a CLI command
  'output.ts',    // output helper — internal utility, not a CLI subcommand
]);

// Commands whose register* functions are registered on a parent subcommand rather
// than directly on the root program. These are valid but their registration lives
// inside another command file (e.g. skill-marketplace is registered by skill.ts).
const SUBCOMMAND_REGISTERED = new Set([
  'skill-marketplace.ts', // registerSkillMarketplace(skillCmd) called inside skill.ts
]);

const commandFiles = readdirSync(COMMANDS_DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
);

describe('CLI registration harness', () => {
  for (const file of commandFiles) {
    if (INTERNAL_COMMANDS.has(file)) continue;

    const content = readFileSync(join(COMMANDS_DIR, file), 'utf-8');
    const match = content.match(/export function (register\w+)\s*\(/);
    if (!match) continue;

    const fnName = match[1];

    if (SUBCOMMAND_REGISTERED.has(file)) {
      // Verify it's registered somewhere (not necessarily in index.ts directly).
      // Just confirm the function exists in the file — checked via match above.
      it(`${file}: ${fnName} is registered via parent subcommand (not index.ts direct)`, () => {
        // Find at least one other command file that imports and calls this function
        const allFiles = readdirSync(COMMANDS_DIR).filter(
          (f) => f.endsWith('.ts') && f !== file,
        );
        const calledInSibling = allFiles.some((sibling) => {
          const siblingContent = readFileSync(join(COMMANDS_DIR, sibling), 'utf-8');
          return siblingContent.includes(fnName);
        });
        expect(calledInSibling).toBe(true);
      });
      continue;
    }

    it(`${file}: ${fnName} is imported and called in index.ts`, () => {
      expect(indexContent).toMatch(
        new RegExp(`import\\s*\\{[^}]*${fnName}[^}]*\\}\\s*from`),
      );
      expect(indexContent).toMatch(
        new RegExp(`${fnName}\\s*\\(\\s*program\\s*\\)`),
      );
    });
  }
});
