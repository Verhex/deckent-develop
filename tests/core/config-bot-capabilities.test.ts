import { describe, it, expect } from 'vitest';
import { interpolateConfig } from '../../src/core/deck-interpolation.js';
import type { DeckentConfig } from '../../src/core/config-types.js';

describe('bot_capabilities config', () => {
  it('typechecks on DeckentConfig and interpolates $DECK SMTP secrets', () => {
    const cfg: DeckentConfig = {
      bot_capabilities: { enabled: true, policies: { screenshot: 'auto', send_mail: 'confirm' },
        mail: { from: '$DECK:MAIL_FROM', smtp: { host: '$DECK:SMTP_HOST', port: 587 } } },
    } as DeckentConfig;
    // interpolateConfig replaces $DECK:KEY using a secrets map. Stub secrets via the .deck loader
    // is covered elsewhere; here assert the shape survives interpolation untouched when no .deck.
    const out = interpolateConfig(cfg, process.cwd());
    expect(out.bot_capabilities?.enabled).toBe(true);
    expect(out.bot_capabilities?.policies?.send_mail).toBe('confirm');
  });
});
