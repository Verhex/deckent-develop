// ═══ Workspace Artifact Contract ════════════════════════════════════════════
// Canonical, versioned authority registry for `.deckent/workspace` artifacts.
// This module is deliberately content-agnostic: it owns identity, schema,
// provenance and digest mechanics; localized rendering and filesystem mutation
// live in the orchestra application service.

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const WORKSPACE_ARTIFACT_SCHEMA_VERSION = 1 as const;

export const WorkspaceArtifactIdSchema = z.enum([
  'identity',
  'tools',
  'boot',
  'worker-guide',
  'stats-snapshot',
]);
export type WorkspaceArtifactId = z.infer<typeof WorkspaceArtifactIdSchema>;

export const WorkspaceArtifactDescriptorSchema = z.object({
  id: WorkspaceArtifactIdSchema,
  path: z.string().min(1),
  format: z.enum(['markdown', 'json']),
  authority: z.enum(['user-source', 'managed-projection', 'tracked-snapshot']),
  writePolicy: z.enum(['create-only', 'managed-sections']),
  managedSections: z.array(z.string()),
  protectedSections: z.array(z.string()),
});
export type WorkspaceArtifactDescriptor = z.infer<typeof WorkspaceArtifactDescriptorSchema>;

/**
 * The only inventory of files Deckent owns under `.deckent/workspace`.
 * A new artifact is not production-supported until it is registered here and
 * therefore participates in init, migration and parity tests.
 */
export const WORKSPACE_ARTIFACT_REGISTRY = Object.freeze([
  {
    id: 'identity',
    path: '.deckent/workspace/IDENTITY.md',
    format: 'markdown',
    authority: 'user-source',
    writePolicy: 'create-only',
    managedSections: [],
    protectedSections: ['Project Status'],
  },
  {
    id: 'tools',
    path: '.deckent/workspace/TOOLS.md',
    format: 'markdown',
    authority: 'managed-projection',
    writePolicy: 'managed-sections',
    managedSections: ['MCP Tools', 'CLI Commands'],
    protectedSections: ['Environment Tools'],
  },
  {
    id: 'boot',
    path: '.deckent/workspace/BOOT.md',
    format: 'markdown',
    authority: 'managed-projection',
    writePolicy: 'managed-sections',
    managedSections: ['Boot Sequence', 'Manual Recovery Chain'],
    protectedSections: [],
  },
  {
    id: 'worker-guide',
    path: '.deckent/workspace/WORKER-GUIDE.md',
    format: 'markdown',
    authority: 'managed-projection',
    writePolicy: 'managed-sections',
    managedSections: ['Worker Contract'],
    protectedSections: [],
  },
  {
    id: 'stats-snapshot',
    path: '.deckent/workspace/stats-snapshot.json',
    format: 'json',
    authority: 'tracked-snapshot',
    writePolicy: 'create-only',
    managedSections: [],
    protectedSections: [],
  },
] satisfies readonly WorkspaceArtifactDescriptor[]);

WorkspaceArtifactDescriptorSchema.array().parse(WORKSPACE_ARTIFACT_REGISTRY);

export function getWorkspaceArtifactDescriptor(id: WorkspaceArtifactId): WorkspaceArtifactDescriptor {
  const descriptor = WORKSPACE_ARTIFACT_REGISTRY.find((entry) => entry.id === id);
  if (!descriptor) throw new Error(`Unknown workspace artifact: ${id}`);
  return descriptor;
}

export interface WorkspaceArtifactHeader {
  id: WorkspaceArtifactId;
  schemaVersion: number;
  authority: 'user' | 'managed' | 'snapshot';
  provenance: string;
}

const HEADER_RE = /^<!-- DECKENT:WORKSPACE id="([^"]+)" schema="(\d+)" authority="([^"]+)" provenance="([^"]+)" -->$/m;

export function renderWorkspaceArtifactHeader(header: WorkspaceArtifactHeader): string {
  return `<!-- DECKENT:WORKSPACE id="${header.id}" schema="${header.schemaVersion}" authority="${header.authority}" provenance="${header.provenance}" -->`;
}

export function parseWorkspaceArtifactHeader(content: string): WorkspaceArtifactHeader | null {
  const match = HEADER_RE.exec(content);
  if (!match) return null;
  const id = WorkspaceArtifactIdSchema.safeParse(match[1]);
  const authority = z.enum(['user', 'managed', 'snapshot']).safeParse(match[3]);
  const schemaVersion = Number(match[2]);
  if (!id.success || !authority.success || !Number.isInteger(schemaVersion)) return null;
  return {
    id: id.data,
    schemaVersion,
    authority: authority.data,
    provenance: match[4]!,
  };
}

export function ensureWorkspaceArtifactHeader(
  content: string,
  header: WorkspaceArtifactHeader,
): string {
  const rendered = renderWorkspaceArtifactHeader(header);
  if (HEADER_RE.test(content)) return content.replace(HEADER_RE, rendered);
  return `${rendered}\n${content}`;
}

export function workspaceArtifactDigest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

const CONTRACT_RE = /<!-- DECKENT:CONTRACT id="([^"]+)" schema="(\d+)" sha256="([a-f0-9]{64})" -->\n([\s\S]*?)\n<!-- DECKENT:CONTRACT:END id="\1" -->/g;

export function renderManagedContractBlock(id: WorkspaceArtifactId, body: string): string {
  const normalized = body.trim();
  const digest = workspaceArtifactDigest(normalized);
  return [
    `<!-- DECKENT:CONTRACT id="${id}" schema="${WORKSPACE_ARTIFACT_SCHEMA_VERSION}" sha256="${digest}" -->`,
    normalized,
    `<!-- DECKENT:CONTRACT:END id="${id}" -->`,
  ].join('\n');
}

export type ManagedContractInspection =
  | { state: 'VERIFIED'; schemaVersion: number; digest: string }
  | { state: 'HOLD'; reason: 'missing' | 'invalid-id' | 'schema-mismatch' | 'digest-mismatch' };

export function inspectManagedContractBlock(
  content: string,
  expectedId: WorkspaceArtifactId,
): ManagedContractInspection {
  CONTRACT_RE.lastIndex = 0;
  let sawContract = false;
  for (const match of content.matchAll(CONTRACT_RE)) {
    sawContract = true;
    if (match[1] !== expectedId) continue;
    const schemaVersion = Number(match[2]);
    if (schemaVersion !== WORKSPACE_ARTIFACT_SCHEMA_VERSION) {
      return { state: 'HOLD', reason: 'schema-mismatch' };
    }
    const actual = workspaceArtifactDigest(match[4]!.trim());
    if (actual !== match[3]) return { state: 'HOLD', reason: 'digest-mismatch' };
    return { state: 'VERIFIED', schemaVersion, digest: actual };
  }
  return { state: 'HOLD', reason: sawContract ? 'invalid-id' : 'missing' };
}

export function workspaceManagedDocEntries(): Array<{
  id: string;
  path: string;
  autoSections: string[];
  protectedSections: string[];
}> {
  return WORKSPACE_ARTIFACT_REGISTRY
    .filter((entry) => entry.format === 'markdown')
    .map((entry) => ({
      id: `${entry.id}-md`,
      path: entry.path,
      autoSections: [...entry.managedSections],
      protectedSections: [...entry.protectedSections],
    }));
}
