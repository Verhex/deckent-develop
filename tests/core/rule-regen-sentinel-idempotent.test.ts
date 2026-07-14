/**
 * tests/core/rule-regen-sentinel-idempotent.test.ts
 *
 * Sprint 168 Cluster C0a-2 — Sentinel idempotent replace.
 *
 * Sprint 167 T3 finding: previous regen behavior could *append* new ADR
 * blocks rather than *replace* between <!-- AUTO-START --> and
 * <!-- AUTO-END --> markers. This caused duplicate sections to accumulate.
 *
 * `replaceSentinel(content, newInner)` MUST:
 *   - Replace content between <!-- AUTO-START --> and <!-- AUTO-END -->
 *   - NEVER append a second sentinel block
 *   - Be idempotent on repeated apply with the same inner content
 *
 * See: docs/superpowers/plans/2026-05-14-sprint-168-plan.md lines 1371-1379
 */

import { describe, it, expect } from 'vitest';
import { replaceSentinel } from '../../src/core/rule-generator.js';

describe('replaceSentinel — idempotent replace between AUTO markers', () => {
  it('replaces between AUTO-START and AUTO-END markers', () => {
    const before = '## Active ADR Constraints\n<!-- AUTO-START -->\nold content\n<!-- AUTO-END -->\n';
    const after = replaceSentinel(before, 'new content');

    // U1 (memory-reform b-kararı): her üretimde AUTO-START'ı tek-satır AUTOGEN
    // damgası izler (kaynak .claude/rules — elle düzenleme ezilir uyarısı).
    expect(after).toMatch(/<!-- AUTO-START -->\n<!-- AUTOGEN:[^\n]*-->\nnew content\n<!-- AUTO-END -->/);
    expect(after).not.toContain('old content');
  });

  it('does not append — only one AUTO-START / AUTO-END pair after replace', () => {
    const before = '## Active ADR Constraints\n<!-- AUTO-START -->\nold content\n<!-- AUTO-END -->\n';
    const after = replaceSentinel(before, 'new content');

    expect((after.match(/<!-- AUTO-START -->/g) || []).length).toBe(1);
    expect((after.match(/<!-- AUTO-END -->/g) || []).length).toBe(1);
  });

  it('idempotent on repeated apply with same inner content', () => {
    const initial = '<!-- AUTO-START -->\noriginal\n<!-- AUTO-END -->\n';

    let r = replaceSentinel(initial, 'v1');
    const firstPass = r;
    r = replaceSentinel(r, 'v1');
    const secondPass = r;
    r = replaceSentinel(r, 'v1');
    const thirdPass = r;

    expect(secondPass).toBe(firstPass);
    expect(thirdPass).toBe(firstPass);

    // Inner content present exactly once
    expect((thirdPass.match(/v1/g) || []).length).toBe(1);
    expect((thirdPass.match(/<!-- AUTO-START -->/g) || []).length).toBe(1);
  });

  it('preserves surrounding content unchanged', () => {
    const before = [
      '# Brain Rules',
      '- rule A',
      '',
      '## Active ADR Constraints',
      '<!-- AUTO-START -->',
      'OLD ADR LIST',
      '<!-- AUTO-END -->',
      '',
      '## After section',
      '- post rule',
    ].join('\n');

    const after = replaceSentinel(before, '- **ADR-001**: New\n- **ADR-002**: New2');

    expect(after).toContain('# Brain Rules');
    expect(after).toContain('- rule A');
    expect(after).toContain('## Active ADR Constraints');
    expect(after).toContain('## After section');
    expect(after).toContain('- post rule');
    expect(after).toContain('**ADR-001**');
    expect(after).toContain('**ADR-002**');
    expect(after).not.toContain('OLD ADR LIST');
  });

  it('returns content unchanged when no sentinel markers exist', () => {
    const before = '# Just a heading\n- no markers here\n';
    const after = replaceSentinel(before, 'will not appear');
    expect(after).toBe(before);
    expect(after).not.toContain('will not appear');
  });

  it('handles multi-line inner content', () => {
    const before = '<!-- AUTO-START -->\nx\n<!-- AUTO-END -->\n';
    const multiline = [
      '- **ADR-001**: TypeScript + ESM',
      '- **ADR-002**: Node16 Resolution',
      '- **ADR-003**: vitest over Jest',
    ].join('\n');

    const after = replaceSentinel(before, multiline);
    expect(after).toContain('ADR-001');
    expect(after).toContain('ADR-002');
    expect(after).toContain('ADR-003');
    expect((after.match(/<!-- AUTO-START -->/g) || []).length).toBe(1);
  });
});
