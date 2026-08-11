// ─── Worker-prompt skill body loading (522-011, design S4) ──────────────────
//
// The worker prompt is the surface where a wrong skill body costs a provider
// call and poisons outcome learning, so it is the FIRST consumer migrated onto
// the catalog read model (S2) + `resolveBody()` (S3).
//
// Before this module the prompt path read `.deckent/skills/<id>/SKILL.md`
// directly — a second body reader that:
//   • ignored the manifest's DECLARED `entrypoint` (a skill whose body is
//     `GUIDE.md` injected nothing),
//   • ignored `referencedFiles`, so a package could reach a provider prompt
//     half-loaded,
//   • ignored containment, budget and disposition, so a quarantined or retired
//     id was still injectable as long as its file was on disk,
//   • could not see a builtin package that was never materialised into the
//     project tree.
//
// This module owns NONE of that policy itself: it is a thin, ordered projection
// over {@link SkillPoolManager.resolveBody}, which stays the single body reader
// (design §4 contract point 2). It exists so the orchestration-side prompt
// assembler has a `core/`-layer entrypoint to call — ADR-D-004 C1 forbids
// `core/` from importing `orchestra/`, so the two orchestration-owned
// behaviours around this read (the `project-conventions` generated fallback and
// the assigned-skill credit-removal) deliberately stay at the call site and are
// driven by the typed HOLDs returned here.
//
// BYTE-PARITY CONTRACT (the S4 proof obligation, pinned in
// tests/core/skill-prompt-parity.test.ts): for an unchanged catalog — a project
// manifest with the default `SKILL.md` entrypoint — the `{ name, content }`
// pairs produced here are byte-identical, and in the same order, to the ones the
// pre-migration reader produced, so the assembled worker prompt does not move by
// a single byte. Two consequences of that contract are load-bearing:
//   1. `skillId` is echoed back EXACTLY as requested (it is what the prompt
//      block renders as the skill name); the catalog's canonical id is not
//      substituted here.
//   2. Only the entrypoint's bytes enter the prompt. `referencedFiles` are
//      resolved — a missing member is still a HOLD, so a partial package never
//      reaches a provider — but they are NOT injected, because injecting them
//      would itself be prompt drift. Making them addressable in the prompt is a
//      separate, deliberate change.

import {
  SkillPoolManager,
  type SkillBody,
  type SkillBodyHold,
  type SkillCatalogLayer,
  type SkillPackageBudget,
} from './skill-pool.js';

/** A skill body cleared for injection into a worker prompt. */
export interface ResolvedSkillPrompt {
  ok: true;
  /**
   * The id AS REQUESTED by the caller. The prompt block renders this as the
   * skill's name, so echoing the request (rather than the catalog's canonical
   * id) is what keeps the migration byte-neutral.
   */
  skillId: string;
  /** The declared entrypoint's bytes, verbatim — no truncation, no clipping. */
  content: string;
  layer: SkillCatalogLayer;
  /** The declared entrypoint path, relative to the skill root. */
  entrypointPath: string;
  /** `sha256:…` over the injected bytes — the prompt-determinism evidence. */
  digest: string;
}

/**
 * Per-id outcome: either bytes cleared for injection, or the typed refusal from
 * the single body reader. There is deliberately no third state — a caller can
 * never assemble a partial prompt out of this.
 */
export type SkillPromptResolution = ResolvedSkillPrompt | SkillBodyHold;

export interface SkillPromptLoadOptions {
  /** Package budget override; defaults to `DEFAULT_SKILL_PACKAGE_BUDGET`. */
  budget?: SkillPackageBudget;
}

/** Project one resolved package onto the prompt-injection shape. */
function toPromptResolution(requestedId: string, body: SkillBody): ResolvedSkillPrompt {
  return {
    ok: true,
    skillId: requestedId,
    content: body.entrypoint.content,
    layer: body.layer,
    entrypointPath: body.entrypoint.declaredPath,
    digest: body.entrypoint.digest,
  };
}

/**
 * Resolve the prompt bodies for a task's assigned skills, in the requested
 * order.
 *
 * One catalog-backed pool serves the whole batch. Order is preserved because
 * the worker prompt's skill block is order-sensitive: reordering it is prompt
 * drift even when every byte is otherwise the same.
 */
export function resolveSkillPromptBodies(
  projectRoot: string,
  skillIds: readonly string[],
  options: SkillPromptLoadOptions = {},
): SkillPromptResolution[] {
  if (skillIds.length === 0) return [];
  const pool = new SkillPoolManager(projectRoot);
  return skillIds.map((skillId) => resolveOne(pool, skillId, options.budget));
}

/**
 * Resolve ONE assigned skill against an existing pool — for a caller that
 * already holds a `SkillPoolManager` and does not need the batch wrapper.
 */
export function resolveSkillPromptBody(
  pool: SkillPoolManager,
  skillId: string,
  options: SkillPromptLoadOptions = {},
): SkillPromptResolution {
  return resolveOne(pool, skillId, options.budget);
}

function resolveOne(
  pool: SkillPoolManager,
  skillId: string,
  budget: SkillPackageBudget | undefined,
): SkillPromptResolution {
  const body = pool.resolveBody(skillId, budget);
  if (!body.ok) return body;
  return toPromptResolution(skillId, body);
}

/**
 * The `{ name, content }` pairs the prompt assembler injects — held skills are
 * omitted, exactly as an unreadable skill was omitted before the migration.
 */
export function toSkillPrompts(
  resolutions: readonly SkillPromptResolution[],
): Array<{ name: string; content: string }> {
  const prompts: Array<{ name: string; content: string }> = [];
  for (const resolution of resolutions) {
    if (resolution.ok) prompts.push({ name: resolution.skillId, content: resolution.content });
  }
  return prompts;
}

/**
 * The refusals from a batch, in request order.
 *
 * Outcome learning may only credit a skill whose bytes actually reached the
 * worker, so the call site removes exactly these ids from the task's assigned
 * set — the same credit-removal the pre-migration reader performed, now driven
 * by a typed reason code instead of a swallowed `readFile` exception.
 */
export function heldSkillResolutions(
  resolutions: readonly SkillPromptResolution[],
): SkillBodyHold[] {
  return resolutions.filter((resolution): resolution is SkillBodyHold => !resolution.ok);
}
