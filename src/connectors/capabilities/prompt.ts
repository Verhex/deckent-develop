import type { CapabilityRegistry } from './registry.js';
import type { PolicyResolution } from './policy.js';

// Builds the system-prompt catalog snippet the LLM reads to learn which capabilities
// it may call. Only non-unavailable capabilities are advertised. Empty string → nothing
// advertised (master disabled) so the bot stays text/CLI-tools only.
export function describeCapabilities(registry: CapabilityRegistry, resolve: (id: string) => PolicyResolution, _lang: string): string {
  const lines = registry.list()
    .filter((c) => resolve(c.id) !== 'unavailable')
    .map((c) => `- ${c.id}(${schemaHint(c.id)}): tier=${c.tier}`);
  if (lines.length === 0) return '';
  return ['', 'Host capabilities you may call as tools (subject to user approval):', ...lines].join('\n');
}

function schemaHint(id: string): string {
  if (id === 'screenshot') return "display?: 'primary'|'all'";
  if (id === 'send_mail') return 'to, subject, body';
  return '';
}
