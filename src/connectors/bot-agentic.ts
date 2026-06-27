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
import { getMessage } from '../cli/helpers/messages.js';
import type { PolicyResolution } from './capabilities/policy.js';

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
  // Cost/usage/observability surface — read-only, fast, no state change. Mirrors the
  // MCP TOOL_CATALOG readOnly flag for these tools (src/mcp/tools/index.ts). Exposed so
  // the phone bot can answer "bugünkü maliyet / token kullanımı / KPI" from live data.
  'deckent_cost',
  'deckent_usage',
  'deckent_kpi',
  'deckent_help',
  'deckent_nervous_status',
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

/**
 * Capability gate injected into the dispatcher. Provides per-capability policy
 * resolution so capability tool calls are routed through the SAME single
 * chokepoint rather than a parallel path (one-chokepoint invariant).
 */
export interface CapabilityGate {
  /** True when `id` names a registered capability tool (e.g. 'screenshot'). */
  has(id: string): boolean;
  /** Resolve the policy decision for a capability tool. */
  resolve(id: string): PolicyResolution;
  /** Execute a capability that resolved to 'auto'. */
  runAuto(id: string, args: Record<string, unknown>): Promise<string>;
  /**
   * Optional: send a buttoned approval request message to the user. When
   * present and returns true the action id was successfully communicated via
   * a rich (button-carrying) message; the dispatcher then returns a short
   * acknowledgement instead of the legacy "type approve <id>" text.
   * Returns false (or rejects) → dispatcher falls back to the legacy message.
   */
  sendApproval?(id: string, capId: string, args: Record<string, unknown>): Promise<boolean>;
}

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
  /**
   * Optional capability gate. When provided and `capabilities.has(name)` is
   * true, the capability branch handles the call at the TOP of dispatch (before
   * the existing checkpoint-guard / risky-park / safe-exec logic) — preserving
   * the single-chokepoint invariant.
   */
  readonly capabilities?: CapabilityGate;
  /**
   * Optional: send a buttoned approval message for a risky deckent_* TOOL (not a
   * capability) — the tool-side analogue of `capabilities.sendApproval`. When
   * present and it returns true, the parked tool's approval was delivered as an
   * interactive (Approve/Reject button) message, so the dispatcher returns a short
   * ack instead of the legacy "type approve <id>" text. Returns false (or rejects)
   * → the dispatcher falls back to the legacy parked-action text. Omitted → legacy
   * text always (byte-for-byte unchanged). This is what makes group approvals
   * buttoned: risky deckent_* tools previously had NO button path, only capabilities did.
   */
  readonly sendToolApproval?: (
    id: string,
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
}

/**
 * Wrap a dispatcher so risky tools are parked (not executed) and read-only tools
 * pass through. The single safety chokepoint for all three loop tool paths.
 */
