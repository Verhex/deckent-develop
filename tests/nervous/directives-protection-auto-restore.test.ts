// tests/nervous/directives-protection-auto-restore.test.ts
//
// Sprint 180 Task W5-3 (180-014): auto_restore=true geçişi kanıtı.
//
// Bug A landed (Sprint 179) + Sprint 177-005 baseline-update hook canlı.
// → `directives_protection.auto_restore: false → true` artık güvenli.
// → Sprint 176 dogfood pattern (DIRECTIVES rollback) imkansız.
//
// Bu test, auto_restore=true ile mid-sprint legitimate DIRECTIVES değişimlerinin
// rollback YAPMADIĞINI kanıtlar — baseline-update hook çağrıldığı sürece.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('directives_protection auto_restore=true — no rollback when baseline-update hook fires (Sprint 180 W5-3)', () => {
  let tmp: string;
  let directivesPath: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nervous-auto-restore-'));
    mkdirSync(join(tmp, '.deckent'), { recursive: true });
    directivesPath = join(tmp, 'DIRECTIVES.md');
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('multiple legitimate mid-sprint set_directives updates do NOT trigger rollback when auto_restore=true and baseline-update hook is invoked', async () => {
    // ─── Arrange — Sprint 175 başlar, ilk DIRECTIVES yazılır ───────────────
    writeFileSync(directivesPath, '# Sprint 175 — Initial\n');

    const { initDirectivesProtection } = await import('../../src/nervous/observer.js');
    const det = initDirectivesProtection({ root: tmp, autoRestore: true });

    // Baseline = Sprint 175 content
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 175 — Initial\n'));

    // ─── Act 1 — Sprint 176 legitimate update + hook ──────────────────────
    // Kullanıcı `deckent_set_directives` çağırır → yeni içerik yazılır → hook updateBaseline()
    writeFileSync(directivesPath, '# Sprint 176 — Bug A Foundation\n');
    det.updateBaseline();

    // Background auditor scan döngüsü — auto_restore=true ama baseline yenilendi
    det.scan();
    det.scan();
    det.scan();

    expect(readFileSync(directivesPath, 'utf-8')).toBe('# Sprint 176 — Bug A Foundation\n');
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 176 — Bug A Foundation\n'));

    // ─── Act 2 — Sprint 177 baseline-update hook (177-005) live ───────────
    writeFileSync(directivesPath, '# Sprint 177 — Baseline Hook Wired\n');
    det.updateBaseline();
    det.scan();
    expect(readFileSync(directivesPath, 'utf-8')).toBe('# Sprint 177 — Baseline Hook Wired\n');

    // ─── Act 3 — Sprint 180 auto_restore=true geçişi sonrası ─────────────
    // Çok adımlı legitimate update sırası — her seferinde hook devreye girer
    writeFileSync(directivesPath, '# Sprint 180 — auto_restore=true safe\n');
    det.updateBaseline();
    det.scan();
    expect(readFileSync(directivesPath, 'utf-8')).toBe('# Sprint 180 — auto_restore=true safe\n');

    // ─── Assert — Hiçbir noktada Sprint 175 içeriğine geri dönülmedi ───────
    // (Sprint 176 dogfood pattern imkansız: baseline her legitimate update'te yenilenir)
    const finalContent = readFileSync(directivesPath, 'utf-8');
    expect(finalContent).not.toContain('Sprint 175');
    expect(finalContent).toBe('# Sprint 180 — auto_restore=true safe\n');
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 180 — auto_restore=true safe\n'));
  });
});
