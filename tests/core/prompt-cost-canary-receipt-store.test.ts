import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  derivePromptCostCanaryReceiptScope,
  discoverPromptCostCanaryReceipts,
  parsePromptCostCanaryReceipt,
  PromptCostCanaryReceiptStore,
  publishPromptCostCanaryReceipt,
  readPromptCostCanaryReceipt,
  serializePromptCostCanaryReceipt,
} from '../../src/core/prompt-cost-canary-receipt-store.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'prompt-cost-canary-'));
  roots.push(value);
  return value;
}

const decision = {
  comparisonId: 'canary-42',
  outcome: 'keep-project-documents',
  baseline: { projectRelativePath: 'evidence/baseline.json', inputTokens: 8100, costMicrousd: 9440 },
  candidate: { projectRelativePath: 'evidence/candidate.json', inputTokens: 6200, costMicrousd: 7200 },
  reasons: ['candidate-cost-lower', 'quality-threshold-met'],
} as const;

function input(projectRoot: string, publishedAt = '2026-08-24T12:00:00.000Z') {
  return { projectRoot, environmentId: 'production/eu', tenantId: 'tenant-alpha', decision, publishedAt } as const;
}

describe('immutable prompt-cost canary receipt store', () => {
  it('creates canonical private bytes, verifies replay, and replays in a fresh facade', () => {
    const projectRoot = root();
    const first = publishPromptCostCanaryReceipt(input(projectRoot));
    const replay = publishPromptCostCanaryReceipt(input(projectRoot));
    expect(first.state).toBe('created');
    expect(replay).toEqual({ ...first, state: 'existing-identical' });
    const path = join(projectRoot, ...first.projectRelativeReceiptPath.split('/'));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(parsePromptCostCanaryReceipt(readFileSync(path))).toEqual(first.receipt);
    expect(serializePromptCostCanaryReceipt(first.receipt)).toEqual(readFileSync(path));
    const restarted = new PromptCostCanaryReceiptStore({ projectRoot, environmentId: 'production/eu', tenantId: 'tenant-alpha' });
    expect(restarted.read({ receiptId: first.receipt.receiptId, fresh: true })).toEqual(first.receipt);
  });

  it('uses opaque tenant/environment scope and isolates reads', () => {
    const projectRoot = root();
    const published = publishPromptCostCanaryReceipt(input(projectRoot));
    expect(published.receipt.scope).toEqual(derivePromptCostCanaryReceiptScope(input(projectRoot)));
    expect(JSON.stringify(published.receipt.scope)).not.toContain('tenant-alpha');
    expect(() => readPromptCostCanaryReceipt({
      projectRoot, environmentId: 'production/eu', tenantId: 'tenant-beta', receiptId: published.receipt.receiptId,
    })).toThrowError(expect.objectContaining({ state: 'HOLD', code: 'RECEIPT_NOT_FOUND' }));
  });

  it('rejects invalid decisions and non-canonical or conflicting durable bytes', () => {
    const projectRoot = root();
    expect(() => publishPromptCostCanaryReceipt({ ...input(projectRoot), decision: {
      comparisonId: 'escape', artifact: { projectRelativePath: '../secret' },
    } })).toThrowError(expect.objectContaining({ code: 'PATH_ESCAPE' }));
    const published = publishPromptCostCanaryReceipt(input(projectRoot));
    const path = join(projectRoot, ...published.projectRelativeReceiptPath.split('/'));
    const bytes = readFileSync(path, 'utf8');
    expect(() => parsePromptCostCanaryReceipt(`${bytes}\n`)).toThrowError(expect.objectContaining({ state: 'HOLD' }));
    writeFileSync(path, '{}'); chmodSync(path, 0o600);
    expect(() => publishPromptCostCanaryReceipt(input(projectRoot)))
      .toThrowError(expect.objectContaining({ state: 'HOLD', code: 'RECEIPT_COLLISION' }));
  });

  it.skipIf(process.platform === 'win32')('defends store links, permissions, and bounded discovery', () => {
    const linked = root();
    mkdirSync(join(linked, '.deckent'), { mode: 0o700 });
    symlinkSync(linked, join(linked, '.deckent', 'prompt-cost-canary'));
    expect(() => publishPromptCostCanaryReceipt(input(linked)))
      .toThrowError(expect.objectContaining({ code: 'UNSAFE_LINK' }));

    const permissive = root();
    mkdirSync(join(permissive, '.deckent'), { mode: 0o777 });
    chmodSync(join(permissive, '.deckent'), 0o777);
    expect(() => publishPromptCostCanaryReceipt(input(permissive)))
      .toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }));

    const bounded = root();
    publishPromptCostCanaryReceipt(input(bounded));
    publishPromptCostCanaryReceipt(input(bounded, '2026-08-24T12:00:01.000Z'));
    expect(discoverPromptCostCanaryReceipts({
      projectRoot: bounded, environmentId: 'production/eu', tenantId: 'tenant-alpha', maxEntries: 2,
    })).toHaveLength(2);
    expect(() => discoverPromptCostCanaryReceipts({
      projectRoot: bounded, environmentId: 'production/eu', tenantId: 'tenant-alpha', maxEntries: 1,
    })).toThrowError(expect.objectContaining({ code: 'DISCOVERY_LIMIT_EXCEEDED' }));
  });
});
