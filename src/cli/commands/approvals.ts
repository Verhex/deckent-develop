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
import { looksLikeShortCode, normalizeShortCode, resolveShortCode, shortCodeFor } from '../../core/approval-short-code.js';
import { loadApprovalRules, matchApprovalRule, promoteRuleFromDecision, saveApprovalRules } from '../../core/approval-rules.js';
import { liveRuleFor } from '../../core/approval-rules-engine.js';
import { isDecisionFederatedOrigin, mirrorFederatedItemToBroker, settleFederatedDecision, type DecisionFederatedOrigin } from '../../orchestra/approval-decision-federation.js';
import { gatewayHome } from '../../connectors/gateway/gateway-paths.js';
import { userInfo } from 'node:os';
import type { Command } from 'commander';
import {
  bindGovernanceArgumentDescriptions,
  getGovernanceMessage,
} from '../helpers/message-catalog/cli-governance.js';

import { loadConfig } from '../../core/config.js';
import { ApprovalStore } from '../../core/approval-store.js';
import type { ApprovalRequest } from '../../core/approval-contract.js';
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
  always?: boolean;
}

function lifecycleAuditView(
  request: ApprovalRequest,
  store: ApprovalStore,
): Record<string, unknown> | null {
  if (request.version !== '2.0') return null;
  const entry = store.load().pending.find(candidate => candidate.request.id === request.id)
    ?? store.load().expired.find(candidate => candidate.request.id === request.id);
  const applied = entry?.lifecycle;
  return {
    origin: applied?.origin ?? request.origin,
    riskTier: applied?.riskTier ?? request.riskTier,
    lifecycleStage: request.slaStage,
    effectiveExpiresAt: applied?.effectiveExpiresAt ?? request.expiresAt,
    lifecycleGeneration: request.lifecycleGeneration,
    policySnapshotDigest: request.policySnapshotDigest,
    appliedPolicyDigest: applied?.appliedPolicyDigest ?? request.policySnapshotDigest,
    sourceReference: request.source.reference,
    policyTransitionChanged: applied?.policyTransitionChanged ?? false,
    weakeningIgnored: applied?.weakeningIgnored ?? false,
  };
}

