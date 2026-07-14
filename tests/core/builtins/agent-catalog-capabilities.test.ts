// 445-025 — foundation catalog conventions guard (sprint-445, routing-v3 Slice-0). This is
// the drift-gate for capability authoring quality: every builtin agent.json manifest that
// carries a v3 `capabilities` block (445-013..019) must keep it real (schema-valid, never
// provisional), keep the hand-pinned per-agent contracts intact (refactorer build:never,
// architect writeAuthority:false, the -auditor family build:never, ci-guardian vs
// devops-engineer meaningfully distinct), keep every declared domain id inside the closed
// builtin vocabulary (routing3/vocabulary-builtin.ts), and keep dual-carrying
// activation.rules until Slice-3 cuts it over. Read-only against the real
// src/core/builtins/agents/ tree — this suite authors no manifest changes itself.
//
// Manifest discovery is dynamic (readdirSync + agent.json existsSync filter), never a
// hand-maintained id list, so a newly-authored builtin agent is picked up automatically
// instead of silently skipping the gate. Three catalog directories (api-designer,
// i18n-specialist, observability-engineer) are PROMPT.md-only today — no agent.json yet
// (AGSK-6, sprint-369) — so they fall out of discovery naturally rather than needing an
// explicit exclusion list.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCapabilities } from '../../../src/core/routing3/capability-vector.js';
import type { CapabilityVector, WorkTypeEntry } from '../../../src/core/routing3/capability-vector.js';
import { isDomainId } from '../../../src/core/routing3/vocabulary-builtin.js';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const BUILTINS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/agents');

interface RawManifest {
  readonly id?: unknown;
  readonly activation?: { readonly rules?: unknown };
  readonly capabilities?: unknown;
}

/** Every builtin agent directory that currently ships an agent.json manifest. */
function discoverManifestIds(): string[] {
  return readdirSync(BUILTINS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(resolve(BUILTINS_DIR, id, 'agent.json')))
    .sort();
}

function readManifest(id: string): RawManifest {
  return JSON.parse(readFileSync(resolve(BUILTINS_DIR, id, 'agent.json'), 'utf8')) as RawManifest;
}

