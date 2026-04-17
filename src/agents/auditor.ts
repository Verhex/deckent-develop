// ═══ Auditor ADR Compliance Integration ═════════════════════════════
// Thin integration layer that connects the authority-enforcer's ADR
// compliance checks to the auditor workflow.
//
// Sprint 143: Layer 4 Runtime Wire — ADR-006/008/010 enforcement
// Called by Brain during EVALUATE phase to check worker output.

export {
  enforceAdrCompliance,
  type AdrViolation,
  type AdrComplianceResult,
} from '../orchestra/authority-enforcer.js';
