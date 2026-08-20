// ─── `deckent approvals` — runtime-wide approval inbox + local-terminal decision ──
//
// The K6 local-terminal live re-auth channel made production (§12.2 clause 1):
// a decision minted here goes through the runtime's `decideTerminal` ingress,
// whose LocalTerminalLiveApprovalAuthenticator only accepts a REAL interactive
// re-authentication assertion — an explicit confirmation typed at a TTY by the
// same OS user the request was submitted for, inside an owner-bounded window.
// A non-TTY invocation cannot re-authenticate and therefore cannot decide:
// the ingress records nothing and downstream claims stay DECISION_UNTRUSTED.
// This surface never bypasses the broker, never fabricates an authorization
// envelope, and adds no second decision protocol.

import { createInterface } from 'node:readline/promises';
import { listFederatedPendingItems } from '../../core/approval-inbox-federation.js';
import { gatewayHome } from '../../connectors/gateway/gateway-paths.js';
import { userInfo } from 'node:os';
import type { Command } from 'commander';

import { loadConfig } from '../../core/config.js';
import { openApprovalAuthorityRuntime } from '../../core/approval-authority-runtime.js';
import type { LocalTerminalReauthenticationProvider } from '../../core/approval-terminal-authenticator.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

const LOCAL_TERMINAL_CHANNEL = 'local-terminal';
const LOCAL_TERMINAL_AUTHORITY_REF = 'local-terminal:interactive-tty-confirmation:v1';

/**
 * Human-readable local timestamp (dd.MM.yyyy HH:mm) for the decision card.
 * The stored value is a machine ISO string; operators read a wall-clock time.
 */
function formatDecisionTimestamp(iso: string, lang: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  return new Date(parsed).toLocaleString(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface ApprovalsDecideOpts {
  allow?: boolean;
  deny?: boolean;
  reason?: string;
}

/**
 * Interactive TTY confirmation as the live re-authentication event. Returns
 * null (→ honest DECISION_UNTRUSTED downstream) whenever the surface cannot
 * prove a present human: no TTY, wrong confirmation phrase, or a missing
 * owner-authored terminal auth window.
 */
function createInteractiveTerminalReauthProvider(input: {
  readonly maxAuthAgeSeconds: number;
  readonly confirmPrompt: string;
  readonly confirmToken: string;
  readonly now?: () => Date;
}): LocalTerminalReauthenticationProvider {
  return {
    async reauthenticate(context) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) return null;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      let answer: string;
      try {
        answer = (await rl.question(input.confirmPrompt)).trim();
      } finally {
        rl.close();
      }
      if (answer !== input.confirmToken) return null;
      const now = (input.now ?? (() => new Date()))();
      return {
        actorId: userInfo().username,
        tenantId: context.request.tenantId,
        authorityRef: LOCAL_TERMINAL_AUTHORITY_REF,
        authenticatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + input.maxAuthAgeSeconds * 1000).toISOString(),
      };
    },
  };
}

