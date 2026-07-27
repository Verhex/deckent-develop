import {
  resolveContainmentAuthority,
  validateContainmentAuthorityReceipt,
} from './containment-authority.mjs';
import { superviseContainedExecution } from './containment-supervisor.mjs';

function hold(code, details = {}) {
  return {
    state: 'HOLD',
    code,
    proofEligible: false,
    receiptAuthenticated: false,
    liveExecution: false,
    retain: details.retain !== false,
    ...details,
  };
}

// Native live-audit capability minting is deliberately not implemented yet.
// Until it exists, no plain object or injected callback can cross this gate.
function hasLiveEvidenceAuthority() {
  return false;
}

function authorityCandidate(input) {
  const plan = input.adapterPlan;
  if (!plan || typeof plan !== 'object' || typeof plan.adapterId !== 'string') return null;
  return {
    adapterId: plan.adapterId,
    boundaryClass: input.boundaryClass,
    adapterState: plan.decision === 'ADMITTED' ? 'AVAILABLE' : 'UNAVAILABLE',
    priority: Number.isSafeInteger(input.priority) ? input.priority : 0,
    facets: input.admissionFacets,
  };
}

/**
 * Read-only current-host probe. Capability presence never promotes execution;
 * callers receive a typed HOLD and zero candidate birth.
 */
export async function probeContainmentControlPlane(input = {}) {
  let adapterPlan;
  try {
    adapterPlan = typeof input.planAdapter === 'function'
      ? await input.planAdapter(input.adapterInput)
      : input.adapterPlan ?? null;
  } catch {
    adapterPlan = null;
  }
  return hold('E_CONTAINMENT_HOLD_PROBE_ONLY', {
    mode: 'probe',
    candidateBirth: 'NOT_BORN',
    retain: false,
    adapterPlan,
  });
}

/**
 * Compose an adapter plan with common authority and the trusted supervisor.
 * No adapter can self-promote its `proofEligible:false` plan to GO.
 */
export async function runContainmentControlPlane(input = {}) {
  if (input.mode !== 'enforce' || input.liveAuthorized !== true) {
    return probeContainmentControlPlane(input);
  }
  if (!hasLiveEvidenceAuthority(input.liveEvidenceAuthority)) {
    return hold('E_CONTAINMENT_HOLD_LIVE_EVIDENCE_AUTHORITY_REQUIRED', {
      candidateBirth: 'NOT_BORN',
      retain: Boolean(input.workspace),
    });
  }

  let adapterPlan;
  try {
    adapterPlan = typeof input.planAdapter === 'function'
      ? await input.planAdapter(input.adapterInput)
      : input.adapterPlan;
  } catch {
    return hold('E_CONTAINMENT_HOLD_ADAPTER_PLAN_FAILED');
  }
  if (adapterPlan?.decision !== 'ADMITTED'
    || adapterPlan.proofEligible !== false
    || typeof adapterPlan.adapterId !== 'string') {
    return hold(adapterPlan?.code ?? 'E_CONTAINMENT_HOLD_ADAPTER_PLAN_REQUIRED', {
      adapterPlan: adapterPlan ?? null,
    });
  }
  const candidate = authorityCandidate({
    ...input,
    adapterPlan,
  });
  const admission = resolveContainmentAuthority({
    mode: 'enforce',
    requestedAdapterId: adapterPlan.adapterId,
    candidates: candidate ? [candidate] : [],
  });
  if (admission.state !== 'ADMITTED') {
    return hold(admission.reasonCode, { admission, adapterPlan });
  }

  const supervise = input.supervise ?? superviseContainedExecution;
  let supervised;
  try {
    supervised = await supervise({
      ...input,
      admission,
      adapterPlan,
    });
  } catch {
    return hold('E_CONTAINMENT_HOLD_SUPERVISOR_FAILURE', {
      candidateBirth: 'UNKNOWN',
    });
  }
  if (!supervised || typeof supervised !== 'object') {
    return hold('E_CONTAINMENT_HOLD_SUPERVISOR_RESULT_MISSING', {
      candidateBirth: 'UNKNOWN',
    });
  }
  if (!supervised.receipt) {
    if (supervised.state === 'HOLD') {
      return {
        ...supervised,
        state: 'HOLD',
        code: supervised.code ?? 'E_CONTAINMENT_HOLD_RECEIPT_MISSING',
        liveExecution: supervised.candidateBirth !== 'NOT_BORN',
        retain: true,
      };
    }
    return hold('E_CONTAINMENT_HOLD_RECEIPT_MISSING', {
      candidateBirth: supervised.candidateBirth ?? 'UNKNOWN',
      retain: true,
    });
  }
  const structuralReceipt = validateContainmentAuthorityReceipt(supervised.receipt);
  if (!structuralReceipt.ok || supervised.receiptAuthenticated !== true) {
    return hold('E_CONTAINMENT_HOLD_RECEIPT_FORGED', {
      candidateBirth: supervised.candidateBirth ?? 'UNKNOWN',
      retain: true,
    });
  }
  if (supervised.finality?.status !== 'PROVEN'
    || supervised.finality.authenticated !== true
    || supervised.finality.terminationVerified !== true
    || supervised.finality.adapterIdentityVerified !== true) {
    return hold('E_CONTAINMENT_HOLD_FINALITY_UNKNOWN', {
      receipt: structuralReceipt.value,
      receiptAuthenticated: true,
      candidateBirth: supervised.candidateBirth ?? 'UNKNOWN',
      retain: true,
    });
  }
  if (supervised.state !== 'GO'
    || supervised.proofEligible !== true
    || supervised.proof?.state !== 'ELIGIBLE') {
    return {
      ...supervised,
      state: 'HOLD',
      code: supervised.code ?? 'E_CONTAINMENT_HOLD_PROOF_INELIGIBLE',
      liveExecution: true,
    };
  }
  return {
    ...supervised,
    state: 'GO',
    code: 'CONTAINMENT_GO',
    liveExecution: true,
    receipt: structuralReceipt.value,
  };
}
