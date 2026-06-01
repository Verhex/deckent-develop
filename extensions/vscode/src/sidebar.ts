// VS Code extension sidebar TreeDataProvider for Deckent sprint/agent status.
// Dependency-injected (SidebarFs) so the provider is testable without a vscode runtime.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TreeItem {
  label: string;
  description?: string;
  contextValue?: string;
  children?: TreeItem[];
}

export interface TreeDataProvider {
  getChildren(element?: TreeItem): TreeItem[];
  onDidChangeTreeData(listener: () => void): { dispose(): void };
  refresh(): void;
}

export interface SidebarFs {
  readDir(dir: string): string[];
  readJson(filePath: string): unknown;
}

// ─── Default fs implementation ────────────────────────────────────────────────

export function createNodeFs(): SidebarFs {
  return {
    readDir: (dir) => readdirSync(dir, { withFileTypes: false }) as unknown as string[],
    readJson: (filePath) => JSON.parse(readFileSync(filePath, 'utf8')),
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class DeckentSidebarProvider implements TreeDataProvider {
  private listeners: (() => void)[] = [];
  private readonly tasksDir: string;
  private readonly fs: SidebarFs;

  constructor(workspaceRoot: string, fs: SidebarFs = createNodeFs()) {
    this.tasksDir = join(workspaceRoot, '.tasks');
    this.fs = fs;
  }

  refresh(): void {
    for (const listener of this.listeners) listener();
  }

  onDidChangeTreeData(listener: () => void): { dispose(): void } {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (element) {
      return element.children ?? [];
    }
    return this.buildRootItems();
  }

  private buildRootItems(): TreeItem[] {
    let taskFiles: string[];
    try {
      taskFiles = this.fs.readDir(this.tasksDir).filter((f) => f.endsWith('.json'));
    } catch {
      return [{ label: 'No active sprint', contextValue: 'empty' }];
    }

    if (taskFiles.length === 0) {
      return [{ label: 'No active sprint', contextValue: 'empty' }];
    }

    const tasks: { id: string; title: string; status: string; sprintId: string }[] = [];
    for (const file of taskFiles) {
      try {
        const data = this.fs.readJson(join(this.tasksDir, file)) as {
          id?: string;
          title?: string;
          status?: string;
          sprintId?: string;
        };
        tasks.push({
          id: data.id ?? file,
          title: data.title ?? file,
          status: data.status ?? 'UNKNOWN',
          sprintId: data.sprintId ?? 'unknown',
        });
      } catch {
        // skip malformed task files
      }
    }

    if (tasks.length === 0) {
      return [{ label: 'No active sprint', contextValue: 'empty' }];
    }

    const sprintId = tasks[0]!.sprintId;
    const taskNodes: TreeItem[] = tasks.map((t) => ({
      label: t.title,
      description: t.status,
      contextValue: 'task',
    }));

    const sprintNode: TreeItem = {
      label: `Sprint: ${sprintId}`,
      contextValue: 'sprint',
      children: taskNodes,
    };

    return [sprintNode];
  }
}
