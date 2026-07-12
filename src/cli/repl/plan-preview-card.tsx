// ═══ PlanPreviewCard — native RunProposal preview+approval card (TERM-FLOW- ═
//     UNIFY Sprint-3 dilim, 425-001) ══════════════════════════════════════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md ("Net Öneri"): renders
// the AWAITING_APPROVAL stage of the host-owned RunFlow
// (run-flow-controller.ts, core/run-flow-contract.ts) — a REAL Brain-produced
// PlanPreview (task summaries + content-addressed planDigest + gate/policy
// result), not a generic tool-confirm. Approve/reject here IS the actual
// commit point (drives RunFlowController.approve()/reject(), which
// self-derives revision/planDigest off the live preview — see
// run-flow-controller.ts); `deckent_propose_run` itself is 'silent' tier in
// native-tool-registry.ts precisely because THIS card is the real gate, not
// the AgentSession's generic per-tool confirm.
//
// Copies approval-card.tsx's structure verbatim per this task's instructions
// ("mevcut approval-kart desenlerini KOPYALA — APR-kartları emsal"): a pure
// key-mapper + pure rendering helpers (Ink-free, unit-testable —
// ink-testing-library is not a project devDependency, see
// approval-card.test.tsx) with a thin Ink component on top.
//
// i18n-first: string-free — every user-facing label arrives via the `labels`
// prop. `buildPlanPreviewCardLabels(lang)` below sources them from
// messages.ts's real en/tr `runFlow.planPreview.*` keys — the ready-made seam
// a future App-wiring call site (run.tsx, follow-up work — out of this task's
// write scope) passes straight into `<PlanPreviewCard labels={...} />`.

import { Box, Text, useInput } from 'ink';
import { useState, type ReactElement } from 'react';
import type { PlanPreview, RunFlowGateResult, RunFlowPolicyDecision } from '../../core/run-flow-contract.js';
import { getMessage } from '../helpers/messages.js';

// ─── Pure key mapper (framework-free — unit-testable without Ink) ──────────

export type PlanPreviewCardAction = 'approve' | 'reject' | 'details';

/** Map a raw `useInput` keypress to a card action. Case-insensitive; any other
 *  key is a no-op (returns null) — mirrors approval-card.tsx's mapApprovalKey. */
export function mapPlanPreviewKey(input: string): PlanPreviewCardAction | null {
  switch (input.toLowerCase()) {
    case 'y': return 'approve';
    case 'n': return 'reject';
    case 'd': return 'details';
    default: return null;
  }
}

// ─── Pure rendering helpers (framework-free — unit-testable without Ink) ───

const GATE_COLORS: Record<RunFlowGateResult, string> = {
  pass: '#4DB8A4',
  fail: '#E0524D',
  skipped: '#6B7280',
};

const POLICY_COLORS: Record<RunFlowPolicyDecision, string> = {
  allow: '#4DB8A4',
  deny: '#E0524D',
  'needs-approval': '#C4A855',
};

const DIGEST_SHORT_LEN = 12;

/** One-line task summary — 1-indexed for display. */
export function formatTaskSummaryLine(index: number, task: { title: string; summary: string }): string {
  return `${index + 1}. ${task.title} — ${task.summary}`;
}

/** Truncates a hex digest for the collapsed card (the full value is still
 *  visible in the expanded `d` details view via JSON.stringify(preview)). */
export function formatDigestShort(digest: string): string {
  return digest.length > DIGEST_SHORT_LEN ? `${digest.slice(0, DIGEST_SHORT_LEN)}…` : digest;
}

// ─── Labels (i18n-first — string-free component; caller injects) ───────────

export interface PlanPreviewCardLabels {
  heading: string;
  digestLabel: string;
  gateLabels: Record<RunFlowGateResult, string>;
  policyLabels: Record<RunFlowPolicyDecision, string>;
  hint: string;
  detailsHeading: string;
  noTasks: string;
}

/** Builds real en/tr labels from messages.ts's `runFlow.planPreview.*` keys. */
export function buildPlanPreviewCardLabels(lang: string): PlanPreviewCardLabels {
  return {
    heading: getMessage('runFlow.planPreview.heading', lang),
    digestLabel: getMessage('runFlow.planPreview.digestLabel', lang),
    gateLabels: {
      pass: getMessage('runFlow.planPreview.gate.pass', lang),
      fail: getMessage('runFlow.planPreview.gate.fail', lang),
      skipped: getMessage('runFlow.planPreview.gate.skipped', lang),
    },
    policyLabels: {
      allow: getMessage('runFlow.planPreview.policy.allow', lang),
      deny: getMessage('runFlow.planPreview.policy.deny', lang),
      'needs-approval': getMessage('runFlow.planPreview.policy.needsApproval', lang),
    },
    hint: getMessage('runFlow.planPreview.hint', lang),
    detailsHeading: getMessage('runFlow.planPreview.detailsHeading', lang),
    noTasks: getMessage('runFlow.planPreview.noTasks', lang),
  };
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface PlanPreviewCardProps {
  /** null renders nothing — mirrors ApprovalCard's `head === null` behavior. */
  preview: PlanPreview | null;
  labels: PlanPreviewCardLabels;
  onApprove: (preview: PlanPreview) => void;
  onReject: (preview: PlanPreview) => void;
  /** Stdin-ownership mutex gate (mirrors ApprovalCardProps.isActive) — lets the
   *  caller defer to a higher-priority stdin consumer. Optional, defaults true. */
  isActive?: boolean;
}

// ─── PlanPreviewCard ─────────────────────────────────────────────────────────

export function PlanPreviewCard(props: PlanPreviewCardProps): ReactElement | null {
  const { preview, labels, onApprove, onReject, isActive: mutexActive = true } = props;
  const [expanded, setExpanded] = useState(false);

  useInput((input) => {
    if (!preview) return;
    switch (mapPlanPreviewKey(input)) {
      case 'approve':
        onApprove(preview);
        setExpanded(false);
        return;
      case 'reject':
        onReject(preview);
        setExpanded(false);
        return;
      case 'details':
        setExpanded((e) => !e);
        return;
      default:
        return;
    }
  }, { isActive: preview !== null && mutexActive });

  if (!preview) return null;

  const gateColor = GATE_COLORS[preview.gateResult];
  const policyColor = POLICY_COLORS[preview.policyDecision];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={gateColor} paddingX={1}>
      <Box>
        <Text bold>{labels.heading}</Text>
      </Box>
      {preview.taskSummaries.length === 0 ? (
        <Text dimColor>{labels.noTasks}</Text>
      ) : (
        preview.taskSummaries.map((t, i) => (
          <Text key={`${i}-${t.title}`}>{formatTaskSummaryLine(i, t)}</Text>
        ))
      )}
      <Box>
        <Text color={gateColor} bold>{labels.gateLabels[preview.gateResult]}</Text>
        <Text>{'  '}</Text>
        <Text color={policyColor} bold>{labels.policyLabels[preview.policyDecision]}</Text>
      </Box>
      <Text dimColor>{`${labels.digestLabel} ${formatDigestShort(preview.planDigest)}`}</Text>
      {expanded && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{labels.detailsHeading}</Text>
          <Text>{JSON.stringify(preview, null, 2)}</Text>
        </Box>
      )}
      <Text dimColor>{labels.hint}</Text>
    </Box>
  );
}
