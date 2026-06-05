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

/** Park a risky action for later approval; returns the approval id. */
export type ParkAction = (tool: string, args: Record<string, unknown>) => string;

export interface GatedDispatcherDeps {
  /** Underlying dispatcher that actually runs read-only tools (CLI bridge). */
  readonly inner: McpToolDispatcher;
  /** Persist a risky action and return its approval id. */
  readonly park: ParkAction;
  /** Optional language for the parked-action message (default 'en'). */
  readonly lang?: string;
}

/**
 * Wrap a dispatcher so risky tools are parked (not executed) and read-only tools
 * pass through. The single safety chokepoint for all three loop tool paths.
 */
export function makeGatedDispatcher(deps: GatedDispatcherDeps): McpToolDispatcher {
  const lang = deps.lang ?? 'en';
  return {
    async dispatch(name: string, args: Record<string, unknown>): Promise<string> {
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
