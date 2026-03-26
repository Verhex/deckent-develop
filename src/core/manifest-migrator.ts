// ─── Manifest Migrator ──────────────────────────────────────────────────────
// Converts v1 agent/skill manifests to v2 format with activation rules.
// Runtime in-memory migration — does not write to disk.

import type { AgentDefinition } from './agent-types.js';
import type { SkillDefinition } from './skill-types.js';
import { migrateV1AgentToActivation, migrateV1SkillToActivation } from './activation-engine.js';

/**
 * Check if a manifest needs migration to v2.
 */
export function needsMigration(manifest: { manifestVersion?: number }): boolean {
  return !manifest.manifestVersion || manifest.manifestVersion < 2;
}

/**
 * Check if a manifest is already v2.
 */
export function isV2Manifest(manifest: { manifestVersion?: number }): boolean {
  return manifest.manifestVersion === 2;
}

/**
 * Migrate an agent manifest from v1 to v2 (in-memory).
 * Generates activation rules from triggerKeywords/triggerScopes/triggerFilePatterns.
 * Keeps v1 fields intact for backward compatibility.
 */
export function migrateAgentManifest(agent: AgentDefinition): AgentDefinition {
  if (isV2Manifest(agent)) return agent;

  const activation = migrateV1AgentToActivation(
    agent.triggerKeywords,
    agent.triggerScopes,
    agent.triggerFilePatterns,
  );

  return {
    ...agent,
    manifestVersion: 2,
    activation,
  };
}

/**
 * Migrate a skill manifest from v1 to v2 (in-memory).
 * Generates activation rules from triggers/category/stackDetection.
 * Keeps v1 fields intact for backward compatibility.
 */
export function migrateSkillManifest(skill: SkillDefinition): SkillDefinition {
  if (isV2Manifest(skill)) return skill;

  const activation = migrateV1SkillToActivation(
    skill.triggers,
    skill.category,
    skill.stackDetection,
  );

  return {
    ...skill,
    manifestVersion: 2,
    activation,
  };
}