function quarantineRequestId(file: string): string | null {
  return file.endsWith('.request.json') ? file.slice(0, -'.request.json'.length) : null;
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

  // Access classification stated in help: a list is a read, a decide is an
  // authenticated decision. The two used to look interchangeable in `--help`.
  approvals
    .command('list')
    .description(getMessage('approvals.list_desc', lang))
    .addHelpText('after', `\n${getGovernanceMessage('cli.governance.approvals.list.note', lang)}\n`)
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
      // A list is a strictly read-only projection. ApprovalStore's index applies
      // the current lifecycle policy to the durable bytes without writing the
      // expiry decision/receipt; the scheduled driver or an authenticated
      // decision attempt owns closure writes.
      const store = new ApprovalStore(root, config.approval?.lifecycle
        ? { lifecycle: config.approval.lifecycle }
        : {});
      const rules = loadApprovalRules(root);
      if (rules.fault) print(getMessage('approvals.rules_fault', language));
      const pending = store.load().pending
        .map(entry => entry.request)
        .filter(request => request.tenantId === authority.tenant_id);
      if (pending.length === 0) {
        print(getMessage('approvals.none_pending', language));
      } else {
        for (const request of pending) {
          const lifecycle = lifecycleAuditView(request, store);
          print(getMessage('approvals.pending_line', language, {
            code: shortCodeFor(request.id),
            id: request.id,
            summary: request.summary,
            expiresAt: String(lifecycle?.['effectiveExpiresAt'] ?? request.expiresAt),
          }));
          if (lifecycle) {
            print(getMessage('approvals.lifecycle_detail', language, {
              origin: String(lifecycle['origin']),
              riskTier: String(lifecycle['riskTier']),
              stage: String(lifecycle['lifecycleStage']),
              expiresAt: String(lifecycle['effectiveExpiresAt']),
            }));
            // Stable field names are a machine-readable audit projection,
            // not user-facing prose. Human labels remain exclusively i18n.
            print(JSON.stringify(lifecycle));
          }
          const matched = matchApprovalRule(request, rules.rules);
          if (matched) {
            print(getMessage('approvals.rule_advice', language, {
              ruleId: matched.id, decision: matched.decision,
            }));
          }
        }
      }
      // D1 federated inbox (APPROVAL-SURFACE-UNIFICATION-001): surface every
      // OTHER surface's pending decisions here too — read-only, origin-tagged,
      // with each surface's CURRENT decision command. Decision paths are
      // untouched (migration is D2).
      const federated = listFederatedPendingItems(root, {
        gatewayHomeDir: gatewayHome(),
      }).filter(item => item.tenantId === undefined || item.tenantId === authority.tenant_id);
      for (const item of store.load().quarantined) {
        print(getMessage('approvals.federated.row_quarantined', language, {
          origin: 'broker-native',
          id: quarantineRequestId(item.file) ?? item.file,
          reason: item.reasonCode,
          sourceReference: item.sourceReference,
        }));
      }
      for (const entry of store.load().expired
        .filter(candidate => candidate.request.tenantId === authority.tenant_id)) {
        const receipt = store.getTimeoutReceipt(entry.request.id);
        if (!receipt) continue;
        print(getMessage('approval.lifecycle.stage.expired', language));
        print(JSON.stringify(receipt));
      }
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
          : item.quarantined
            ? getMessage('approvals.federated.row_quarantined', language, {
              origin: item.origin,
              id: item.id,
              reason: item.lifecycleReasonCode ?? '-',
              sourceReference: item.sourceReference ?? '-',
            })
            : item.expiresAt || item.riskTier || item.lifecycleStage
              ? getMessage('approvals.federated.row_lifecycle', language, {
                code: shortCodeFor(item.id),
                origin: item.origin,
                id: item.id,
                summary: item.summary,
                hint: getMessage(item.decideHintKey, language),
                expiresAt: item.expiresAt ?? '-',
                riskTier: item.riskTier ?? '-',
                stage: item.lifecycleStage ?? '-',
              })
          : getMessage('approvals.federated.row', language, {
            code: shortCodeFor(item.id),
            origin: item.origin,
            id: item.id,
            summary: item.summary,
            hint: getMessage(item.decideHintKey, language),
          }));
      }
    });

  bindGovernanceArgumentDescriptions(
    approvals.command('decide <requestId>'),
    lang,
    { requestId: 'cli.governance.approvals.arg.request_id' },
  )
    .description(getMessage('approvals.decide_desc', lang))
    .addHelpText('after', `\n${getGovernanceMessage('cli.governance.approvals.decide.note', lang)}\n`)
    .option('--allow', getMessage('approvals.opt_allow', lang))
    .option('--deny', getMessage('approvals.opt_deny', lang))
    .option('--reason <text>', getMessage('approvals.opt_reason', lang))
    .option('--always', getMessage('approvals.opt_always', lang))
    .action(async (requestIdArg: string, opts: ApprovalsDecideOpts) => {
      let requestId = requestIdArg;
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
      const store = new ApprovalStore(root, config.approval?.lifecycle
        ? { lifecycle: config.approval.lifecycle }
        : {});
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
        // DE1+D2a resolution: short codes resolve against the UNION of the
        // broker pending set and the federated pending items (the same code
        // renders everywhere, so it must resolve everywhere). A full id that
        // the broker does not know is likewise looked up in the federated
        // set. Unknown/stale fails closed; ambiguity demands the full id.
        const federatedInbox = listFederatedPendingItems(root, {
          gatewayHomeDir: gatewayHome(),
        });
        const federatedAll = federatedInbox
          .filter(item => item.tenantId === undefined || item.tenantId === authority.tenant_id);
        const federatedQuarantine = federatedAll.filter(item => item.quarantined === true);
        const brokerQuarantine = store.load().quarantined;
        const federatedQuarantinedById = federatedQuarantine.find(item => item.id === requestId);
        const brokerQuarantinedById = brokerQuarantine
          .find(item => quarantineRequestId(item.file) === requestId);
        if (federatedQuarantinedById || brokerQuarantinedById) {
          printError(new Error(getMessage('approvals.federated.row_quarantined', language, {
            origin: federatedQuarantinedById?.origin ?? 'broker-native',
            id: federatedQuarantinedById?.id
              ?? quarantineRequestId(brokerQuarantinedById!.file)
              ?? brokerQuarantinedById!.file,
            reason: federatedQuarantinedById?.lifecycleReasonCode
              ?? brokerQuarantinedById?.reasonCode
              ?? '-',
            sourceReference: federatedQuarantinedById?.sourceReference
              ?? brokerQuarantinedById?.sourceReference
              ?? '-',
          })));
          process.exitCode = 1;
          return;
        }
        const expiredById = store.load().expired.find(entry =>
          entry.request.id === requestId && entry.request.tenantId === authority.tenant_id);
        if (expiredById) {
          printError(new Error(getMessage('approval.decide.expired', language, {
            expiresAt: expiredById.lifecycle?.effectiveExpiresAt ?? expiredById.request.expiresAt,
          })));
          process.exitCode = 1;
          return;
        }
        const federatedPending = federatedAll
          .filter(item => item.unreadable !== true && item.quarantined !== true);
        let federatedTarget = federatedPending.find(item => item.id === requestId);
        if (looksLikeShortCode(requestId)) {
          const brokerIds = opened.service.broker.list('pending').map(r => r.id);
          // Tenant lineage must participate in short-code resolution. If it
          // were filtered first, a stale broker mirror could resolve the code
          // and bypass the foreign source row that owns the exact id.
          const federatedIds = federatedInbox
            .filter(item => item.unreadable !== true && item.quarantined !== true)
            .map(item => item.id);
          const resolution = resolveShortCode(requestId, [...new Set([...brokerIds, ...federatedIds])]);
          if (resolution.state === 'resolved') {
            requestId = resolution.id;
            federatedTarget = federatedPending.find(item => item.id === resolution.id);
          } else if (resolution.state === 'ambiguous') {
            printError(new Error(getMessage('approvals.code_ambiguous', language, {
              code: normalizeShortCode(requestId), ids: resolution.ids.join(', '),
            })));
            process.exitCode = 1;
            return;
          } else {
            printError(new Error(getMessage('approvals.code_unknown', language, {
              code: normalizeShortCode(requestId),
            })));
            process.exitCode = 1;
            return;
          }
        }
        // Do not hide a same-id row owned by another tenant and then fall
        // through to a (possibly stale) broker mirror. This check deliberately
        // follows short-code resolution but precedes every lifecycle, mirror,
        // or live-decision mutation.
        const foreignTenantTarget = federatedInbox.find(item =>
          item.id === requestId
          && item.tenantId !== undefined
          && item.tenantId !== authority.tenant_id);
        if (foreignTenantTarget) {
          printError(new Error(getMessage('approvals.decision_refused', language, {
            id: requestId,
            kind: 'lineage-mismatch',
            reason: 'tenant-mismatch',
          })));
          process.exitCode = 1;
          return;
        }
        // Only after the exact target tenant has been checked may the
        // authenticated surface perform its canonical expiry reconciliation.
        store.sweepExpired();
        // D2a decision federation: a confirmation/checkpoint target is
        // lazily mirrored into the broker and decided through the SAME
        // live-session ingress (auth asymmetry closed); other origins stay
        // on their surfaces until D2b — typed refusal, never a guess.
        let settleBackOrigin: DecisionFederatedOrigin | undefined;
        if (federatedTarget) {
          if (!isDecisionFederatedOrigin(federatedTarget.origin)) {
            printError(new Error(getMessage('approvals.origin_not_migrated', language, {
              id: federatedTarget.id,
              origin: federatedTarget.origin,
              hint: getMessage(federatedTarget.decideHintKey, language),
            })));
            process.exitCode = 1;
            return;
          }
          // Always pass the exact inbox row through the federation service,
          // even when a broker row with the same id already exists.  Its
          // idempotent path verifies tenant/source/contract lineage; skipping
          // it would let a stale or colliding mirror reach live auth.
          try {
            await mirrorFederatedItemToBroker(opened.service.broker, federatedTarget, {
              tenantId: authority.tenant_id ?? 'main',
            });
          } catch (error) {
            printError(new Error(getMessage('approvals.decision_refused', language, {
              id: requestId,
              kind: 'lineage-mismatch',
              reason: error instanceof Error ? error.message : String(error),
            })));
            process.exitCode = 1;
            return;
          }
          settleBackOrigin = federatedTarget.origin;
        }
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
          if (settleBackOrigin) {
            const settled = await settleFederatedDecision(
              root, settleBackOrigin, requestId, action,
              opts.reason ?? 'decided via unified approvals surface',
              settleBackOrigin === 'confirmation' && federatedTarget && request
                ? {
                    brokerRequest: request,
                    item: federatedTarget,
                    brokerDecision: outcome.decision,
                    lifecycle: config.approval!.lifecycle,
                    verifyBrokerDecision: (candidateRequest, candidateDecision) =>
                      opened.service.decisionAuthority.validate(
                        candidateRequest,
                        candidateDecision,
                        new Date(candidateDecision.decidedAt),
                      ).ok,
                  }
                : undefined);
            if (settled.state === 'settled'
              && (settled.origin !== 'confirmation' || settled.receipt.state === 'APPLIED')) {
              print(getMessage('approvals.settleback_done', language, {
                origin: settleBackOrigin, legacyId: requestId,
              }));
              // The CLI success contract carries the canonical immutable
              // receipt itself.  Replays therefore expose the service's exact
              // winning receipt rather than synthesizing CLI-local evidence.
              if (settled.origin === 'confirmation') print(JSON.stringify(settled.receipt));
            } else {
              printError(new Error(getMessage('approvals.settleback_failed', language, {
                origin: settleBackOrigin,
                reason: settled.state === 'settled'
                  ? 'receipt-not-applied'
                  : settled.reason,
              })));
              process.exitCode = 1;
              return;
            }
          }
          // A federated decision is not successful at the CLI boundary until
          // the reconciliation service has returned its settled receipt.
          // Consequently no allow-effect or durable rule can escape while the
          // legacy source is unreconciled.
          print(getMessage('approvals.decided', language, {
            id: requestId,
            action: actionLabel,
          }));
          if (action === 'allow') print(getMessage('approvals.decided_effect', language));
          // DE2a --always promotion: an EXPLICIT owner decision becomes a
          // persistent, removable routine-tier rule. Never system-minted;
          // advisory until the rule authorization envelope lands (D2b).
          if (opts.always === true) {
            const rule = promoteRuleFromDecision({
              requestId,
              decision: action,
              createdBy: userInfo().username,
              reason: opts.reason ?? 'promoted via --always',
            });
            const existing = loadApprovalRules(root);
            saveApprovalRules(root, [...existing.rules, rule]);
            print(getMessage('approvals.rule_promoted', language, {
              ruleId: rule.id, decision: rule.decision, idPrefix: rule.match.idPrefix,
            }));
          }
          return;
        }
        if (outcome.kind === 'expired') {
          printError(new Error(getMessage('approval.decide.expired', language, {
            expiresAt: outcome.expiresAt,
          })));
          process.exitCode = 1;
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

  const rules = approvals
    .command('rules')
    .description(getMessage('approvals.rules_desc', lang))
    .addHelpText('after', `\n${getGovernanceMessage('cli.governance.approvals.rules.note', lang)}\n`);

  rules
    .command('list')
    .description(getMessage('approvals.rules_list_desc', lang))
    .action(() => {
      const root = resolveProjectRoot();
      const language = getLanguage(undefined);
      const loaded = loadApprovalRules(root);
      if (loaded.fault) print(getMessage('approvals.rules_fault', language));
      if (loaded.rules.length === 0) {
        print(getMessage('approvals.rules_none', language));
        return;
      }
      for (const rule of loaded.rules) {
        print(getMessage('approvals.rules_row', language, {
          id: rule.id,
          state: getMessage(rule.disabled === true
            ? 'approvals.rules_state_disabled'
            : 'approvals.rules_state_active', language),
          decision: rule.decision,
          idPrefix: rule.match.idPrefix,
          summaryIncludes: rule.match.summaryIncludes ? `~"${rule.match.summaryIncludes}"` : '',
          tier: rule.match.riskTierMax,
          createdBy: rule.createdBy,
          source: rule.source,
          reason: rule.reason,
        }));
      }
    });

  const mutateRule = (
    id: string,
    action: 'disable' | 'enable' | 'remove',
  ): void => {
    const root = resolveProjectRoot();
    const language = getLanguage(undefined);
    const loaded = loadApprovalRules(root);
    const target = loaded.rules.find(rule => rule.id === id);
    if (!target) {
      printError(new Error(getMessage('approvals.rules_not_found', language, { id })));
      process.exitCode = 1;
      return;
    }
    const next = action === 'remove'
      ? loaded.rules.filter(rule => rule.id !== id)
      : loaded.rules.map(rule => rule.id !== id ? rule : {
        ...rule,
        disabled: action === 'disable' ? true : undefined,
        ...(action === 'disable'
          ? { disabledAt: new Date().toISOString(), disabledBy: userInfo().username }
          : { disabledAt: undefined, disabledBy: undefined }),
      });
    saveApprovalRules(root, next);
    print(getMessage('approvals.rules_updated', language, { id, action }));
  };

  rules.command('apply')
    .description(getMessage('approvals.rules_apply_desc', lang))
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
        projectRoot: root, tenantId: authority.tenant_id,
      });
      if (opened.state !== 'ready') {
        printError(new Error(getMessage('approvals.runtime_hold', language, {
          reason: opened.reasonCode, detail: opened.detailCode,
        })));
        process.exitCode = 1;
        return;
      }
      try {
        const now = new Date();
        let applied = 0;
        for (const request of opened.service.broker.list('pending')) {
          const rule = liveRuleFor(root, request, now);
          if (!rule) continue;
          const action = rule.decision === 'allow' ? 'allow' as const : 'deny' as const;
          const outcome = await opened.service.decideByRules(root, {
            requestId: request.id,
            action,
            idempotencyKey: `rules-engine:${request.id}:${action}`,
            reason: rule.reason,
          });
          applied += 1;
          print(getMessage('approvals.rules_applied', language, {
            code: shortCodeFor(request.id), id: request.id, action,
            ruleId: rule.id, result: outcome.kind,
          }));
        }
        if (applied === 0) print(getMessage('approvals.rules_apply_none', language));
      } finally {
        opened.service.close();
      }
    });

  bindGovernanceArgumentDescriptions(rules.command('disable <id>'), lang, {
    id: 'cli.governance.approvals.arg.rule_id',
  })
    .description(getMessage('approvals.rules_disable_desc', lang))
    .action((id: string) => mutateRule(id, 'disable'));
  bindGovernanceArgumentDescriptions(rules.command('enable <id>'), lang, {
    id: 'cli.governance.approvals.arg.rule_id',
  })
    .description(getMessage('approvals.rules_enable_desc', lang))
    .action((id: string) => mutateRule(id, 'enable'));
  bindGovernanceArgumentDescriptions(rules.command('remove <id>'), lang, {
    id: 'cli.governance.approvals.arg.rule_id',
  })
    .description(getMessage('approvals.rules_remove_desc', lang))
    .action((id: string) => mutateRule(id, 'remove'));
}
