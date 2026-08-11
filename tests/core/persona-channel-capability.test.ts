import { describe, it, expect } from 'vitest';
import {
  resolveSystemPromptChannelDisposition,
  type ProviderSystemPromptChannel,
} from '../../src/core/provider.js';

// Persona S1 (task 522-007): types + data only. Pins the pure descriptor →
// disposition mapping, including both owner D-H typed-HOLD cases ('replace'
// and 'unknown'), before any spawn call site consumes it.

describe('resolveSystemPromptChannelDisposition', () => {
  it('degrades when the descriptor is absent (D-D default)', () => {
    expect(resolveSystemPromptChannelDisposition(undefined)).toBe('degrade');
  });

  it('degrades when the descriptor explicitly declares unsupported', () => {
    const channel: ProviderSystemPromptChannel = {
      supported: false,
      semantics: 'append',
      verified: true,
    };
    expect(resolveSystemPromptChannelDisposition(channel)).toBe('degrade');
  });

  it('is eligible only for a verified append channel', () => {
    const channel: ProviderSystemPromptChannel = {
      supported: true,
      semantics: 'append',
      verified: true,
      maxBytes: 8192,
    };
    expect(resolveSystemPromptChannelDisposition(channel)).toBe('eligible');
  });

  it('is a HOLD candidate for a verified replace channel (D-H)', () => {
    const channel: ProviderSystemPromptChannel = {
      supported: true,
      semantics: 'replace',
      verified: true,
    };
    expect(resolveSystemPromptChannelDisposition(channel)).toBe('hold-candidate');
  });

  it('is a HOLD candidate for an unknown-semantics channel (D-H)', () => {
    const channel: ProviderSystemPromptChannel = {
      supported: true,
      semantics: 'unknown',
      verified: false,
    };
    expect(resolveSystemPromptChannelDisposition(channel)).toBe('hold-candidate');
  });

  it('is a HOLD candidate for an unverified append channel', () => {
    const channel: ProviderSystemPromptChannel = {
      supported: true,
      semantics: 'append',
      verified: false,
    };
    expect(resolveSystemPromptChannelDisposition(channel)).toBe('hold-candidate');
  });
});
