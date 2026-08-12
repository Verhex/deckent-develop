#!/usr/bin/env node
// lint-skill-catalog-determinism.mjs — skill catalog S8 determinism gate
// (design §S8, sprint-523 task 8).
//
// Computes the canonical catalog snapshot digest (skill-pool.snapshotSkillCatalog —
// the ONE digest mechanism, created in S5; this script derives, never re-hashes)
// twice over the real tree: once catalog-only (manifest layers) and once with
// machine-local sidecar state present. Undeclared divergence fails typed;
// declared drift is honored through the baseline's canonical-side DISPOSITION
// (never a bare allowlist). NOT wired into lint:gates — that wiring is a named
// follow-up owner decision.
//
// Exit codes: 0 in-sync/declared · 1 undeclared drift · 2 infrastructure error.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadSnapshot() {
  const distPath = join(__dirname, '..', 'dist', 'core', 'skill-pool.js');
  if (existsSync(distPath)) return import(pathToFileURL(distPath).href);
  return import(pathToFileURL(join(__dirname, '..', 'src', 'core', 'skill-pool.ts')).href);
}

export function compareDeterminism({ catalogDigest, withSidecarDigest, baseline }) {
  if (catalogDigest === withSidecarDigest) {
    return { ok: true, verdict: 'IN_SYNC', detail: catalogDigest };
  }
  const declared = baseline?.declaredDrift ?? [];
  const match = declared.find(
    (d) => d.catalogDigest === catalogDigest && d.withSidecarDigest === withSidecarDigest,
  );
  if (match) {
    if (!match.disposition || !match.disposition.trim()) {
      return {
        ok: false,
        verdict: 'DECLARED_WITHOUT_DISPOSITION',
        detail: 'declaredDrift entry lacks a canonical-side disposition — a bare allowlist is refused (§S8)',
      };
    }
    return { ok: true, verdict: 'DECLARED_DRIFT', detail: match.disposition };
  }
  return {
    ok: false,
    verdict: 'UNDECLARED_DRIFT',
    detail: `catalog=${catalogDigest} withSidecar=${withSidecarDigest}`,
  };
}

export async function runGate(root, baselinePath) {
  const { snapshotSkillCatalog } = await loadSnapshot();
  // Pass 1 — catalog-only: manifest layers, machine-local sidecar/stats
  // overlay suppressed (S8: this is the canonical side the baseline
  // disposition is written against).
  const catalog = snapshotSkillCatalog(root, { excludeSidecarStats: true });
  // Pass 2 — full state: same resolver, same tree, sidecar/stats overlay
  // included exactly as it exists on THIS machine right now.
  const withSidecar = snapshotSkillCatalog(root);
  let baseline = null;
  if (baselinePath && existsSync(baselinePath)) {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
  }
  return compareDeterminism({
    catalogDigest: catalog.digest,
    withSidecarDigest: withSidecar.digest,
    baseline,
  });
}

const isMain = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1]);

if (isMain) {
  const root = process.cwd();
  const baselinePath = join(root, 'scripts', 'skill-catalog-determinism-baseline.json');
  try {
    const result = await runGate(root, baselinePath);
    process.stdout.write(`[skill-determinism] ${result.verdict}: ${result.detail}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    process.stderr.write(`[skill-determinism] ERROR: ${err?.message ?? err}\n`);
    process.exitCode = 2;
  }
}
