// Task 214-011: VS Code extension sidebar TreeDataProvider tests.
// Tests: tree root, worker/task node, refresh event, empty sprint.
// Uses dependency-injected SidebarFs — no real disk or vscode runtime needed.

import { describe, it, expect, vi } from 'vitest';
import {
  DeckentSidebarProvider,
  type SidebarFs,
  type TreeItem,
} from '../../extensions/vscode/src/sidebar.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFs(files: Record<string, unknown>): SidebarFs {
  return {
    readDir: vi.fn((dir: string) => {
      void dir;
      return Object.keys(files);
    }),
    readJson: vi.fn((filePath: string) => {
      const key = Object.keys(files).find((k) => filePath.endsWith(k));
      if (!key) throw new Error(`File not found: ${filePath}`);
      return files[key];
    }),
  };
}

function makeEmptyFs(): SidebarFs {
  return {
    readDir: vi.fn((_dir: string) => []),
    readJson: vi.fn((_path: string): unknown => { throw new Error('no files'); }),
  };
}

function makeMissingDirFs(): SidebarFs {
  return {
    readDir: vi.fn((_dir: string) => { throw new Error('ENOENT: .tasks not found'); }),
    readJson: vi.fn((_path: string): unknown => null),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DeckentSidebarProvider (214-011)', () => {
  it('returns a sprint root node when task files are present', () => {
    const fs = makeFs({
      'task-001.json': {
        id: '001',
        title: 'Auth fix',
        status: 'DONE',
        sprintId: 'sprint-214',
      },
    });
    const provider = new DeckentSidebarProvider('/workspace', fs);

    const roots = provider.getChildren(undefined);

    expect(roots.length).toBe(1);
    expect(roots[0]!.label).toBe('Sprint: sprint-214');
    expect(roots[0]!.contextValue).toBe('sprint');
  });

  it('returns task (worker) nodes as children of the sprint root node', () => {
    const fs = makeFs({
      'task-001.json': {
        id: '001',
        title: 'Auth fix',
        status: 'EXECUTING',
        sprintId: 'sprint-214',
      },
      'task-002.json': {
        id: '002',
        title: 'UI pass',
        status: 'DONE',
        sprintId: 'sprint-214',
      },
    });
    const provider = new DeckentSidebarProvider('/workspace', fs);

    const roots = provider.getChildren(undefined);
    const sprintNode: TreeItem = roots[0]!;
    const children = provider.getChildren(sprintNode);

    expect(children.length).toBe(2);
    const labels = children.map((c) => c.label);
    expect(labels).toContain('Auth fix');
    expect(labels).toContain('UI pass');
    const executing = children.find((c) => c.label === 'Auth fix');
    expect(executing?.description).toBe('EXECUTING');
  });

  it('calls onDidChangeTreeData listeners when refresh() is invoked', () => {
    const provider = new DeckentSidebarProvider('/workspace', makeEmptyFs());
    const listener = vi.fn();

    const subscription = provider.onDidChangeTreeData(listener);
    provider.refresh();
    expect(listener).toHaveBeenCalledTimes(1);

    provider.refresh();
    expect(listener).toHaveBeenCalledTimes(2);

    subscription.dispose();
    provider.refresh();
    expect(listener).toHaveBeenCalledTimes(2); // no more calls after dispose
  });

  it('returns a "No active sprint" node when .tasks/ is empty or missing', () => {
    const emptyProvider = new DeckentSidebarProvider('/workspace', makeEmptyFs());
    const roots = emptyProvider.getChildren(undefined);
    expect(roots.length).toBe(1);
    expect(roots[0]!.label).toBe('No active sprint');
    expect(roots[0]!.contextValue).toBe('empty');

    const missingProvider = new DeckentSidebarProvider('/workspace', makeMissingDirFs());
    const roots2 = missingProvider.getChildren(undefined);
    expect(roots2[0]!.label).toBe('No active sprint');
  });

  it('getChildren on a leaf task node returns empty array', () => {
    const leafItem: TreeItem = { label: 'Auth fix', description: 'DONE', contextValue: 'task' };
    const provider = new DeckentSidebarProvider('/workspace', makeEmptyFs());
    const children = provider.getChildren(leafItem);
    expect(children).toEqual([]);
  });
});
