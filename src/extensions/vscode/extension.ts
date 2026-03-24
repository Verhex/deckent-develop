/**
 * VS Code extension stub for Deckent.
 * Connects to Deckent MCP server, shows sprint status in status bar.
 * Full implementation planned for Sprint 049.
 */

// ─── Types (minimal — no vscode dependency in main package) ─────────────────

/** Extension context type provided by VS Code on activation. */
export interface ExtensionContext {
  subscriptions: { dispose(): void }[];
}

/** Status bar item displayed in VS Code bottom bar. */
export interface StatusBarItem {
  text: string;
  tooltip: string;
  show(): void;
  dispose(): void;
}

/** Minimal VS Code API surface used by this extension. */
export interface VsCodeApi {
  commands: {
    registerCommand(id: string, handler: () => void): { dispose(): void };
  };
  window: {
    createStatusBarItem(alignment: number, priority: number): StatusBarItem;
  };
  StatusBarAlignment: { Left: number };
}

// ─── State ──────────────────────────────────────────────────────────────────

let statusBarItem: StatusBarItem | undefined;

// ─── Constants ──────────────────────────────────────────────────────────────

const COMMAND_IDS = ['deckent.start', 'deckent.status', 'deckent.explain'] as const;
const DEFAULT_STATUS_TEXT = 'Deckent: Idle';
const DEFAULT_TOOLTIP = 'Deckent — AI Agent Orchestrator';

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Activate the Deckent VS Code extension.
 * Creates status bar item and registers commands.
 */
export function activate(context: ExtensionContext, vscode: VsCodeApi): void {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = DEFAULT_STATUS_TEXT;
  statusBarItem.tooltip = DEFAULT_TOOLTIP;
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  for (const commandId of COMMAND_IDS) {
    const disposable = vscode.commands.registerCommand(commandId, () => {
      // Stub — full implementation in Sprint 049
    });
    context.subscriptions.push(disposable);
  }
}

/**
 * Deactivate the extension. Cleanup resources.
 */
export function deactivate(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}

/**
 * Get MCP connection config for Deckent server.
 * Used to connect to the running Deckent MCP server for sprint data.
 */
export function getMcpConfig(): { command: string; args: string[]; timeout: number } {
  return {
    command: 'deckent-mcp',
    args: ['--stdio'],
    timeout: 30_000,
  };
}
