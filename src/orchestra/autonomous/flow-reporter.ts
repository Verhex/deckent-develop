// src/orchestra/autonomous/flow-reporter.ts
// Component ④ — rich dual-channel flow emitter for the autonomous orchestration path.
// Channel 1 (print): human-readable terminal debug line per step (i18n label + icon).
// Channel 2 (audit): structured FlowStepRecord for AI operators (stable English keys,
// no emoji) — wired by the composition root to the ENT-3 audit hash-chain / event stream.
// Pure + injected → hermetic; both channels optional (a missing channel is a no-op).
import { getMessage } from '../../cli/helpers/messages.js';

export type FlowStep =
  | 'picked' | 'jit_detail' | 'spawned'
  | 'brain_verdict' | 'audit_verdict' | 'cross_verify'
  | 'done' | 'failed' | 'parked';

/** Machine record (channel 2). Keys are stable English — never localized, never emoji. */
export interface FlowStepRecord {
  step: FlowStep;
  entryId: string;
  detail: string;
  timestamp: string;
}

export interface FlowReporterDeps {
  /** Channel 1 — human terminal sink. Absent → no terminal output. */
  print?: (line: string) => void;
  /** Channel 2 — AI-consumable sink. Absent → no machine record. */
  audit?: (record: FlowStepRecord) => void;
  /** UI language for channel-1 labels (en/tr). Default 'en'. */
  lang?: string;
  /** Injected clock for hermetic tests. Default = real ISO timestamp. */
  now?: () => string;
}

export interface FlowReporter {
  step(step: FlowStep, entryId: string, detail?: string): void;
}

/** Terminal-only unicode markers (channel 1). Dashboard surfaces use lucide icons — this
 *  map is never rendered there; channel-2 records carry no icon. */
const ICONS: Record<FlowStep, string> = {
  picked: '▶', jit_detail: '✎', spawned: '⚙',
  brain_verdict: '🧠', audit_verdict: '🛡', cross_verify: '🔀',
  done: '✓', failed: '✗', parked: '⏸',
};

export function makeFlowReporter(deps: FlowReporterDeps = {}): FlowReporter {
  const lang = deps.lang ?? 'en';
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    step(step: FlowStep, entryId: string, detail = ''): void {
      const timestamp = now();
      if (deps.audit) deps.audit({ step, entryId, detail, timestamp });
      if (deps.print) {
        const label = getMessage(`autonomous.flow_${step}`, lang);
        deps.print(getMessage('autonomous.flow_line', lang, {
          icon: ICONS[step], label, entryId, detail,
        }));
      }
    },
  };
}
