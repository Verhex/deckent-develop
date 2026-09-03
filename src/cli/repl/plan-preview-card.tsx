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
import { useInkPalette } from './ink-palette-context.js';
import type { InkRole } from './ink-palette.js';
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

// TERMINAL-READABILITY-001 — gate/policy outcomes as palette ROLES: the label
// word carries the meaning, the (host-theme-mapped) color supplements it.
const GATE_ROLES: Record<RunFlowGateResult, InkRole> = {
  pass: 'success',
  fail: 'error',
  skipped: 'muted',
};

const POLICY_ROLES: Record<RunFlowPolicyDecision, InkRole> = {
  allow: 'success',
  deny: 'error',
  'needs-approval': 'warning',
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
  /**
   * Dogfood-449 B1 / 452-003 — scope-gate mirror verdict (child's pre-spawn
   * SCOPE gate, distinct from `gateLabels.fail`'s prompt-gate). Optional,
   * mirroring `PlanPreview.scopeGateResult` itself being optional/additive
   * (run-flow-contract.ts) — `buildPlanPreviewCardLabels` below always sets
   * it; a caller supplying a labels object built another way (e.g. a static
   * pre-wiring fallback) may omit it, in which case `formatScopeGateLines`
   * still renders the real gate message, just without a verdict header.
   */
  scopeGateFailLabel?: string;
  /** Shown when the gate passed only because --force-scope acknowledged a suspect. Optional — see scopeGateFailLabel. */
  scopeGateOverriddenLabel?: string;
  topologyPassLabel: string;
  topologyBlockLabel: string;
  topologyConcurrencyLabel: string;
  topologyCollisionsLabel: string;
  topologySyntheticEdgesLabel: string;
  topologyWavesLabel: string;
  topologyFindingsLabel: string;
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
    scopeGateFailLabel: getMessage('runFlow.planPreview.scopeGate.fail', lang),
    scopeGateOverriddenLabel: getMessage('runFlow.planPreview.scopeGate.overridden', lang),
    topologyPassLabel: getMessage('runFlow.planPreview.topology.pass', lang),
    topologyBlockLabel: getMessage('runFlow.planPreview.topology.block', lang),
    topologyConcurrencyLabel: getMessage('runFlow.planPreview.topology.concurrency', lang),
    topologyCollisionsLabel: getMessage('runFlow.planPreview.topology.collisions', lang),
    topologySyntheticEdgesLabel: getMessage('runFlow.planPreview.topology.syntheticEdges', lang),
    topologyWavesLabel: getMessage('runFlow.planPreview.topology.waves', lang),
    topologyFindingsLabel: getMessage('runFlow.planPreview.topology.findings', lang),
  };
}

// ─── Scope-gate rendering (Dogfood-449 B1 / 452-003) ───────────────────────

/**
 * Renders the scope-gate mirror as verbatim lines — the SAME function the
 * REPL card and the CLI (`formatRunFlowDoPreview`, do.ts) both call, so the
 * two surfaces can never diverge on this verdict (born-698a/449 precedent:
 * a silent CLI/REPL mismatch here is exactly how a dead run stayed hidden).
 * 'fail': a verdict header + the real gate message split into lines, never
 * re-worded — the gate's own message is the source of truth. Else, when the
 * gate only passed because --force-scope acknowledged a suspect: a one-line
 * notice. Otherwise (pass/skipped, not overridden): no lines.
 */
export function formatScopeGateLines(
  preview: Pick<PlanPreview, 'scopeGateResult' | 'scopeGateMessage' | 'scopeGateOverridden'>,
  labels: Pick<PlanPreviewCardLabels, 'scopeGateFailLabel' | 'scopeGateOverriddenLabel'>,
): string[] {
  if (preview.scopeGateResult === 'fail') {
    const lines: string[] = [];
    if (labels.scopeGateFailLabel) lines.push(labels.scopeGateFailLabel);
    if (preview.scopeGateMessage) {
      for (const line of preview.scopeGateMessage.split('\n')) lines.push(`  ! ${line}`);
    }
    return lines;
  }
  if (preview.scopeGateOverridden && labels.scopeGateOverriddenLabel) return [labels.scopeGateOverriddenLabel];
  return [];
}

