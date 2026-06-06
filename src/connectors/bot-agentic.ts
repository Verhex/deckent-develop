/**
 * BOT-003 slice 2 — bot agentic safety core (§4G).
 *
 * Slice 2 swaps the chat bridge to a tool_use-capable provider so the model can
 * drive actions. But runChatNativeLoop does NOT confirm-gate model-driven
 * tool_use (chat-native.ts:671 dispatches directly), and all three tool paths
 * (model tool_use / slash / agenticDispatch) funnel through dispatcher.dispatch.
 * So the dispatcher is the single safety chokepoint:
 *
 *   - read-only tools  → execute immediately (grounded answers)
 *   - risky tools      → PARK an approval, return an informed NOT-EXECUTED result
 *                        ("approve <id>"), and run nothing. The user approves
 *                        from their phone (BOT-002), which executes it (slice 2b).
 *
 * Tool surface is the CLI bridge (sprint ops) — deliberately NOT raw shell /
 * file-write: bash over Telegram is RCE even for the owner (compromised account,
 * fat-finger), even when gated. The bot system prompt advertises ONLY these.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpToolDispatcher } from '../cli/commands/chat-native.js';

/**
 * Risky tools require human approval before executing. Everything not explicitly
 * read-only is risky (fail-safe default) — an unknown/new tool is never
 * auto-executed over a messaging channel.
 */
const READ_ONLY_BOT_TOOLS: ReadonlySet<string> = new Set([
  'deckent_status',
  'deckent_history',
  'deckent_retro',
  'deckent_doctor',
  'deckent_models',
  'deckent_analyze_project',
  'deckent_review',
  'deckent_explain',
  'deckent_agent_list',
  'deckent_skill_list',
  'deckent_feature_query',
  'deckent_memory_query',
]);

/** True when a tool changes state / is destructive → must be approval-gated. */
export function isRiskyBotTool(name: string): boolean {
  return !READ_ONLY_BOT_TOOLS.has(name);
}

/**
 * True when a real checkpoint is awaiting human approval right now — i.e. a
 * `.deckent/checkpoints/checkpoint-*.json` with `status: "pending"`. Mirrors the
 * checkpoint CLI's storage contract (cli/commands/checkpoint.ts) without
 * importing it (keeps connectors independent of cli/commands).
 *
 * Sprint 238 İŞ3: the agentic bot would PARK a model-initiated `deckent_checkpoint`
 * call as "🔐 APPROVAL REQUIRED", which the user read as a real pending checkpoint
 * and panicked over — even though nothing was pending and the sprint was never
 * blocked ([[project_spurious_bot_checkpoint_notify]]). This guard lets the
 * dispatcher answer benignly when there is genuinely nothing to approve.
 */
export function hasRealPendingCheckpoint(root: string): boolean {
  const dir = join(root, '.deckent', 'checkpoints');
  if (!existsSync(dir)) return false;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.startsWith('checkpoint-') || !f.endsWith('.json')) continue;
      try {
        const cp = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as { status?: string };
        if (cp.status === 'pending') return true;
      } catch { /* skip malformed checkpoint file */ }
    }
  } catch { /* unreadable dir → treat as nothing pending */ }
  return false;
}

/** Park a risky action for later approval; returns the approval id. */
export type ParkAction = (tool: string, args: Record<string, unknown>) => string;

export interface GatedDispatcherDeps {
  /** Underlying dispatcher that actually runs read-only tools (CLI bridge). */
  readonly inner: McpToolDispatcher;
  /** Persist a risky action and return its approval id. */
  readonly park: ParkAction;
  /** Optional language for the parked-action message (default 'en'). */
  readonly lang?: string;
  /**
   * Optional probe for a real pending checkpoint. When provided and it returns
   * false, a model-initiated `deckent_checkpoint` call is answered benignly
   * instead of parked — killing the spurious "checkpoint awaiting approval"
   * alarm (Sprint 238 İŞ3). Omitted → legacy behavior (checkpoint is parked).
   */
  readonly hasPendingCheckpoint?: () => boolean;
}

/**
 * Wrap a dispatcher so risky tools are parked (not executed) and read-only tools
 * pass through. The single safety chokepoint for all three loop tool paths.
 */
