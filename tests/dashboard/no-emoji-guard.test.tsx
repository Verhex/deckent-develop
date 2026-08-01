import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Matches Unicode emoji ranges defined in the task kanıt command:
// grep -rnoP "[\x{1F300}-\x{1FAFF}\x{1F000}-\x{1F0FF}]"
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;

const ROOT = process.cwd();

const TARGET_FILES = [
  'src/dashboard/src/components/WorkerCard.tsx',
  'src/dashboard/src/components/ActivityFeed.tsx',
  'src/dashboard/src/components/SprintControlPanel.tsx',
  'src/dashboard/src/pages/DashboardPage.tsx',
];

function countEmoji(content: string): number {
  return (content.match(new RegExp(EMOJI_RE.source, 'gu')) ?? []).length;
}

describe('no-emoji-guard — dashboard components must use Lucide icons, not emoji', () => {
  it('WorkerCard.tsx has zero emoji-presentation characters in the target ranges', () => {
    const content = readFileSync(resolve(ROOT, 'src/dashboard/src/components/WorkerCard.tsx'), 'utf-8');
    const matches = content.match(new RegExp(EMOJI_RE.source, 'gu')) ?? [];
    expect(matches).toHaveLength(0);
  });

  it('ActivityFeed.tsx has zero emoji-presentation characters in the target ranges', () => {
    const content = readFileSync(resolve(ROOT, 'src/dashboard/src/components/ActivityFeed.tsx'), 'utf-8');
    const matches = content.match(new RegExp(EMOJI_RE.source, 'gu')) ?? [];
    expect(matches).toHaveLength(0);
  });

  it('SprintControlPanel.tsx and DashboardPage.tsx have zero emoji-presentation characters', () => {
    const panel = readFileSync(resolve(ROOT, 'src/dashboard/src/components/SprintControlPanel.tsx'), 'utf-8');
    const page = readFileSync(resolve(ROOT, 'src/dashboard/src/pages/DashboardPage.tsx'), 'utf-8');
    expect(countEmoji(panel)).toBe(0);
    expect(countEmoji(page)).toBe(0);
  });

  it('total emoji count across all target files is zero', () => {
    const total = TARGET_FILES.reduce((sum, f) => {
      const content = readFileSync(resolve(ROOT, f), 'utf-8');
      return sum + countEmoji(content);
    }, 0);
    expect(total).toBe(0);
  });
});