export function formatTopologyLines(
  preview: Pick<PlanPreview, 'topology' | 'topologyGateResult'>,
  labels: Pick<
    PlanPreviewCardLabels,
    | 'topologyPassLabel'
    | 'topologyBlockLabel'
    | 'topologyConcurrencyLabel'
    | 'topologyCollisionsLabel'
    | 'topologySyntheticEdgesLabel'
    | 'topologyWavesLabel'
    | 'topologyFindingsLabel'
  >,
): string[] {
  const topology = preview.topology;
  if (!topology) return [];
  const lines = [
    preview.topologyGateResult === 'fail' ? labels.topologyBlockLabel : labels.topologyPassLabel,
    `  ${labels.topologyConcurrencyLabel} ${topology.configuredMaxWorkers}/${topology.effectiveConcurrency}`,
  ];
  if (topology.collisions.length > 0) {
    lines.push(`  ${labels.topologyCollisionsLabel}`);
    for (const collision of topology.collisions) {
      lines.push(`    ${collision.path} [${collision.writerSlots.join(',')}]`);
    }
  }
  if (topology.syntheticEdges.length > 0) {
    lines.push(`  ${labels.topologySyntheticEdgesLabel}`);
    for (const edge of topology.syntheticEdges) {
      lines.push(`    ${edge.from} -> ${edge.to} [${edge.paths?.join(',') ?? ''}]`);
    }
  }
  lines.push(
    `  ${labels.topologyWavesLabel} ${topology.waves.map(wave => `${wave.wave}:[${wave.slots.join(',')}]`).join(' ')}`,
  );
  if (topology.findings.length > 0) {
    lines.push(`  ${labels.topologyFindingsLabel}`);
    for (const finding of topology.findings) {
      lines.push(
        `    ${finding.code} [${finding.slots.join(',')}]`
        + (finding.path ? ` ${finding.path}` : '')
        + (finding.ref ? ` ${finding.ref}` : ''),
      );
    }
  }
  return lines;
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

  const palette = useInkPalette();
  if (!preview) return null;

  const gateStyle = palette[GATE_ROLES[preview.gateResult]];
  const policyStyle = palette[POLICY_ROLES[preview.policyDecision]];
  const failStyle = palette[GATE_ROLES.fail];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={gateStyle.color} paddingX={1}>
      <Box>
        <Text bold>{labels.heading}</Text>
      </Box>
      {preview.taskSummaries.length === 0 ? (
        <Text {...palette.muted}>{labels.noTasks}</Text>
      ) : (
        preview.taskSummaries.map((t, i) => (
          <Text key={`${i}-${t.title}`}>{formatTaskSummaryLine(i, t)}</Text>
        ))
      )}
      <Box>
        <Text {...gateStyle} bold>{labels.gateLabels[preview.gateResult]}</Text>
        <Text>{'  '}</Text>
        <Text {...policyStyle} bold>{labels.policyLabels[preview.policyDecision]}</Text>
      </Box>
      {formatScopeGateLines(preview, labels).map((line, i) => (
        <Text key={`sg-${i}`} {...(preview.scopeGateResult === 'fail' ? failStyle : {})}>{line}</Text>
      ))}
      {formatTopologyLines(preview, labels).map((line, i) => (
        <Text key={`tg-${i}`} {...(preview.topologyGateResult === 'fail' ? failStyle : {})}>{line}</Text>
      ))}
      <Text {...palette.muted}>{`${labels.digestLabel} ${formatDigestShort(preview.planDigest)}`}</Text>
      {expanded && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{labels.detailsHeading}</Text>
          <Text>{JSON.stringify(preview, null, 2)}</Text>
        </Box>
      )}
      <Text {...palette.muted}>{labels.hint}</Text>
    </Box>
  );
}
