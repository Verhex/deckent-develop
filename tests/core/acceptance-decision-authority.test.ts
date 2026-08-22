import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptanceConfirmationDigest, deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage } from '../../src/core/acceptance-confirmation-contract.js';
const broker = vi.hoisted(() => ({ read: vi.fn(), ref: vi.fn() }));
vi.mock('../../src/core/cross-verify-evidence-broker.js', () => ({ readCrossVerifyVerdictReceipt: broker.read,
  crossVerifyVerdictReceiptRef: broker.ref }));
import { readLlmAcceptanceDecisionBinding, verifyLlmAcceptanceDecision,
  writeLlmAcceptanceDecisionBindingFirstWriterWins } from '../../src/core/acceptance-decision-authority.js';
const roots: string[] = []; const hash = (s: string) => acceptanceConfirmationDigest(s);
const lineage: AcceptanceConfirmationLineage = { tenantId: 'tenant-a', projectId: 'project-a',
  taskId: '619-001-xverify', attemptId: 'attempt-a', generation: 1, sprintId: '619',
  evaluationDigest: hash('e'), resultDigest: hash('r'), policyDigest: hash('p'), sourceDigest: hash('s') };
const confirmationId = deriveAcceptanceConfirmationId(lineage);
const settlementRef = { schemaVersion: 1 as const, taskId: 'xverify-execution-task', backend: 'docker' as const,
  projectRootSha256: 'a'.repeat(64), attemptId: 'xverify-attempt' };
const receiptRef = `cross-verify-verdict:sha256:${'b'.repeat(64)}`;
const envelope = { verdictReceiptSha256: 'b'.repeat(64), receipt: { ...settlementRef, effectiveVerdict: 'CONFIRMED' } };
afterEach(() => { vi.clearAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('durable LLM acceptance decision authority', () => {
  it('indexes an exact FWW binding and verifies it after a restart-style fresh read', () => {
    const root = mkdtempSync(join(tmpdir(), 'llm-authority-')); roots.push(root);
    broker.read.mockReturnValue(envelope); broker.ref.mockReturnValue(receiptRef);
    const first = writeLlmAcceptanceDecisionBindingFirstWriterWins({ projectRoot: root, confirmationId,
      lineage, verdict: 'CONFIRMED', receiptRef, settlementRef });
    expect(readLlmAcceptanceDecisionBinding(root, confirmationId)).toEqual(first);
    expect(verifyLlmAcceptanceDecision(root, { confirmationId, lineage, verdict: 'CONFIRMED', authorityReceipt: receiptRef })).toBe(true);
    expect(broker.read).toHaveBeenCalledTimes(2);
  });
  it('fails closed for corruption, foreign lineage, mismatch, and replay substitution', () => {
    const root = mkdtempSync(join(tmpdir(), 'llm-authority-')); roots.push(root);
    broker.read.mockReturnValue(envelope); broker.ref.mockReturnValue(receiptRef);
    writeLlmAcceptanceDecisionBindingFirstWriterWins({ projectRoot: root, confirmationId,
      lineage, verdict: 'CONFIRMED', receiptRef, settlementRef });
    expect(verifyLlmAcceptanceDecision(root, { confirmationId, lineage: { ...lineage, tenantId: 'tenant-b' },
      verdict: 'CONFIRMED', authorityReceipt: receiptRef })).toBe(false);
    broker.read.mockReturnValue({ ...envelope, verdictReceiptSha256: 'c'.repeat(64) });
    expect(verifyLlmAcceptanceDecision(root, { confirmationId, lineage, verdict: 'CONFIRMED', authorityReceipt: receiptRef })).toBe(false);
    broker.read.mockReturnValue(envelope);
    expect(verifyLlmAcceptanceDecision(root, { confirmationId, lineage, verdict: 'CONFIRMED',
      authorityReceipt: `cross-verify-verdict:sha256:${'c'.repeat(64)}` })).toBe(false);
    broker.read.mockReturnValue({ ...envelope, receipt: { ...envelope.receipt, attemptId: 'replayed-attempt' } });
    expect(verifyLlmAcceptanceDecision(root, { confirmationId, lineage, verdict: 'CONFIRMED',
      authorityReceipt: receiptRef })).toBe(false);
    broker.read.mockReturnValue(envelope);
    expect(() => writeLlmAcceptanceDecisionBindingFirstWriterWins({ projectRoot: root, confirmationId,
      lineage, verdict: 'FAILED', receiptRef, settlementRef })).toThrow();
    const path = join(root, '.deckent', 'private', 'acceptance-decision-authority', `${confirmationId}.json`);
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { bindingSha256: string };
    writeFileSync(path, JSON.stringify({ ...parsed, bindingSha256: '0'.repeat(64) }));
    expect(verifyLlmAcceptanceDecision(root, { confirmationId, lineage, verdict: 'CONFIRMED', authorityReceipt: receiptRef })).toBe(false);
  });
});
