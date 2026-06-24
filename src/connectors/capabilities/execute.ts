import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CapabilityRegistry } from './registry.js';
import type { CapabilityContext, MediaAttachment, Tier, PolicyDecision } from './types.js';

export type MediaSink = (channelId: string, media: MediaAttachment) => Promise<void>;

interface AuditEntry { ts: number; chatKey: string; project: string; capId: string; tier: Tier; decision: PolicyDecision; status: 'ok' | 'error' }

async function audit(root: string, entry: AuditEntry): Promise<void> {
  try {
    const file = join(root, '.deckent', 'capability-audit.jsonl');
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify(entry) + '\n', 'utf-8');
  } catch { /* audit is best-effort, never fails the action */ }
}

export async function runCapability(
  registry: CapabilityRegistry, capId: string, rawArgs: Record<string, unknown>,
  ctx: CapabilityContext, channelId: string, sink: MediaSink, decision: PolicyDecision,
): Promise<string> {
  const cap = registry.get(capId);
  if (!cap) return `[capability-error] unknown capability: ${capId}`;
  const parsed = cap.paramsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return `[capability-error] ${capId}: invalid args (${parsed.error.issues.map((i) => i.message).join('; ')})`;
  }
  let status: 'ok' | 'error' = 'ok';
  try {
    const result = await cap.run(parsed.data, ctx);
    for (const m of result.media ?? []) {
      try { await sink(channelId, m); } catch { /* sink handles its own honest fallback */ }
    }
    return result.text ?? `[${capId}] done`;
  } catch (e) {
    status = 'error';
    return `[capability-error] ${capId}: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    await audit(ctx.project, { ts: ctx.now, chatKey: ctx.chatKey, project: ctx.project, capId, tier: cap.tier, decision, status });
  }
}