function readCapabilities(id: string): CapabilityVector {
  const parsed = validateCapabilities(readManifest(id).capabilities);
  if (!parsed.ok) {
    throw new Error(`${id}: expected valid capabilities, got issues: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.value;
}

function findWorkType(cap: CapabilityVector, type: string): WorkTypeEntry | undefined {
  return cap.content.workTypes.find((entry) => entry.type === type);
}

/**
 * Referential-integrity checker mirroring how every manifest's positional.domains[].id is
 * expected to resolve: '*' is the open-list wildcard convention (not itself a registered
 * domain), everything else must be a member of the closed builtin vocabulary.
 */
function collectInvalidDomainIds(domainIds: readonly string[]): string[] {
  return domainIds.filter((id) => id !== '*' && !isDomainId(id));
}

const MANIFEST_IDS = discoverManifestIds();

describe('445-025: builtin agent catalog conventions guard', () => {
  it('discovers at least the 18 builtin agents known to carry a capabilities block', () => {
    expect(MANIFEST_IDS.length).toBeGreaterThanOrEqual(18);
  });

  describe('every builtin manifest carries a valid, real (non-provisional) capabilities block', () => {
    for (const id of MANIFEST_IDS) {
      it(`${id}/agent.json: capabilities is present and schema-valid`, () => {
        const raw = readManifest(id);
        expect(raw.capabilities, `${id} is missing a capabilities block`).toBeDefined();

        // .strict() at every level of capabilityVectorSchema means a stray provisional
        // marker (e.g. capabilitiesProvisional) fails validation on its own — a
        // schema-valid block IS a real, non-provisional block.
        const result = validateCapabilities(raw.capabilities);
        expect(result.ok, `${id} capabilities failed schema validation: ${
          result.ok ? '' : JSON.stringify(result.issues)
        }`).toBe(true);
        if (result.ok) {
          expect(result.value.capabilitiesVersion).toBe(3);
        }
      });
    }
  });

  it('refactorer carries build:never (the old catch-all must never return)', () => {
    const cap = readCapabilities('refactorer');
    const build = findWorkType(cap, 'build');
    expect(build, 'refactorer must declare an explicit build entry').toBeDefined();
    expect(build?.proficiency).toBe('never');
  });

  it('architect carries writeAuthority:false (advisor, Write is in its deniedTools)', () => {
    const cap = readCapabilities('architect');
    expect(cap.positional.writeAuthority).toBe(false);
  });

  describe('the -auditor family carries build:never', () => {
    const auditorIds = MANIFEST_IDS.filter((id) => id.endsWith('-auditor'));

    it('finds at least the 2 known -auditor agents', () => {
      expect(auditorIds.length).toBeGreaterThanOrEqual(2);
      expect(auditorIds).toContain('accessibility-auditor');
      expect(auditorIds).toContain('security-auditor');
    });

    for (const id of auditorIds) {
      it(`${id}: workTypes declares build:never`, () => {
        const cap = readCapabilities(id);
        const build = findWorkType(cap, 'build');
        expect(build, `${id} must declare an explicit build entry`).toBeDefined();
        expect(build?.proficiency).toBe('never');
      });
    }
  });

  it('ci-guardian and devops-engineer differ in at least 2 capability axes', () => {
    const ciGuardian = readCapabilities('ci-guardian');
    const devopsEngineer = readCapabilities('devops-engineer');

    const axes: ReadonlyArray<{ name: string; read: (cap: CapabilityVector) => unknown }> = [
      { name: 'content.workTypes', read: (cap) => cap.content.workTypes },
      { name: 'content.expertise', read: (cap) => cap.content.expertise },
      { name: 'content.personaSlices', read: (cap) => cap.content.personaSlices },
      { name: 'positional.domains', read: (cap) => cap.positional.domains },
      { name: 'positional.surfaces', read: (cap) => cap.positional.surfaces },
      { name: 'positional.writeAuthority', read: (cap) => cap.positional.writeAuthority },
      { name: 'positional.role', read: (cap) => cap.positional.role },
      { name: 'positional.deliverables', read: (cap) => cap.positional.deliverables },
      { name: 'numerical.preferredModel', read: (cap) => cap.numerical.preferredModel },
      { name: 'numerical.costTier', read: (cap) => cap.numerical.costTier },
      { name: 'numerical.maxParallel', read: (cap) => cap.numerical.maxParallel },
    ];

    const differingAxes = axes
      .filter((axis) => JSON.stringify(axis.read(ciGuardian)) !== JSON.stringify(axis.read(devopsEngineer)))
      .map((axis) => axis.name);

    expect(differingAxes.length, `only differing axes: ${differingAxes.join(', ')}`).toBeGreaterThanOrEqual(2);
  });

  it('referential integrity: every declared domain id in the real tree exists in the builtin vocabulary', () => {
    const violations: string[] = [];
    for (const id of MANIFEST_IDS) {
      const cap = readCapabilities(id);
      const domainIds = cap.positional.domains.map((entry) => entry.id);
      for (const invalid of collectInvalidDomainIds(domainIds)) {
        violations.push(`${id}: unknown domain id '${invalid}'`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('referential-integrity check demonstrably fails on a fixture with an unknown domain id', () => {
    // A fixture built entirely from real, registered vocabulary (plus the '*' wildcard
    // convention) must pass clean.
    expect(collectInvalidDomainIds(['api', 'frontend', '*'])).toEqual([]);

    // A fixture that adds one unregistered id must be caught, and caught by name.
    const withUnknown = collectInvalidDomainIds(['api', 'totally-bogus-domain', '*']);
    expect(withUnknown).toEqual(['totally-bogus-domain']);
  });

  describe('dual-carry guard: activation.rules is still present everywhere', () => {
    for (const id of MANIFEST_IDS) {
      it(`${id}/agent.json: activation.rules is a non-empty array`, () => {
        const raw = readManifest(id);
        expect(raw.activation, `${id} is missing activation`).toBeDefined();
        expect(Array.isArray(raw.activation?.rules), `${id}.activation.rules must be an array`).toBe(true);
        expect((raw.activation?.rules as unknown[]).length).toBeGreaterThan(0);
      });
    }
  });
});
