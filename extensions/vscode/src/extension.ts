// VS Code extension entrypoint for Deckent IDE integration.
// Sprint 214-010: real activation + workspace deckent detection.
// Sprint 343-005: status-bar integration, proper disposal via context.subscriptions.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtensionContext {
  subscriptions: { dispose(): void }[];
}

export interface StatusBarItem {
  text: string;
  tooltip: string;
  show(): void;
  dispose(): void;
}

export interface WorkspaceApi {
  hasMarker(relativePath: string): boolean;
}

export interface VsCodeApi {
  commands: {
    registerCommand(id: string, handler: () => void): { dispose(): void };
  };
  window: {
    showInformationMessage(message: string): void;
    createStatusBarItem(id: string, alignment: number, priority: number): StatusBarItem;
  };
  workspace?: WorkspaceApi;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMANDS = ['deckent.startSprint', 'deckent.showDashboard'] as const;
const DECKENT_MARKERS = ['.deckent/config.json', '.deckent/sprint-state.json'] as const;
const STATUS_BAR_ID = 'deckent';
const STATUS_BAR_ALIGNMENT = 1; // StatusBarAlignment.Left
const STATUS_BAR_PRIORITY = 100;
const STATUS_BAR_TEXT = '$(rocket) Deckent';
const STATUS_BAR_TOOLTIP = 'Deckent — AI Agent Orchestrator';

// ─── State ───────────────────────────────────────────────────────────────────

let detectedDeckent = false;

// ─── Public API ──────────────────────────────────────────────────────────────

export function activate(context: ExtensionContext, vscode: VsCodeApi): void {
  // Status bar — created via injected API so dispose is handled by subscriptions.
  const bar = vscode.window.createStatusBarItem(STATUS_BAR_ID, STATUS_BAR_ALIGNMENT, STATUS_BAR_PRIORITY);
  bar.text = STATUS_BAR_TEXT;
  bar.tooltip = STATUS_BAR_TOOLTIP;
  bar.show();
  context.subscriptions.push(bar);

  // Commands — disposables pushed so VS Code cleans up on deactivate.
  for (const commandId of COMMANDS) {
    const disposable = vscode.commands.registerCommand(commandId, () => {
      vscode.window.showInformationMessage(`Deckent: ${commandId}`);
    });
    context.subscriptions.push(disposable);
  }

  detectedDeckent = detectDeckentWorkspace(vscode.workspace);
  if (detectedDeckent) {
    vscode.window.showInformationMessage('Deckent: workspace detected');
  }
}

export function deactivate(): void {
  detectedDeckent = false;
}

export function isDeckentDetected(): boolean {
  return detectedDeckent;
}

// ─── Detection ───────────────────────────────────────────────────────────────

function detectDeckentWorkspace(workspace: WorkspaceApi | undefined): boolean {
  if (!workspace) return false;
  for (const marker of DECKENT_MARKERS) {
    if (workspace.hasMarker(marker)) return true;
  }
  return false;
}
