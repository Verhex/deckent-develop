// src/cli/repl/native-agent-bridge.ts
// ═══ Native agent bridge (SP-1 M3, §9) ══════════════════════════════════════
// The engine-swap target: builds an AgentSession and returns a ReplEngine — the
// same (input, {output, onTurnEnd}) shape app.tsx already drives. It maps the
// AgentEvent stream onto the existing view callbacks and bridges the permission
// lifecycle to the existing Sprint-285 confirm-queue (ConfirmTrigger) →
// respondPermission. View-neutral mapping; the legacy path is untouched.

import { createAgentSession } from '../../agent/session.js';
import { loadPolicy } from '../../agent/permission-policy.js';
import { createRuleStore } from '../../agent/permission-store.js';
import type { ProviderAdapter } from '../../agent/provider-tooluse/types.js';
import type { ToolRegistry } from '../../agent/tools/registry.js';
import type { AgentEvent } from '../../agent/events.js';
import type { PermissionResponse } from '../../agent/loop.js';
import type { ToolInfo } from './app.js';

/** The view's engine contract (same shape the legacy runChatNativeLoop satisfies). */
export type ReplEngine = (
  input: string,
  cbs: { output: (text: string) => void; onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void },
) => Promise<void>;

export interface NativeEngineDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  cwd: string;
  model: string;
  lang: 'en' | 'tr';
  /** The existing confirm-queue trigger (run.tsx confirmTrigger). 'y'|'a'|'n'. */
  confirm: (summary: string, toolName: string) => Promise<'y' | 'a' | 'n'>;
  /** The existing tool/change-block sink (run.tsx toolSink). */
  toolSink: (info: ToolInfo) => void;
  maxIterations?: number;
}

/** Map a confirm-queue answer to a session permission decision. */
function toDecision(answer: 'y' | 'a' | 'n'): PermissionResponse {
  if (answer === 'n') return { decision: 'deny' };
  if (answer === 'a') return { decision: 'always' }; // persisted, matches "hep izin ver"
  return { decision: 'once' };
}

export function createNativeEngine(deps: NativeEngineDeps): ReplEngine {
  const session = createAgentSession({
    adapter: deps.adapter,
    registry: deps.registry,
    policy: loadPolicy(deps.cwd),
    ruleStore: createRuleStore(deps.cwd),
    cwd: deps.cwd,
    model: deps.model,
    lang: deps.lang,
    ...(deps.maxIterations !== undefined ? { maxIterations: deps.maxIterations } : {}),
  });

  return async (input, cbs) => {
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const ev of session.send(input) as AsyncIterable<AgentEvent>) {
      switch (ev.type) {
        case 'text-delta':
          cbs.output(ev.text);
          break;
        case 'permission-request': {
          const answer = await deps.confirm(`${ev.tool}${ev.resource ? ` (${ev.resource})` : ''}`, ev.tool);
          session.respondPermission(ev.id, toDecision(answer));
          break;
        }
        case 'tool-result':
          deps.toolSink({ verb: ev.tool, target: '', ...(ev.ok ? {} : { failed: true }) });
          break;
        case 'usage':
          inputTokens = ev.inputTokens;
          outputTokens = ev.outputTokens;
          break;
        case 'error':
          cbs.output(`\n[${ev.message}]`);
          break;
        // 'tool-proposed' / 'tool-executing' are progress-only; 'turn-end' falls through.
      }
    }
    cbs.onTurnEnd({ inputTokens, outputTokens });
  };
}
