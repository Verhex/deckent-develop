/**
 * DEBT-003: Directive parsing iyileştirme
 *
 * parseStructuredDirectives ve extractScopeFromDirective fonksiyonları için
 * kapsamlı testler — yapılandırılmış parsing, fallback, edge case.
 */

import { describe, it, expect } from 'vitest';
import {
  parseStructuredDirectives,
  extractScopeFromDirective,
} from '../../src/orchestra/brain.js';

// ─── Mock: node:fs, child_process, tmux, auditor, worker ──────────────────────
// parseStructuredDirectives ve extractScopeFromDirective tamamen pure fonksiyon
// olduğu için mock gerekmez.

// ═══════════════════════════════════════════════════════════════════════════════
// extractScopeFromDirective — Temel kontrat
// ═══════════════════════════════════════════════════════════════════════════════

describe('extractScopeFromDirective — contract', () => {
  it('always returns an object with directories, filesRead, filesWrite', () => {
    const scope = extractScopeFromDirective('');
    expect(scope).toHaveProperty('directories');
    expect(scope).toHaveProperty('filesRead');
    expect(scope).toHaveProperty('filesWrite');
  });

  it('filesRead is always empty array', () => {
    const scope = extractScopeFromDirective('src/orchestra/brain.ts');
    expect(scope.filesRead).toEqual([]);
  });

  it('returns empty arrays for empty string', () => {
    const scope = extractScopeFromDirective('');
    expect(scope.directories).toHaveLength(0);
    expect(scope.filesRead).toHaveLength(0);
    expect(scope.filesWrite).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractScopeFromDirective — Dosya ve dizin çıkarma
// ═══════════════════════════════════════════════════════════════════════════════

describe('extractScopeFromDirective — file and directory extraction', () => {
  it('extracts a single .ts file from a Dosya: line', () => {
    const scope = extractScopeFromDirective('Dosya: src/orchestra/brain.ts');
    expect(scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('extracts a single .ts file from a Kapsam: line', () => {
    const scope = extractScopeFromDirective('Kapsam: src/orchestra/brain.ts');
    expect(scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('extracts multiple files from a comma-separated Kapsam: line', () => {
    const line = 'Kapsam: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts, src/orchestra/brain.ts';
    const scope = extractScopeFromDirective(line);
    expect(scope.filesWrite).toContain('src/core/types.ts');
    expect(scope.filesWrite).toContain('src/cli/commands/start.ts');
    expect(scope.filesWrite).toContain('src/orchestra/tmux.ts');
    expect(scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('extracts a src/ directory path', () => {
    const scope = extractScopeFromDirective('Kapsam: src/orchestra/');
    expect(scope.directories).toContain('src/orchestra/');
  });

  it('extracts a tests/ directory path', () => {
    const scope = extractScopeFromDirective('Kapsam: tests/orchestra/');
    expect(scope.directories).toContain('tests/orchestra/');
  });

  it('extracts a .js file path', () => {
    const scope = extractScopeFromDirective('dist/index.js');
    expect(scope.filesWrite).toContain('dist/index.js');
  });

  it('extracts test file paths (*.test.ts)', () => {
    const scope = extractScopeFromDirective('tests/orchestra/brain.test.ts');
    expect(scope.filesWrite).toContain('tests/orchestra/brain.test.ts');
  });

  it('returns empty scope for a pure prose line', () => {
    const scope = extractScopeFromDirective('Bu görevin amacı sistemi düzeltmektir.');
    expect(scope.filesWrite).toHaveLength(0);
    expect(scope.directories).toHaveLength(0);
  });

  it('returns empty scope for a comment line (#)', () => {
    const scope = extractScopeFromDirective('# Hedef');
    expect(scope.filesWrite).toHaveLength(0);
    expect(scope.directories).toHaveLength(0);
  });

  it('deduplicates repeated file paths', () => {
    const scope = extractScopeFromDirective('src/orchestra/brain.ts also src/orchestra/brain.ts');
    expect(scope.filesWrite.filter(f => f === 'src/orchestra/brain.ts')).toHaveLength(1);
  });

  it('deduplicates repeated directory paths', () => {
    const scope = extractScopeFromDirective('src/orchestra/ and also src/orchestra/');
    expect(scope.directories.filter(d => d === 'src/orchestra/')).toHaveLength(1);
  });

  it('handles the DEBT-002 scope line from real DIRECTIVES.md', () => {
    const line = 'Kapsam: src/orchestra/brain.ts';
    const scope = extractScopeFromDirective(line);
    expect(scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('handles the DEBT-005 four-file scope line from real DIRECTIVES.md', () => {
    const line = 'Kapsam: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts, src/orchestra/brain.ts';
    const scope = extractScopeFromDirective(line);
    expect(scope.filesWrite.length).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseStructuredDirectives — Fallback (satır bazlı)
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseStructuredDirectives — fallback when no structured sections', () => {
  it('returns empty array for plain text (no headings)', () => {
    expect(parseStructuredDirectives('Task A\nTask B\n')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseStructuredDirectives('')).toEqual([]);
  });

  it('returns empty array for content with only # headings (not ## Görev)', () => {
    const content = '# DIRECTIVES\n## Hedef\nBir şeyler yap.\n---\n';
    expect(parseStructuredDirectives(content)).toEqual([]);
  });

  it('returns empty array for content with ## but not Görev/Task pattern', () => {
    const content = '## Hedef\nBir şey yap\n## Sonuç\nBitti\n';
    expect(parseStructuredDirectives(content)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseStructuredDirectives — Yapılandırılmış parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseStructuredDirectives — structured parsing', () => {
  it('parses a single ## Görev N: block', () => {
    const content = [
      '## Görev 1: Fix auth module',
      '- Dosya: src/auth/auth.ts',
      '- Kapsam: src/auth/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
  });

  it('parses "- Backend: docker|tmux|subprocess" override (Sprint 252 PSL-1), ignores invalid', () => {
    const docker = parseStructuredDirectives(['## Task 1: x', '- Files: src/a.ts', '- Backend: docker'].join('\n'));
    expect(docker[0]?.backend).toBe('docker');
    const sub = parseStructuredDirectives(['## Task 1: x', '- Files: src/a.ts', '- Backend: subprocess'].join('\n'));
    expect(sub[0]?.backend).toBe('subprocess');
    // invalid value (e.g. the non-backend 'host') → undefined, not a broken value
    const bad = parseStructuredDirectives(['## Task 1: x', '- Files: src/a.ts', '- Backend: host'].join('\n'));
    expect(bad[0]?.backend).toBeUndefined();
    // absent → undefined (default routing)
    const none = parseStructuredDirectives(['## Task 1: x', '- Files: src/a.ts'].join('\n'));
    expect(none[0]?.backend).toBeUndefined();
  });

  it('parses "- ModelEffort: <level>" override (Sprint 252 F1-RE), distinct from Effort', () => {
    const high = parseStructuredDirectives(['## Task 1: x', '- Files: src/a.ts', '- ModelEffort: high'].join('\n'));
    expect(high[0]?.modelEffort).toBe('high');
    const xhigh = parseStructuredDirectives(['## Task 1: x', '- Files: src/a.ts', '- ModelEffort: xhigh'].join('\n'));
    expect(xhigh[0]?.modelEffort).toBe('xhigh');
    // absent → undefined (no reasoning-effort flag sent; CLI default kept)
    const none = parseStructuredDirectives(['## Task 1: x', '- Files: src/a.ts'].join('\n'));
    expect(none[0]?.modelEffort).toBeUndefined();
  });

  it('parses multiple ## Görev blocks', () => {
    const content = [
      '## Görev 1: Fix auth',
      '- Dosya: src/auth/auth.ts',
      '',
      '## Görev 2: Add tests',
      '- Dosya: tests/auth/auth.test.ts',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(2);
  });

  it('extracts inline title from heading line', () => {
    const content = [
      '## Görev 1: waitForResults async polling (DEBT-004)',
      '- Dosya: src/orchestra/brain.ts',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.title).toBe('waitForResults async polling (DEBT-004)');
  });

  it('strips leading "- " prefix from title when it is a list item', () => {
    // When block starts with a "- " prefixed line (not inline heading text)
    const content = '## Görev 1: \n- Fix the authentication module\n- Kapsam: src/auth/';
    const tasks = parseStructuredDirectives(content);
    if (tasks.length > 0) {
      // Title should not start with "- "
      expect(tasks[0]?.title).not.toMatch(/^-\s+/);
    }
  });

  it('includes description as the full block text', () => {
    const content = [
      '## Görev 1: Fix brain',
      '- Dosya: src/orchestra/brain.ts',
      '- Sorun: sleepSync blokluyor',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.description).toContain('sleepSync');
  });

  it('parses ## Task N: (English heading) as well', () => {
    const content = [
      '## Task 1: Fix database module',
      '- Kapsam: src/db/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('Fix database module');
  });

  it('skips blocks whose title resolves to empty string', () => {
    const content = '## Görev 1: \n\n## Görev 2: Build X\n- Do it';
    const tasks = parseStructuredDirectives(content);
    const withTitle = tasks.filter(t => t.title.length > 0);
    expect(withTitle).toHaveLength(1);
    expect(withTitle[0]?.title).toContain('Build X');
  });

  it('ignores preamble before the first ## Görev heading', () => {
    const content = [
      '# DIRECTIVES',
      '## Hedef',
      'Preamble text here.',
      '---',
      '## Görev 1: Real task',
      '- Kapsam: src/orchestra/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain('Real task');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseStructuredDirectives — Scope çıkarma
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseStructuredDirectives — scope extraction', () => {
  it('extracts filesWrite from a Dosya: line', () => {
    const content = '## Görev 1: Fix brain\n- Dosya: src/orchestra/brain.ts\n- Kapsam: src/orchestra/brain.ts';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('extracts filesWrite from a Kapsam: line with single file', () => {
    const content = [
      '## Görev 1: Fix brain',
      '- Fix the brain module',
      '- Kapsam: src/orchestra/brain.ts',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('extracts multiple files from a comma-separated Kapsam: line', () => {
    const content = [
      '## Görev 2: haiku_allowed fix',
      '- Dosya: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts',
      '- Kapsam: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts, src/orchestra/brain.ts',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    const files = tasks[0]?.scope.filesWrite ?? [];
    expect(files).toContain('src/core/types.ts');
    expect(files).toContain('src/cli/commands/start.ts');
    expect(files).toContain('src/orchestra/tmux.ts');
    expect(files).toContain('src/orchestra/brain.ts');
  });

  it('extracts directory from a Kapsam: line', () => {
    const content = [
      '## Görev 1: Add utils',
      '- Add utilities',
      '- Kapsam: src/utils/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.scope.directories).toContain('src/utils/');
  });

  it('deduplicates files that appear in both Dosya: and Kapsam: lines', () => {
    const content = [
      '## Görev 1: Fix brain',
      '- Dosya: src/orchestra/brain.ts',
      '- Kapsam: src/orchestra/brain.ts',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    const files = tasks[0]?.scope.filesWrite ?? [];
    expect(files.filter(f => f === 'src/orchestra/brain.ts')).toHaveLength(1);
  });

  it('filesRead is always empty for every parsed task', () => {
    const content = [
      '## Görev 1: Fix brain',
      '- Kapsam: src/orchestra/brain.ts',
      '',
      '## Görev 2: Add tests',
      '- Kapsam: tests/orchestra/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    for (const task of tasks) {
      expect(task.scope.filesRead).toEqual([]);
    }
  });

  it('returns empty scope when task block has no file references', () => {
    const content = [
      '## Görev 1: Refactor',
      '- Genel kod temizliği yap.',
      '- Sorun çözüldü.',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.scope.filesWrite).toHaveLength(0);
    expect(tasks[0]?.scope.directories).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseStructuredDirectives — Test hedefi çıkarma
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseStructuredDirectives — testTarget extraction', () => {
  it('extracts testTarget from a "- Test: ..." line', () => {
    const content = [
      '## Görev 1: waitForResults async polling (DEBT-004)',
      '- Dosya: src/orchestra/brain.ts',
      '- Test: async polling, timeout, partial result senaryoları',
      '- Kapsam: src/orchestra/brain.ts',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.testTarget).toBe('async polling, timeout, partial result senaryoları');
  });

  it('testTarget is undefined when no Test: line exists', () => {
    const content = [
      '## Görev 1: Fix auth',
      '- Dosya: src/auth/auth.ts',
      '- Kapsam: src/auth/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.testTarget).toBeUndefined();
  });

  it('extracts testTarget from all tasks independently', () => {
    const content = [
      '## Görev 1: Task A',
      '- Test: scenario A, scenario B',
      '- Kapsam: src/a/',
      '',
      '## Görev 2: Task B',
      '- Kapsam: src/b/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.testTarget).toBe('scenario A, scenario B');
    expect(tasks[1]?.testTarget).toBeUndefined();
  });

  it('extracts testTarget from DIRECTIVES.md Görev 1 format', () => {
    const content = [
      '## Görev 1: waitForResults async polling (DEBT-004)',
      '- Dosya: src/orchestra/brain.ts',
      '- Sorun: waitForResults sleepSync kullanıyor, main thread bloklanıyor',
      '- Fix: async/await + setTimeout tabanlı polling',
      '- Test: async polling, timeout, partial result senaryoları',
      '- Kapsam: src/orchestra/brain.ts',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.testTarget).toBe('async polling, timeout, partial result senaryoları');
  });

  it('extracts testTarget from DIRECTIVES.md Görev 2 format', () => {
    const content = [
      '## Görev 2: haiku_allowed semantik düzeltme (DEBT-005)',
      '- Dosya: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts',
      '- Test: config validation, start komutu flag parsing',
      '- Kapsam: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts, src/orchestra/brain.ts',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.testTarget).toBe('config validation, start komutu flag parsing');
  });

  it('strips the "- Test:" prefix cleanly from testTarget', () => {
    const content = '## Görev 1: Fix\n- Test: unit test, integration test\n- Kapsam: src/';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.testTarget).not.toMatch(/^-?\s*Test:/i);
    expect(tasks[0]?.testTarget).toBe('unit test, integration test');
  });

  it('handles "Test:" line without leading dash', () => {
    const content = '## Görev 1: Fix\nTest: direct test line\n- Kapsam: src/';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.testTarget).toBe('direct test line');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseStructuredDirectives — Gerçek DIRECTIVES.md formatı
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseStructuredDirectives — real DIRECTIVES.md format (Sprint 2)', () => {
  const DIRECTIVES_SPRINT2 = `# DIRECTIVES — Sprint 2: Dogfooding (Self-Improvement)
# Deckent kendi teknik borçlarını kendi orkestrasyon sistemiyle düzeltecek.
# Operatör: Alperen @ Verhex
# Tarih: 2026-03-17

## Hedef
Deckent'in Sprint 1'den kalan teknik borçlarını düzelt.
Her fix için mevcut 297 testi bozmadan yeni testler yaz.
Coverage hedefi: değişen her dosyada minimum %80.

---

## Görev 1: waitForResults async polling (DEBT-004)
- Dosya: src/orchestra/brain.ts
- Sorun: waitForResults (satır 458) sleepSync (satır 101) kullanıyor, main thread bloklanıyor
- Fix: async/await + setTimeout tabanlı polling'e geç
  - sleepSync fonksiyonunu kaldır, yerine async sleep(ms) yaz
  - waitForResults'ı async yap
  - runSprint'teki çağrıları await ile güncelle
  - Mevcut davranış korunsun: timeout, partial results, retry
- Test: async polling, timeout, partial result senaryoları
- Kapsam: src/orchestra/brain.ts

## Görev 2: haiku_allowed semantik düzeltme (DEBT-005)
- Dosya: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts
- Sorun: autoApprove (CLI flag) ve haiku_allowed (model config) karışıyor
- Fix: İkisini net ayır
  - autoApprove: sadece --dangerously-skip-permissions için (CLI/tmux)
  - haikuAllowed: sadece model seçim kısıtlaması için (Brain planlama)
  - StartOptions tipini genişlet
  - Brain.runSprint opts parametresi alsın
- Test: config validation, start komutu flag parsing
- Kapsam: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts, src/orchestra/brain.ts

## Görev 3: Config doğrulama entegrasyonu (DEBT-002)
- Dosya: src/orchestra/brain.ts
- Sorun: Config doğrulama eksik
- Fix: Zod schema ile config validasyonu ekle
- Test: mock spawnSync çıktısı ile parsing testleri, hata senaryoları
- Kapsam: src/orchestra/brain.ts

## Görev 4: Directive parsing iyileştirme (DEBT-003)
- Dosya: src/orchestra/brain.ts
- Sorun: parseDirectives satır bazlı basit parsing, scope çıkaramıyor
- Fix: Daha yapılandırılmış parsing
- Test: yapılandırılmış directive parsing, fallback, edge case
- Kapsam: src/orchestra/brain.ts

## Görev 5: Worker prompt zenginleştirme
- Dosya: src/orchestra/brain.ts (buildWorkerPrompt fonksiyonu)
- Sorun: Worker prompt'u test yazma talimatı içermiyor
- Fix: buildWorkerPrompt'a ekle test talimatları
- Test: buildWorkerPrompt çıktısında test talimatı varlığı kontrolü
- Kapsam: src/orchestra/brain.ts`;

  it('parses exactly 5 tasks from Sprint 2 DIRECTIVES.md', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks).toHaveLength(5);
  });

  it('task 1 title is "waitForResults async polling (DEBT-004)"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[0]?.title).toBe('waitForResults async polling (DEBT-004)');
  });

  it('task 2 title is "haiku_allowed semantik düzeltme (DEBT-005)"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[1]?.title).toContain('haiku_allowed');
  });

  it('task 3 title is "Config doğrulama entegrasyonu (DEBT-002)"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[2]?.title).toContain('Config doğrulama');
  });

  it('task 4 title is "Directive parsing iyileştirme (DEBT-003)"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[3]?.title).toContain('Directive parsing');
  });

  it('task 5 title is "Worker prompt zenginleştirme"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[4]?.title).toContain('Worker prompt');
  });

  it('task 1 scope includes src/orchestra/brain.ts', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[0]?.scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('task 2 scope includes all 4 files', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    const files = tasks[1]?.scope.filesWrite ?? [];
    expect(files).toContain('src/core/types.ts');
    expect(files).toContain('src/cli/commands/start.ts');
    expect(files).toContain('src/orchestra/tmux.ts');
    expect(files).toContain('src/orchestra/brain.ts');
  });

  it('task 1 testTarget is "async polling, timeout, partial result senaryoları"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[0]?.testTarget).toBe('async polling, timeout, partial result senaryoları');
  });

  it('task 2 testTarget is "config validation, start komutu flag parsing"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[1]?.testTarget).toBe('config validation, start komutu flag parsing');
  });

  it('task 3 testTarget is "mock spawnSync çıktısı ile parsing testleri, hata senaryoları"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[2]?.testTarget).toBe('mock spawnSync çıktısı ile parsing testleri, hata senaryoları');
  });

  it('task 4 testTarget is "yapılandırılmış directive parsing, fallback, edge case"', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    expect(tasks[3]?.testTarget).toBe('yapılandırılmış directive parsing, fallback, edge case');
  });

  it('no task has undefined title', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    for (const task of tasks) {
      expect(task.title).toBeTruthy();
    }
  });

  it('no task has empty description', () => {
    const tasks = parseStructuredDirectives(DIRECTIVES_SPRINT2);
    for (const task of tasks) {
      expect(task.description.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseStructuredDirectives — Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseStructuredDirectives — edge cases', () => {
  it('handles content with only whitespace gracefully', () => {
    expect(() => parseStructuredDirectives('   \n   \n   ')).not.toThrow();
    expect(parseStructuredDirectives('   \n   \n   ')).toEqual([]);
  });

  it('handles block with no lines after heading', () => {
    const content = '## Görev 1: \n';
    expect(() => parseStructuredDirectives(content)).not.toThrow();
    // Empty title → skipped
    expect(parseStructuredDirectives(content)).toHaveLength(0);
  });

  it('handles block with only whitespace after heading', () => {
    const content = '## Görev 1: Title\n\n\n';
    const tasks = parseStructuredDirectives(content);
    // Title comes from heading inline text
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('Title');
  });

  it('handles non-sequential numbering (## Görev 3: without 1 or 2)', () => {
    const content = '## Görev 3: Direct task\n- Kapsam: src/core/';
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('Direct task');
  });

  it('handles large block number (## Görev 99:)', () => {
    const content = '## Görev 99: Last task\n- Kapsam: src/last/';
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
  });

  it('does not treat ## Hedef section as a task', () => {
    const content = '## Hedef\nPreamble\n\n## Görev 1: Real task\n- Kapsam: src/real/';
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('Real task');
  });

  it('handles mixed Görev/Task headings in one document', () => {
    const content = [
      '## Görev 1: Turkish task',
      '- Kapsam: src/tr/',
      '',
      '## Task 2: English task',
      '- Kapsam: src/en/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(2);
  });

  it('scope.filesRead is always [] regardless of content', () => {
    const content = [
      '## Görev 1: Complex task',
      '- Dosya: src/a/b.ts, src/c/d.ts',
      '- Test: unit tests',
      '- Kapsam: src/a/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.scope.filesRead).toEqual([]);
  });

  it('handles a Dosya: line with a parenthetical annotation', () => {
    // e.g., "- Dosya: src/orchestra/brain.ts (buildWorkerPrompt fonksiyonu)"
    const content = '## Görev 5: Worker prompt\n- Dosya: src/orchestra/brain.ts (buildWorkerPrompt fonksiyonu)\n- Kapsam: src/orchestra/brain.ts';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]?.scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('returns an array (never throws) for any string input', () => {
    const inputs = [
      '## Görev 1: \n\n## Görev 2: X\n',
      '# Only H1 heading\n## Not a task heading\n',
      '---\n---\n---\n',
      'no headings at all',
      '',
      '\n\n\n',
      '## Task 1: \n## Task 2: \n',
    ];
    for (const input of inputs) {
      expect(() => parseStructuredDirectives(input)).not.toThrow();
      expect(Array.isArray(parseStructuredDirectives(input))).toBe(true);
    }
  });
});
