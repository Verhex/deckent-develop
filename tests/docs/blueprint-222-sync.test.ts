import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BLUEPRINT_PATH = join(process.cwd(), 'docs/vision/blueprint.md');

describe('Blueprint 222-sync — Sprint 222 doc update (task 222-012)', () => {
  it('REPL-perf güncel — blueprint reflects persistent session and sub-1s subsequent messages', () => {
    expect(existsSync(BLUEPRINT_PATH)).toBe(true);
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    // Persistent session documented
    expect(content).toMatch(/persistent.*session|createPersistentClaudeSession/i);
    // Performance improvement documented
    expect(content).toMatch(/<1s/);
    // hızlı or fast documented
    expect(content).toMatch(/hızlı|HIZLI|fast.*REPL|REPL.*fast/i);
    // Sprint 222 in "where it stands"
    expect(content).toMatch(/Sprint 222/);
  });

  it('nervous-canlı — blueprint reflects non-blocking panic-gate and interactive nervous in REPL', () => {
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    // Non-blocking nervous documented
    expect(content).toMatch(/non.blocking|advisory.*mode|timeout.auto.proceed/i);
    // Nervous CANLI/interactive documented
    expect(content).toMatch(/nervous.*canl[iı]|nervous.*interactive|nervous.*etkileşimli/i);
    // nervous bridge in architecture
    expect(content).toMatch(/chat.nervous.bridge/i);
    // accept/reject in REPL
    expect(content).toMatch(/accept.*reject|nervous.*accept/i);
  });

  it('görsel zenginlik — blueprint reflects markdown rendering, spinner, and streaming', () => {
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    // Markdown rendering documented
    expect(content).toMatch(/renderMarkdown|markdown.*render/i);
    // Spinner documented
    expect(content).toMatch(/spinner|createSpinner/i);
    // Token streaming documented
    expect(content).toMatch(/stream.*chunk|token.*stream|streaming/i);
    // Visual/görsel keyword
    expect(content).toMatch(/görsel|visual|ANSI/i);
  });
});
