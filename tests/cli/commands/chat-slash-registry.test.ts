// ═══ chat-slash-registry — `/do` command registration (452-002) ════════════
//
// REPL-DO-SLASH-WIRE: `/do <goal>` is a META-command — it carries no
// `agenticTool`, so resolveSlash falls through to { action: 'none' } and the
// dedicated repl/app.tsx handleSubmit branch (runReplDoSlash) owns it, exactly
// like /model, /cd and /term. These tests pin that registration contract
// (catalog membership, no-dispatch, no collision with /doctor|/directives,
// Tab-completion + /help visibility) without touching the Ink surface.

import { describe, it, expect } from 'vitest';
import {
  buildSlashRegistry,
  resolveSlash,
  slashCompleter,
  renderHelp,
} from '../../../src/cli/commands/chat-slash-registry.js';

describe('/do slash command registration (452-002)', () => {
  const registry = buildSlashRegistry();

  it('appears in the catalog with a description and NO agenticTool (meta-command)', () => {
    const entry = registry.find((c) => c.name === '/do');
    expect(entry).toBeDefined();
    expect(entry?.desc.length).toBeGreaterThan(0);
    expect(entry?.agenticTool).toBeUndefined();
  });

  it('resolveSlash returns { action: none } so the app.tsx branch owns /do', () => {
    expect(resolveSlash('/do add a health endpoint', registry)).toEqual({ action: 'none' });
    expect(resolveSlash('/do', registry)).toEqual({ action: 'none' });
  });

  it('does NOT shadow /doctor (a /do-prefixed dispatch command still resolves)', () => {
    expect(resolveSlash('/doctor', registry)).toEqual({
      action: 'agentic',
      tool: 'deckent_doctor',
      args: { root: '.' },
    });
  });

  it('does NOT shadow /directives (its own structured handler still runs)', () => {
    expect(resolveSlash('/directives', registry)).toEqual({ action: 'show-directives' });
  });

  it('slashCompleter surfaces /do for the /do and /d prefixes', () => {
    expect(slashCompleter('/do')[0]).toContain('/do');
    expect(slashCompleter('/d')[0]).toContain('/do');
  });

  it('renderHelp lists the /do command line', () => {
    const help = renderHelp(registry);
    expect(help).toContain('/do');
    expect(help).toContain('Bir hedefi planla ve çalıştır');
  });
});
