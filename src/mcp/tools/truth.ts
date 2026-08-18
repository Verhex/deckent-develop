// ═══ deckent_truth — MCP Feature Truth-Chain Tool (born-640b, Task 404-002) ══
//
// MCP parity for the `deckent truth` CLI command. Read-only: resolves the
// 4-level truth-chain (code → wired → enabled → proof) for every truth-block in
// .deckent/settings/features-manifest.json and reports half-wire candidates.
//
// The ENGINE (resolveTruth / classifyHalfWire) is IMPORTED, never reimplemented
// (task nogo). Only the thin manifest-read + def-mapping is duplicated here —
// the same CLI↔MCP parity duplication feature-query.ts uses vs features.ts. This
// module MUST NOT import from src/cli/** (ADR-D-004 C3: surfaces do not import
// one another), which is why the plumbing lives independently in both surfaces.
//
// Registration is side-effect-free: all disk/config reads happen inside the
// async handler (createServer() must never throw at registration time).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FEATURES_MANIFEST_FILE } from '../../core/constants.js';
import {
  resolveTruth,
  classifyHalfWire,
  type FeatureTruthDef,
  type FeatureTruthProof,
  type FeatureTruthContext,
} from '../../core/feature-truth.js';
import { loadConfig } from '../../core/config.js';
import { mcpToolDescription } from './description-catalog.js';

/** Pinned half-wire ratchet baseline, relative to projectRoot (mirrors CLI). */
const TRUTH_BASELINE_FILE = '.deckent/truth-baseline.json';

interface TruthManifestEntry {
  id: string;
  label?: string;
  entryModule: string;
  exportName?: string;
  prodCallsitePattern?: string;
  flagPath?: string;
  proof?: FeatureTruthProof;
}

function toDef(e: TruthManifestEntry): FeatureTruthDef {
  const def: FeatureTruthDef = { id: e.id, title: e.label ?? e.id, entryModule: e.entryModule };
  if (e.exportName !== undefined) def.exportName = e.exportName;
  if (e.prodCallsitePattern !== undefined) def.prodCallsitePattern = e.prodCallsitePattern;
  if (e.flagPath !== undefined) def.flagPath = e.flagPath;
  if (e.proof !== undefined) def.proof = e.proof;
  return def;
}

/** Read-only ratchet diff against the pinned baseline (never writes from MCP). */
function computeRatchet(root: string, liveCandidates: string[]): Record<string, unknown> {
  const p = join(root, TRUTH_BASELINE_FILE);
  if (!existsSync(p)) {
    return { baseline: 'missing', newCandidates: liveCandidates, resolved: [] };
  }
  let pinned: string[] = [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as { halfWireCandidates?: string[] };
    pinned = Array.isArray(parsed.halfWireCandidates) ? parsed.halfWireCandidates : [];
  } catch {
    pinned = [];
  }
  const baseSet = new Set(pinned);
  const liveSet = new Set(liveCandidates);
  return {
    baseline: 'present',
    newCandidates: liveCandidates.filter((id) => !baseSet.has(id)).sort(),
    resolved: pinned.filter((id) => !liveSet.has(id)).sort(),
  };
}

export function registerTruthTool(server: McpServer): void {
  server.registerTool(
    'deckent_truth',
    {
      title: 'Feature Truth Chain',
      description: mcpToolDescription('deckent_truth'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        check: z
          .boolean()
          .optional()
          .describe('Also diff half-wire candidates against the pinned .deckent/truth-baseline.json ratchet'),
      }),
    },
    async ({ check }) => {
      const root = process.cwd();
      try {
        const manifestPath = join(root, FEATURES_MANIFEST_FILE);
        if (!existsSync(manifestPath)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  message: 'features-manifest.json not found. Run `node scripts/sync-manifest.mjs` to generate.',
                }),
              },
            ],
            isError: true,
          };
        }

        const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { truth?: TruthManifestEntry[] };
        const entries = Array.isArray(parsed.truth) ? parsed.truth : [];
        const config = (await loadConfig(root)) as unknown as Record<string, unknown>;

        const ctx: FeatureTruthContext = { config, projectRoot: root, now: new Date() };
        const results = resolveTruth(entries.map(toDef), ctx);
        const halfWireCandidates = results
          .filter((r) => classifyHalfWire(r).isHalfWireCandidate)
          .map((r) => r.id);
        const labels = new Map(entries.map((e) => [e.id, e.label ?? e.id]));

        const payload: Record<string, unknown> = {
          features: results.map((r) => ({
            id: r.id,
            label: labels.get(r.id) ?? r.id,
            code: r.code,
            wired: r.wired,
            enabled: r.enabled,
            proof: r.proof,
          })),
          halfWireCandidates,
          summary: { total: results.length, halfWire: halfWireCandidates.length },
        };
        if (check === true) {
          payload.ratchet = computeRatchet(root, halfWireCandidates);
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