export function makeGatedDispatcher(deps: GatedDispatcherDeps): McpToolDispatcher {
  const lang = deps.lang ?? 'en';
  return {
    async dispatch(name: string, args: Record<string, unknown>): Promise<string> {
      // Capability branch — MUST come first to preserve the one-chokepoint
      // invariant: capability tool calls route through THIS dispatcher, not a
      // parallel path. Non-capability names fall through to the existing logic.
      if (deps.capabilities?.has(name)) {
        const decision = deps.capabilities.resolve(name);
        if (decision === 'unavailable') return getMessage('cap.gate.unavailable', lang, { id: name });
        if (decision === 'deny') return getMessage('cap.gate.denied', lang, { id: name });
        if (decision === 'confirm') {
          const id = deps.park(name, args);
          const sent = deps.capabilities.sendApproval
            ? await deps.capabilities.sendApproval(id, name, args).catch(() => false)
            : false;
          return sent ? approvalRequestedAck(name, lang) : parkedActionMessage(id, name, args, lang);
        }
        // decision === 'auto'
        return deps.capabilities.runAuto(name, args);
      }
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
        // Prefer a buttoned approval (same UX as capabilities) so the user taps
        // Approve/Reject instead of typing "approve <id>" — works in groups too.
        // sendToolApproval absent or failing → legacy parked text (unchanged).
        const sent = deps.sendToolApproval
          ? await deps.sendToolApproval(id, name, args).catch(() => false)
          : false;
        return sent ? toolApprovalRequestedAck(name, lang) : parkedActionMessage(id, name, args, lang);
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
 * Short acknowledgement returned when `sendApproval` successfully delivered a
 * buttoned approval request. The user already received the interactive message;
 * the model should relay that approval has been requested and await the decision.
 */
function approvalRequestedAck(capId: string, lang: string): string {
  return getMessage('cap.approval.ack', lang, { cap: capId });
}

/**
 * Short ack returned when a risky deckent_* TOOL's approval was delivered as a
 * buttoned message (the user already has Approve/Reject buttons). The tool-side
 * analogue of `approvalRequestedAck`; the model relays that approval was requested
 * and awaits the decision rather than dumping the "type approve <id>" text.
 */
function toolApprovalRequestedAck(tool: string, lang: string): string {
  return getMessage('tool.approval.ack', lang, { tool });
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

export function summarizeArgs(args: Record<string, unknown>): string {
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
  'deckent_skill_list, deckent_feature_query, deckent_memory_query{query},',
  'deckent_cost (bugünkü harcama), deckent_usage (token/limit kullanımı),',
  'deckent_kpi (KPI skor kartı), deckent_help, deckent_nervous_status.',
  '',
  'Durum-değiştiren tool\'lar (insan ONAYI gerekir, sen çağırsan bile HEMEN',
  'çalışmaz): deckent_plan{directive}, deckent_set_directives{directive},',
  'deckent_start, deckent_run, deckent_kill, deckent_cleanup, deckent_recover,',
  'deckent_sync, deckent_config, deckent_autonomous, deckent_process,',
  'deckent_checkpoint. Bunları çağırdığında sistem bir onay-kapısı açar; kullanıcı',
  'mesajdaki Onayla/Reddet butonuna basana (ya da "approve <id>" yazana) kadar',
  'HİÇBİR ŞEY yapılmaz. Asla "yaptım/başlattım" deme — onay istendiğini söyle.',
  '',
  'Aksiyon gerekmeyen sorulara normal metinle, kullanıcının dilinde cevap ver.',
].join('\n');

/**
 * Read a compact project-context snapshot to GROUND the bot's conversational
 * answers. Source: `.brain/exports/summary.md` — the curated, auto-generated
 * context (active ADRs, recent sprint learnings, active debt). Bounded so a large
 * summary never blows the system prompt. Absent/unreadable → a short static line.
 */
function readProjectContextSnapshot(root: string): string {
  const summaryPath = join(root, '.brain', 'exports', 'summary.md');
  try {
    if (existsSync(summaryPath)) {
      const raw = readFileSync(summaryPath, 'utf-8').trim();
      const MAX = 6000; // keep the system prompt bounded (~1.5K tokens of context)
      return raw.length > MAX ? raw.slice(0, MAX) + '\n…(kısaltıldı — tamamı için deckent_memory_query)' : raw;
    }
  } catch {
    // unreadable summary → fall through to the static line (never break the bot)
  }
  return "deckent: AI agent orchestration CLI (Brain/Worker/Auditor, sprint-tabanlı). Canlı durum için deckent_status tool'unu çağır.";
}

/**
 * Build the bot's conversational system prompt: the tool directives + LIVE project
 * grounding (summary.md) + a "be a genuinely helpful, accurate deckent-expert"
 * instruction. Grounding the persistent session in the project context is the fix
 * for hollow/generic answers — the model otherwise sees only the raw question with
 * ZERO project knowledge (the root cause of poor bot chat quality). Volatile state
 * (sprint progress) stays tool-driven (deckent_status), never baked into the prompt.
 */
export function buildBotSystemPrompt(root?: string): string {
  if (!root) return DECKENT_BOT_SYSTEM_PROMPT;
  return [
    DECKENT_BOT_SYSTEM_PROMPT,
    '',
    "Sen deckent'i DERİNLEMESINE bilen, yardımsever ve DOĞRU bir asistansın.",
    'Aşağıdaki canlı proje bağlamını kullanarak somut, doğru ve kısa-öz cevap ver;',
    'bilmediğini UYDURMA — gerekirse bir salt-okunur tool çağırıp canlı veriye bak.',
    "Kullanıcının dilinde (Türkçe/İngilizce) yanıtla. Vague/genel laf etme; deckent'e özgü konuş.",
    '',
    '## Proje Bağlamı (deckent — canlı özet; cevaplarını BUNA dayandır)',
    readProjectContextSnapshot(root),
  ].join('\n');
}
