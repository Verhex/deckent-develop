// VS Code extension scaffold for Deckent IDE integration.
// Full MCP wiring planned for Sprint 213-214.
// Uses dependency injection (VsCodeApi) so the core logic is testable without the vscode runtime.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtensionContext {
  subscriptions: { dispose(): void }[];
}

export interface VsCodeApi {
  commands: {
    registerCommand(id: string, handler: () => void): { dispose(): void };
  };
  window: {
    showInformationMessage(message: string): void;
  };
}

// ─── State ───────────────────────────────────────────────────────────────────

const COMMANDS = ['deckent.startSprint', 'deckent.showDashboard'] as const;

// ─── Public API ──────────────────────────────────────────────────────────────

export function activate(context: ExtensionContext, vscode: VsCodeApi): void {
  for (const commandId of COMMANDS) {
    const disposable = vscode.commands.registerCommand(commandId, () => {
      vscode.window.showInformationMessage(`Deckent: ${commandId} — Sprint 213-214`);
    });
    context.subscriptions.push(disposable);
  }
}

export function deactivate(): void {
  // Sprint 213-214: resource cleanup
}