export function registerApprovalsCommand(program: Command): void {
  const lang = getLanguage(undefined);
  const approvals = program
    .command('approvals')
    .description(getMessage('approvals.cmd_desc', lang));

  approvals
    .command('list')
    .description(getMessage('approvals.list_desc', lang))
    .action(async () => {
      const root = resolveProjectRoot();
      const config = await loadConfig(root);
      const language = getLanguage(config.language);
      const authority = config.approval?.authority;
      if (authority?.enabled !== true) {
        printError(new Error(getMessage('approvals.authority_disabled', language)));
        process.exitCode = 1;
        return;
      }
      const opened = openApprovalAuthorityRuntime({
        projectRoot: root,
        tenantId: authority.tenant_id,
      });
      if (opened.state !== 'ready') {
        printError(new Error(getMessage('approvals.runtime_hold', language, {
          reason: opened.reasonCode,
          detail: opened.detailCode,
        })));
        process.exitCode = 1;
        return;
      }
      try {
        const pending = opened.service.broker.list('pending');
        if (pending.length === 0) {
          print(getMessage('approvals.none_pending', language));
        } else {
          for (const request of pending) {
            print(getMessage('approvals.pending_line', language, {
              id: request.id,
              summary: request.summary,
              expiresAt: request.expiresAt,
            }));
          }
        }
      } finally {
        opened.service.close();
      }
      // D1 federated inbox (APPROVAL-SURFACE-UNIFICATION-001): surface every
      // OTHER surface's pending decisions here too — read-only, origin-tagged,
      // with each surface's CURRENT decision command. Decision paths are
      // untouched (migration is D2).
      const federated = listFederatedPendingItems(root, {
        gatewayHomeDir: gatewayHome(),
      });
      print(getMessage('approvals.federated.header', language));
      if (federated.length === 0) {
        print(getMessage('approvals.federated.none', language));
        return;
      }
      for (const item of federated) {
        print(item.unreadable
          ? getMessage('approvals.federated.row_unreadable', language, {
            origin: item.origin, id: item.id,
          })
          : getMessage('approvals.federated.row', language, {
            origin: item.origin,
            id: item.id,
            summary: item.summary,
            hint: getMessage(item.decideHintKey, language),
          }));
      }
    });

  approvals
    .command('decide <requestId>')
    .description(getMessage('approvals.decide_desc', lang))
    .option('--allow', getMessage('approvals.opt_allow', lang))
    .option('--deny', getMessage('approvals.opt_deny', lang))
    .option('--reason <text>', getMessage('approvals.opt_reason', lang))
    .action(async (requestId: string, opts: ApprovalsDecideOpts) => {
      const root = resolveProjectRoot();
      const config = await loadConfig(root);
      const language = getLanguage(config.language);
      if (opts.allow === opts.deny) {
        printError(new Error(getMessage('approvals.decide_requires_action', language)));
        process.exitCode = 1;
        return;
      }
      const authority = config.approval?.authority;
      if (authority?.enabled !== true) {
        printError(new Error(getMessage('approvals.authority_disabled', language)));
        process.exitCode = 1;
        return;
      }
      const maxAuthAgeSeconds = authority.terminal?.max_auth_age_seconds;
      if (!maxAuthAgeSeconds || maxAuthAgeSeconds <= 0) {
        printError(new Error(getMessage('approvals.terminal_window_missing', language)));
        process.exitCode = 1;
        return;
      }
      const opened = openApprovalAuthorityRuntime({
        projectRoot: root,
        tenantId: authority.tenant_id,
      });
      if (opened.state !== 'ready') {
        printError(new Error(getMessage('approvals.runtime_hold', language, {
          reason: opened.reasonCode,
          detail: opened.detailCode,
        })));
        process.exitCode = 1;
        return;
      }
      try {
        const action = opts.allow ? 'allow' as const : 'deny' as const;
        const actionLabel = getMessage(
          action === 'allow' ? 'approvals.action_allow' : 'approvals.action_deny',
          language,
        );
        // Human-facing decision card: WHAT is being decided, its exact scope,
        // its ceilings, and what an allow actually grants — before any prompt.
        const request = opened.service.broker.getRequest(requestId);
        if (request) {
          const details = request.details as {
            subject?: {
              provider?: string;
              model?: string;
              backendScope?: string;
              budget?: { maxTokens?: number; timeoutMs?: number };
            };
          } | undefined;
          const subject = details?.subject;
          print(getMessage('approvals.decide_context', language, {
            summary: request.summary,
            provider: subject?.provider ?? '-',
            model: subject?.model ?? '-',
            backendScope: subject?.backendScope ?? '-',
            maxTokens: String(subject?.budget?.maxTokens ?? '-'),
            timeoutSec: String(subject?.budget?.timeoutMs !== undefined
              ? Math.round(subject.budget.timeoutMs / 1000)
              : '-'),
            expiresAt: formatDecisionTimestamp(request.expiresAt, language),
          }));
        }
        const outcome = await opened.service.decideTerminal(
          {
            provider: createInteractiveTerminalReauthProvider({
              maxAuthAgeSeconds,
              confirmPrompt: getMessage('approvals.confirm_prompt', language, {
                id: requestId,
                action: actionLabel,
              }),
              confirmToken: 'yes',
            }),
            channel: LOCAL_TERMINAL_CHANNEL,
          },
          {
            requestId,
            action,
            idempotencyKey: `cli-approvals:${requestId}:${action}`,
            ...(opts.reason ? { reason: opts.reason } : {}),
          },
        );
        if (outcome.kind === 'decided' || outcome.kind === 'idempotent') {
          print(getMessage('approvals.decided', language, {
            id: requestId,
            action: actionLabel,
          }));
          if (action === 'allow') print(getMessage('approvals.decided_effect', language));
          return;
        }
        printError(new Error(getMessage('approvals.decision_refused', language, {
          id: requestId,
          kind: outcome.kind,
          reason: 'reason' in outcome ? String(outcome.reason) : '-',
        })));
        process.exitCode = 1;
      } finally {
        opened.service.close();
      }
    });
}
