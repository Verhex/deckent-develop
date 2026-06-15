// tests/cli/init-next-steps.test.ts
// make-usable #1 — `deckent init` next-steps must SURFACE the autonomous + nervous
// opt-in capabilities (default OFF) so they are discoverable, not hidden.
import { describe, it, expect } from 'vitest';
import { formatNextSteps } from '../../src/cli/commands/init-wizard.js';

describe('formatNextSteps — automation discoverability (make-usable #1)', () => {
  it('surfaces the autonomous + nervous opt-in capabilities (EN)', () => {
    const s = formatNextSteps('en');
    expect(s).toMatch(/deckent autonomous enable/);
    expect(s).toMatch(/deckent nervous enable/);
  });
  it('surfaces them in Turkish too', () => {
    const s = formatNextSteps('tr');
    expect(s).toMatch(/deckent autonomous enable/);
    expect(s).toMatch(/deckent nervous enable/);
  });
});
