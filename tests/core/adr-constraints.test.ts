/**
 * PCOMP-6 D4.5 — ADR machine-readable constraints (ADR-G-019 Amendment, 2026-07-14).
 * One source (adr-constraints.ts), three consumers: planner block, lint W7,
 * worker injection (last resort). The W7 exam fixture is the LIVE 440-001 spec
 * text that slipped past every layer and died as a mid-sprint worker NO_GO.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADR_CONSTRAINTS,
  buildAdrConstraintsPlannerBlock,
} from '../../src/core/adr-constraints.js';
import { lintWorkerPromptContract } from '../../src/orchestra/prompt-lint.js';
import { buildZeroConfigPlanPrompt, buildPlanPrompt } from '../../src/orchestra/planner.js';
import type { Task, BrainContext, SprintSizeRecommendation } from '../../src/core/types.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('governance pin — every constraint maps to an accepted ADR doc', () => {
  const adrDocs = readdirSync(join(REPO, 'docs', 'adr')).filter((f) => f.endsWith('.md'));
  it.each(ADR_CONSTRAINTS.map((c) => [c.adrId] as const))('%s exists and is accepted', (adrId) => {
    const doc = adrDocs.find((f) => f.startsWith(adrId));
    expect(doc, `no docs/adr file for ${adrId}`).toBeDefined();
    const body = readFileSync(join(REPO, 'docs', 'adr', doc!), 'utf-8');
    expect(body).toMatch(/\*\*Status:\*\*\s*accepted/i);
  });

  it('table stays deliberately small (amendment: revisit selection past ~10)', () => {
    expect(ADR_CONSTRAINTS.length).toBeLessThanOrEqual(10);
  });
});

describe('W7 adr-constraint-violation — the 440-001 live exam', () => {
  function makeTask(desc: string): Task {
    return {
      id: '440-001',
      title: 'Intent-classifier tie-break',
      description: desc,
      model: 'sonnet',
      scope: { directories: [], filesRead: [], filesWrite: ['src/core/intent-classifier.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
    } as Task;
  }

  it("flags the exact 440-001 demand: tie-break making intent.primary literal 'test'", () => {
    const t = makeTask(
      "tie-break kurali ekle: filesWrite'in TAMAMI test-dosyasiysa intent.primary='test' KAZANIR",
    );
    const f = lintWorkerPromptContract(t);
    expect(
      f.some((x) => x.check === 'adr-constraint-violation' && x.detail.includes('adr-g-023')),
    ).toBe(true);
  });

  it('flags a spawnSync demand (ADR-D-002 family)', () => {
    const t = makeTask('Verify adiminda spawnSync kullan ve sonucu bekle.');
    expect(
      lintWorkerPromptContract(t).some(
        (x) => x.check === 'adr-constraint-violation' && x.detail.includes('adr-d-002'),
      ),
    ).toBe(true);
  });

  it('silent on ADR-compliant specs (test-coverage tag wording)', () => {
    const t = makeTask(
      'Test-yazarligi isleri test-coverage TAG mekanizmasiyla sinifla; behavior-blogunu all-test-writeScope sinyaliyle sustur.',
    );
    expect(
      lintWorkerPromptContract(t).some((x) => x.check === 'adr-constraint-violation'),
    ).toBe(false);
  });
});

describe('planner prompts carry the binding block (contradiction dies at birth)', () => {
  it('zero-config planner prompt includes the constraints block', () => {
    const prompt = buildZeroConfigPlanPrompt('add a login page', 'proj', []);
    expect(prompt).toContain('BINDING ADR CONSTRAINTS');
    expect(prompt).toContain('ADR-G-023');
  });

  it('brain plan prompt includes the constraints block', () => {
    const ctx = {
      directives: 'x', memory: '', debt: [], patterns: '', retro: '', decisions: '',
      projectIdentity: '', projectState: { fileTree: [] },
    } as unknown as BrainContext;
    const rec = { size: 'full', maxWorkers: 4, modelConstraint: null, reason: 'ok' } as SprintSizeRecommendation;
    const prompt = buildPlanPrompt(ctx, rec, 'proj');
    expect(prompt).toContain('BINDING ADR CONSTRAINTS');
  });

  it('block renders one line per constraint', () => {
    const block = buildAdrConstraintsPlannerBlock();
    for (const c of ADR_CONSTRAINTS) expect(block).toContain(c.plannerSummary);
  });
});
