// Structured command selection is presentation only. The caller must re-enter
// posture and canonical confirmation authority before using the capture seam.
import { cliToolForStructuredActionRequest, resolveCliStructuredActionRequest, type CliStructuredActionRequest } from '../helpers/cli-tool-capture.js';
import type { PickerSpec } from './picker.js';
import type { CliToolDispatcher } from '../commands/chat-tool-bridge.js';

export type StructuredActionDecision =
  | { readonly kind: 'captured'; readonly result: Awaited<ReturnType<CliToolDispatcher['dispatchStructuredAction']>> }
  | { readonly kind: 'denied'; readonly rendered: string };

export type StructuredActionFamily = 'sync' | 'audit';
export interface StructuredActionLabels {
  readonly syncTitle: string;
  readonly auditTitle: string;
  readonly preview: string;
  readonly apply: string;
  readonly gate: string;
  readonly query: string;
  readonly compliance: string;
  readonly gatePrompt: string;
  readonly invalid: string;
  readonly busy: string;
}

const ACTIONS = { sync: ['preview', 'apply'], audit: ['gate', 'query', 'compliance'] } as const;

export function buildStructuredActionPicker(family: StructuredActionFamily, labels: StructuredActionLabels): PickerSpec {
  return {
    kind: 'action', titleSubject: family === 'sync' ? labels.syncTitle : labels.auditTitle,
    initialId: ACTIONS[family][0], scopes: ['apply'],
    candidates: ACTIONS[family].map((id) => ({ id, label: labels[id], facts: [], state: 'ok' })),
  };
}

export type StructuredActionInput =
  | { readonly kind: 'picker'; readonly family: StructuredActionFamily }
  | { readonly kind: 'request'; readonly request: CliStructuredActionRequest }
  | { readonly kind: 'prompt'; readonly command: '/audit gate' }
  | { readonly kind: 'invalid' };

/** Typed and numbered forms share the same closed action set as the card. */
export function resolveStructuredActionInput(input: string): StructuredActionInput | null {
  const tokens = input.trim().split(/\s+/u);
  const command = tokens[0]?.toLowerCase();
  if (command !== '/sync' && command !== '/audit') return null;
  const family: StructuredActionFamily = command === '/sync' ? 'sync' : 'audit';
  if (tokens.length === 1) return { kind: 'picker', family };
  const rawAction = tokens[1]?.toLowerCase() ?? '';
  const action = /^[1-3]$/u.test(rawAction) ? ACTIONS[family][Number(rawAction) - 1] : rawAction;
  let request: CliStructuredActionRequest;
  if (family === 'sync') {
    if (tokens.length !== 2 || (action !== 'preview' && action !== 'apply')) return { kind: 'invalid' };
    request = { kind: 'sync', mode: action };
  } else if (action === 'gate') {
    if (tokens.length === 2) return { kind: 'prompt', command: '/audit gate' };
    if (tokens.length !== 3) return { kind: 'invalid' };
    request = { kind: 'audit-gate', sprintId: tokens[2]! };
  } else if (action === 'query') {
    if (tokens.length > 3) return { kind: 'invalid' };
    request = { kind: 'audit-query', ...(tokens[2] ? { channel: tokens[2] } : {}) };
  } else if (action === 'compliance') {
    if (tokens.length > 3) return { kind: 'invalid' };
    request = { kind: 'audit-compliance', ...(tokens[2] ? { sprintId: tokens[2] } : {}) };
  } else return { kind: 'invalid' };
  const target = cliToolForStructuredActionRequest(request);
  const resolved = resolveCliStructuredActionRequest(target.tool, target.args);
  return resolved ? { kind: 'request', request: resolved } : { kind: 'invalid' };
}
