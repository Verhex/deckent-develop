#!/usr/bin/env node
/**
 * agent-prompt-validator.mjs
 * Validates that no agent PROMPT.md contains rubricScores self-report spec.
 * Rubric scores are computed by Brain QualityAssessor — workers must not self-report.
 *
 * Sprint 148 T-148-005: rubric spec cleanup completion verification.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const agentsDir = '.deckent/agents';

if (!existsSync(agentsDir)) {
  console.error(`❌ Agents directory not found: ${agentsDir}`);
  process.exit(1);
}

const agents = readdirSync(agentsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('archive') && d.name !== 'test-writer')
  .map(d => d.name);

if (agents.length === 0) {
  console.error('❌ No agents found in ' + agentsDir);
  process.exit(1);
}

let failed = 0;
for (const agent of agents) {
  const promptPath = join(agentsDir, agent, 'PROMPT.md');
  if (!existsSync(promptPath)) {
    console.warn(`⚠  ${agent}: PROMPT.md not found (skipping)`);
    continue;
  }
  const content = readFileSync(promptPath, 'utf-8');
  if (/rubricScores/.test(content)) {
    console.error(`❌ ${agent}/PROMPT.md still contains rubricScores`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} agent(s) still contain rubric spec`);
  process.exit(1);
}
console.log(`✅ All ${agents.length} agents clean — no rubric spec`);
