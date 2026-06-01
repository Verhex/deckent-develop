// VS Code extension entrypoint for Deckent IDE integration.
// Sprint 214-010: real activation + workspace deckent detection.
// Dependency-injected (VsCodeApi) so the activation logic is testable without a vscode runtime.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtensionContext {
  subscriptions: { dispose(): void }[];
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
  };
  workspace?: WorkspaceApi;
}

// ─── State ───────────────────────────────────────────────────────────────────

const COMMANDS = ['deckent.startSprint', 'deckent.showDashboard'] as const;
const DECKENT_MARKERS = ['.deckent/config.json', '.deckent/sprint-state.json'] as const;

let detectedDeckent = false;

// ─── Public API ──────────────────────────────────────────────────────────────

export function activate(context: ExtensionContext, vscode: VsCodeApi): void {
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