export function makeGatedDispatcher(deps: GatedDispatcherDeps): McpToolDispatcher {
  const lang = deps.lang ?? 'en';
  return {
    async dispatch(name: string, args: Record<string, unknown>): Promise<string> {
      // Sprint 238 İŞ3: a model-initiated `deckent_checkpoint` with NOTHING
      // pending is a no-op — parking it as "approval required" produces a false
      // "checkpoint awaiting approval" alarm (the sprint is not blocked). Answer
      // benignly when there is no real pending checkpoint; a genuine pending
      // checkpoint still goes through the gate below.
      if (
        name === 'deckent_checkpoint' &&
        deps.hasPendingCheckpoint &&
        !deps.hasPendingCheckpoint()
      ) {
        return noPendingCheckpointMessage(lang);
      }
      if (isRiskyBotTool(name)) {
        const id = deps.park(name, args);
        return parkedActionMessage(id, name, args, lang);
      }
      try {
        return await deps.inner.dispatch(name, args);
      } catch (err) {
        // Surface as a tagged result so the loop continues (model reports it).
        return `[mcp-error] ${name}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

/**
 * Load-bearing tool_result for a parked action: it MUST state the action was NOT
 * executed and how to approve it, so the model relays that instead of claiming
 * success (the hollow-DONE failure mode, conversational form).
 */
function parkedActionMessage(
  id: string,
  tool: string,
  args: Record<string, unknown>,
  lang: string,
): string {
  const argStr = summarizeArgs(args);
  if (lang === 'tr') {
    return (
      `🔐 ONAY GEREKLİ — ÇALIŞTIRILMADI: ${tool}(${argStr}). ` +
      `Bu işlem insan onayı bekliyor; henüz hiçbir şey yapılmadı. ` +
      `Onaylamak için yaz: approve ${id} — reddetmek için: reject ${id}.`
    );
  }
  return (
    `🔐 APPROVAL REQUIRED — NOT EXECUTED: ${tool}(${argStr}). ` +
    `This action is awaiting human approval; nothing has run yet. ` +
    `To approve, reply: approve ${id} — to reject: reject ${id}.`
  );
}

/**
 * Benign tool_result for `deckent_checkpoint` when nothing is pending. States
 * plainly that the sprint is NOT blocked so the model relays "nothing to do"
 * rather than an alarming "approval required" (Sprint 238 İŞ3).
 */
function noPendingCheckpointMessage(lang: string): string {
  if (lang === 'tr') {
    return 'Şu an onay bekleyen bir checkpoint yok — sprint bloke değil, yapılacak bir şey yok.';
  }
  return 'No checkpoint is awaiting approval — the sprint is not blocked; nothing to do.';
}

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args ?? {});
  if (keys.length === 0) return '';
  return keys
    .map((k) => {
      const v = args[k];
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}: ${s.length > 120 ? s.slice(0, 117) + '…' : s}`;
    })
    .join(', ');
}

/**
 * Bot-specific agentic system prompt. Advertises ONLY the CLI sprint tools (no
 * shell/file surface) using the generic <deckent_tool>{name,args} directive that
 * chat-session parses into tool_use. Tells the model risky tools need approval
 * so it sets expectations honestly.
 */
export const DECKENT_BOT_SYSTEM_PROMPT = [
  'Sen deckent projesinin Telegram asistanısın — kullanıcının telefonundan',
  'projeyi sohbet ederek yönetmesini sağlarsın. Canlı veriye veya bir aksiyona',
  'ihtiyacın olduğunda ŞU formatta bir tool direktifi yay (başka bir şey ekleme):',
  '<deckent_tool>{"name":"<tool>","args":{...}}</deckent_tool>',
  '',
  'Salt-okunur tool\'lar (anında çalışır): deckent_status (sprint durumu),',
  'deckent_history, deckent_retro, deckent_doctor, deckent_models,',
  'deckent_analyze_project, deckent_review, deckent_explain, deckent_agent_list,',
  'deckent_skill_list, deckent_feature_query, deckent_memory_query{query}.',
  '',
  'Durum-değiştiren tool\'lar (insan ONAYI gerekir, sen çağırsan bile HEMEN',
  'çalışmaz): deckent_plan{directive}, deckent_kill, deckent_cleanup,',
  'deckent_recover, deckent_sync, deckent_checkpoint. Bunları çağırdığında sistem',
  'bir onay-kapısı açar; kullanıcı "approve <id>" yazana kadar HİÇBİR ŞEY yapılmaz.',
  'Asla "yaptım/başlattım" deme — onay istendiğini söyle.',
  '',
  'Aksiyon gerekmeyen sorulara normal metinle, kullanıcının dilinde cevap ver.',
].join('\n');
