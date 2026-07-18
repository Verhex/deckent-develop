// ═══ tool-exec-labels — i18n adapter for chat-tool-exec confirm summaries ═════
//
// REPL-575 K5. chat-tool-exec.ts is a string-free mechanism module (CLAUDE.md
// i18n-FIRST): it takes a `ToolExecLabels` set and never hardcodes user-facing
// text. This tiny caller-side adapter resolves that set from the message
// catalog for a given language — kept OUT of chat-tool-exec.ts so the mechanism
// stays decoupled from the i18n table. Interactive REPL entry points (run.tsx,
// entry.ts) build it per session; headless workers omit labels and get the
// English DEFAULT_TOOL_EXEC_LABELS.

import { getMessage } from './messages.js';
import type { ToolExecLabels } from '../commands/chat-tool-exec.js';

/** Resolve the localized confirm-prompt summaries for the given UI language. */
export function buildToolExecLabels(lang: string): ToolExecLabels {
  return {
    writeSummary: (path, chars) => getMessage('tool.confirm_write', lang, { path, chars: String(chars) }),
    editSummary: (path) => getMessage('tool.confirm_edit', lang, { path }),
    bashSummary: (cmd) => getMessage('tool.confirm_bash', lang, { cmd }),
    // 583/N4 — git confirm summaries (add/commit are the human seal).
    gitAddSummary: (pathsDesc) => getMessage('tool.confirm_git_add', lang, { paths: pathsDesc }),
    gitCommitSummary: (subject) => getMessage('tool.confirm_git_commit', lang, { subject }),
  };
}
