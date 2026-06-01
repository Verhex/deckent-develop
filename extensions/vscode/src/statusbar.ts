// VS Code extension status bar for Deckent sprint progress.
// Dependency-injected (StatusBarVsCodeApi) — no vscode module import required.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StatusBarItem {
  text: string;
  tooltip: string;
  command?: string;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface StatusBarVsCodeApi {
  window: {
    createStatusBarItem(): StatusBarItem;
  };
}

export interface SprintProgress {
  done: number;
  total: number;
}

// ─── StatusBar ────────────────────────────────────────────────────────────────

export class DeckentStatusBar {
  private readonly item: StatusBarItem;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    vscode: StatusBarVsCodeApi,
    private readonly dashboardCommand = 'deckent.showDashboard',
  ) {
    this.item = vscode.window.createStatusBarItem();
    this.item.command = dashboardCommand;
    this.item.text = '$(rocket) Deckent';
    this.item.tooltip = 'Click to open Deckent dashboard';
    this.item.show();
  }

  updateProgress(progress: SprintProgress): void {
    this.item.text = `$(rocket) Deckent ${progress.done}/${progress.total}`;
  }

  startPolling(getProgress: () => SprintProgress, intervalMs = 10_000): void {
    this.intervalId = setInterval(() => {
      this.updateProgress(getProgress());
    }, intervalMs);
  }

  dispose(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.item.dispose();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStatusBar(
  vscode: StatusBarVsCodeApi,
  dashboardCommand?: string,
): DeckentStatusBar {
  return new DeckentStatusBar(vscode, dashboardCommand);
}
