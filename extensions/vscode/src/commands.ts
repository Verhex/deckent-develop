// VS Code extension command handlers and status bar stub for Deckent.
// Full MCP wiring planned for Sprint 213-214.
// Uses dependency injection (CommandsVsCodeApi) — no vscode module import required.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StatusBarItem {
  text: string;
  tooltip: string;
  show(): void;
  dispose(): void;
}

export interface OutputChannel {
  appendLine(line: string): void;
  show(): void;
}

export interface CommandsVsCodeApi {
  commands: {
    registerCommand(id: string, handler: () => void): { dispose(): void };
  };
  window: {
    createTerminal(name: string): { sendText(text: string): void; show(): void };
    createOutputChannel(name: string): OutputChannel;
    createStatusBarItem(): StatusBarItem;
    showInformationMessage(message: string): void;
  };
  env: {
    openExternal(url: string): void;
  };
}

// ─── Command Dispatch ─────────────────────────────────────────────────────────

const DASHBOARD_URL = 'http://localhost:3000';

export function handleCommand(id: string, vscode: CommandsVsCodeApi): void {
  if (id === 'deckent.startSprint') {
    const terminal = vscode.window.createTerminal('Deckent');
    terminal.show();
    terminal.sendText('deckent start');
  } else if (id === 'deckent.showDashboard') {
    vscode.env.openExternal(DASHBOARD_URL);
  } else if (id === 'deckent.status') {
    const channel = vscode.window.createOutputChannel('Deckent');
    channel.appendLine('Deckent: checking sprint status...');
    channel.appendLine('Run: deckent status');
    channel.show();
  }
  // unknown command: no-op (graceful)
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

export function createSprintStatusBar(vscode: CommandsVsCodeApi): StatusBarItem {
  const item = vscode.window.createStatusBarItem();
  item.text = '$(rocket) Deckent';
  item.tooltip = 'Deckent sprint progress — Sprint 213-214';
  item.show();
  return item;
}

// ─── Registration ─────────────────────────────────────────────────────────────

const KNOWN_COMMANDS = ['deckent.startSprint', 'deckent.showDashboard'] as const;

export function registerCommands(
  context: { subscriptions: { dispose(): void }[] },
  vscode: CommandsVsCodeApi,
): void {
  for (const id of KNOWN_COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => handleCommand(id, vscode)),
    );
  }
  context.subscriptions.push(createSprintStatusBar(vscode));
}
