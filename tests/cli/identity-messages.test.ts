// tests/cli/identity-messages.test.ts
import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';

describe('identity/rbac i18n keys', () => {
  it('rbac.unauthorized interpolates permission (EN + TR)', () => {
    expect(getMessage('rbac.unauthorized', 'en', { permission: 'order:write' })).toContain('order:write');
    expect(getMessage('rbac.unauthorized', 'tr', { permission: 'order:write' })).toContain('order:write');
    expect(getMessage('rbac.unauthorized', 'en')).not.toBe('rbac.unauthorized'); // key resolves
  });
  it('identity.verify_prompt + binding_unconfigured resolve in both langs', () => {
    expect(getMessage('identity.verify_prompt', 'tr', { method: '/verify' })).not.toBe('identity.verify_prompt');
    expect(getMessage('identity.binding_unconfigured', 'en')).not.toBe('identity.binding_unconfigured');
  });
});
