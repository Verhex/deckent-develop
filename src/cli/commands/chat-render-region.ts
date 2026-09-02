// ═══ chat-render-region — sabit alt-prompt penceresi (Sprint 224 T-224-014) ═══
//
// claude-code hissi: input satırı altta SABİT `› ` prompt'unda durur, cevap/
// stream çıktısı bunun ÜSTÜNE akar, kullanıcının yazdığı (rl.line) KORUNUR.
//
// Mekanizma (ADR-010 — Node built-in readline + ANSI, yeni-dep YOK):
//   writeAbove(text): mevcut input bölgesini (wrap'lı satırlar dahil, born-540)
//   tam temizle (getCursorPos/moveCursor/cursorTo/clearScreenDown) →
//   çıktıyı bas → `rl.prompt(true)` ile prompt'u + korunan buffer'ı yeniden çiz.
//   Böylece akan çıktı ile altta beklenen input çakışmaz ("düşünüyor…fd" garble
//   biter) ve yazdığın kaybolmaz.
//
// createLineQueue(rl): readline 'line' event'lerini tampona alır → bir tur
// işlenirken yazılan satırlar kuyruğa girer, sırayla işlenir ("art arda
// iletebilelim"). Non-TTY/pipe yolu createPromptRegion'da düz-geçiş yapar
// (test/HTTP/`printf | deckent` davranışı korunur).

import { clearScreenDown, cursorTo, moveCursor, type Interface as ReadlineInterface } from 'node:readline';
import { debugLog } from '../../core/utils.js';
import { InjectedLabelMissingError } from '../helpers/injected-label.js';
import { suppressionTier } from '../helpers/theme.js';

export interface PromptRegion {
  /** Çıktıyı pinli prompt'un ÜSTÜNE yaz, kullanıcının yazdığını koru. */
  writeAbove(text: string): void;
  /** `› ` prompt'unu (ve korunan buffer'ı) yeniden çiz. */
  reprompt(): void;
}

export interface PromptRegionOptions {
  /** Prompt öneki. Default `› `. */
  prompt?: string;
  /** TTY override (test için). Default `out.isTTY === true`. */
  isTty?: boolean;
}

const DEFAULT_PROMPT = '› '; // `› `

/**
 * Pinli alt-prompt render bölgesi oluştur. TTY'de prompt'u set eder; writeAbove
 * çıktıyı üste basıp prompt'u yeniden çizer. Non-TTY'de writeAbove düz `out.write`
 * yapar (mevcut pipe davranışı korunur — \n eklenir).
 */
export function createPromptRegion(
  rl: Pick<ReadlineInterface, 'setPrompt' | 'prompt'> & {
    /** Public Node readline.Interface method (optional here for back-compat with
     * minimal test doubles); missing → treated as a single-row prompt (rows: 0). */
    getCursorPos?: () => { rows: number; cols: number };
  },
  out: NodeJS.WriteStream,
  opts: PromptRegionOptions = {},
): PromptRegion {
  const isTty = opts.isTty ?? out.isTTY === true;
  const prompt = opts.prompt ?? DEFAULT_PROMPT;
  if (isTty) rl.setPrompt(prompt);

  // T-224-019 — rl.prompt() throws `Error [ERR_USE_AFTER_CLOSE]: readline was
  // closed` if a late output flush arrives after :exit closed the interface
  // (warm-session tail chunk during teardown). That ONE case is expected —
  // guard it as a no-op, not a crash. born-541: narrowed from a blanket catch
  // — any OTHER error is unexpected and must not be silently swallowed. It is
  // logged (not re-thrown): safePrompt runs deep in the streaming/render hot
  // path with no wrapping try/catch upstream, so a re-throw here would crash
  // the whole pinned-prompt REPL for what may be a recoverable render glitch.
  const safePrompt = (): void => {
    try {
      rl.prompt(true);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
        return;
      }
      debugLog('chat-render-region.safePrompt', err);
    }
  };

  return {
    writeAbove(text: string): void {
      const block = text.endsWith('\n') ? text : text + '\n';
      if (!isTty) {
        out.write(block);
        return;
      }
      // born-540 — hedef-bölge (pinned `› ` prompt + kullanıcı buffer'ı) terminal
      // genişliğinden uzun olduğunda BİRDEN ÇOK satıra wrap olur; cursor bu
      // wrap'lı bloğun EN ALT satırında durur. Tek `clearLine` yalnız o alt
      // satırı silip üstteki wrap-satırlarını "artık" bırakırdı. `getCursorPos()`
      // (rl.line'ın kaç satır wrap ettiğini raporlar) ile cursor'u bölgenin EN
      // ÜSTÜNE taşı, oradan ekranın sonuna kadar tam temizle — sonra yaz.
      const pos = rl.getCursorPos?.() ?? { rows: 0, cols: 0 };
      moveCursor(out, 0, -pos.rows);
      cursorTo(out, 0);
      clearScreenDown(out);
      out.write(block);
      safePrompt();
    },
    reprompt(): void {
      if (isTty) safePrompt();
    },
  };
}

// ─── Thinking ticker — `● deckent · <fiil>…` (Sprint 224 T-224-014) ──────────
//
// claude-code'un oynak "Pondering…/Noodling…" döngüsü gibi: pinli prompt'un
// hemen ÜSTÜNDEKİ `● deckent` satırını YERİNDE güncelleyerek oturum dilindeki
// bir fiil gösterir. Animasyon o satırda; alttaki `› ` prompt + kullanıcı
// buffer'ı dokunulmaz (eski stderr braille spinner'ın çakışması YOK). İlk
// token gelince stop() fiili siler → `● deckent` kalır, cevap altına akar.
// Non-TTY → no-op.
//
// TERMINAL-TOOLS-002 — string-free: the verb pool is INJECTED by the caller
// (`opts.verbs`, entry.ts → chat-thinking-verbs.ts → catalog row
// `tui.thinking_verbs` for the session language). The Turkish literal list
// that used to live here rendered in every language; an empty injection is a
// typed InjectedLabelMissingError, never a built-in default.

const BRAILLE: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TICK_MS = 90;

// Kraken marka renkleri (splash.ts ile birebir): gövde teal, DECKENT gold.
// TERMINAL-TOOLS-003 — renk-kapısı SSOT'u theme.ts'tir: suppressionTier()
// 'none' ise (NO_COLOR / --no-color / FORCE_COLOR=0) hiç SGR basılmaz;
// truecolor bilinmiyorsa 16-renk analoğuna düşülür (splash.ts ile aynı).
// İmleç kontrolü (`\r` + satır-sil) renk DEĞİLDİR ve kapıdan bağımsızdır.
const KRAKEN_TEAL_TRUECOLOR = '\x1b[38;2;77;184;164m';
const KRAKEN_GOLD_TRUECOLOR = '\x1b[1;38;2;196;168;85m';
const KRAKEN_TEAL_16 = '\x1b[36m';
const KRAKEN_GOLD_16 = '\x1b[1;33m';
const DIM_C = '\x1b[2m';
const RESET_C = '\x1b[0m';
/** `● deckent` — `●` teal (kraken gövdesi), `deckent` gold (DECKENT marka);
 *  kapı kapalıysa düz metin. Her çizimde çözülür (env değişebilir). */
function brandHeader(): string {
  const tier = suppressionTier();
  if (tier === 'none') return '● deckent';
  const teal = tier === 'truecolor' ? KRAKEN_TEAL_TRUECOLOR : KRAKEN_TEAL_16;
  const gold = tier === 'truecolor' ? KRAKEN_GOLD_TRUECOLOR : KRAKEN_GOLD_16;
  return `${teal}●${RESET_C} ${gold}deckent${RESET_C}`;
}
function dimText(text: string): string {
  return suppressionTier() === 'none' ? text : `${DIM_C}${text}${RESET_C}`;
}

export interface ThinkingTicker {
  start(): void;
  stop(): void;
}

/**
 * `⠋ ● deckent · <fiil>…` düşünme göstergesi. Fiil **prompt başına SABİT** —
 * her tur rastgele tek bir fiil seçilir ve süre boyunca DEĞİŞMEZ (kullanıcı
 * isteği); sadece baştaki braille noktası döner (hareket/çalışıyor sinyali).
 * Kendi satırında in-place (`\r` + clear-line), prompt tur-arası gösterildiği
 * için çakışma yok. stop() → satırı temizleyip kraken-renkli `● deckent` +
 * newline bırakır → cevap altına inline akar. Non-TTY → no-op.
 *
 * `opts.verbs` = oturum dilindeki fiil havuzu (zorunlu, ≥1); `opts.verb`
 * verilirse o kullanılır (deterministik test), yoksa havuzdan rastgele.
 */
export function createThinkingTicker(
  out: NodeJS.WriteStream,
  opts: { isTty?: boolean; verb?: string; verbs: readonly string[] },
): ThinkingTicker {
  const isTty = opts.isTty ?? out.isTTY === true;
  const verbs = opts.verbs.filter((v) => v.length > 0);
  if (verbs.length === 0) throw new InjectedLabelMissingError('thinkingVerbs');
  let timer: ReturnType<typeof setInterval> | null = null;
  let frame = 0;
  let verb = opts.verb ?? verbs[0] as string;

  const paint = (): void => {
    out.write(`\r\x1b[2K${BRAILLE[frame % BRAILLE.length]} ${brandHeader()} ${dimText(`· ${verb}…`)}`);
  };

  return {
    start(): void {
      if (!isTty || timer !== null) return;
      // Prompt başına SABİT rastgele fiil (sürekli değişmesin — kullanıcı isteği).
      if (opts.verb === undefined) {
        verb = verbs[Math.floor(Math.random() * verbs.length)] as string;
      }
      frame = 0;
      paint();
      timer = setInterval(() => {
        frame++; // sadece braille noktası döner; fiil SABİT kalır
        paint();
      }, TICK_MS);
    },
    stop(): void {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      // Fiili sil, sade kraken-renkli `● deckent` + newline → cevap altına akar.
      out.write(`\r\x1b[2K${brandHeader()}\n`);
    },
  };
}

/**
 * readline 'line' event'lerini tampona alan async kuyruk. Bir tur işlenirken
 * yazılan satırlar tamponda birikir, sırayla yield edilir ("art arda"). rl
 * kapanınca (`close`) iterator biter. Strict-sequential async-iterator'ın
 * aksine, tur-arası bloke olmaz: kullanıcı cevap beklerken yazmaya devam eder.
 */
// ─── Line-buffered sink — pinned-bar streaming (Sprint 224 T-224-019) ──────
//
// claude-code "prompt altta SABİT, cevap üste akar" için: streamed token'ları
// satırlara tamponlar, her TAM satırı emitLine ile basar. emitLine =
// region.writeAbove → tam-bölge clear + satır + \n + rl.prompt(true), yani prompt her
// satırdan sonra altta yeniden çizilir (SABİT kalır, "kaybolmaz"). Akış
// satır-granüler (token-granüler değil) ama prompt hep görünür — kullanıcının
// birincil şikayetini ("prompt bar kayboluyor") çözer. flush() tur sonunda kalan
// kısmi satırı basar. Pure + testable; entry.ts flag-gated (DECKENT_PINNED_BAR=1)
// kullanır — default Model-C (raw inline) değişmez, çalışan REPL riske girmez.

export interface LineBufferedSink {
  feed(chunk: string): void;
  flush(): void;
}

export function createLineBufferedSink(emitLine: (line: string) => void): LineBufferedSink {
  let buf = '';
  return {
    feed(chunk: string): void {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        emitLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    },
    flush(): void {
      if (buf.length > 0) {
        emitLine(buf);
        buf = '';
      }
    },
  };
}

// ─── Live activity line (Sprint 224 T-224-022) ─────────────────────
//
// "Anlık beklerken deckent NE yapıyor görünmeli" — bir tool çalıştırılırken
// (agentic-DO: write/edit/bash/...) düşünme bölgesinde dim bir aktivite satırı
// gösterir (`🔧 dosya yazıyor: a.md`). claude-code'un adım-görünürlüğü gibi.
// TTY-only stil; non-TTY düz metin.
//
// TERMINAL-TOOLS-002 — string-free: the tool → verb table is INJECTED
// (`verbs`, chat-native.ts → chat-thinking-verbs.ts buildToolActivityVerbs →
// catalog rows `tui.tool_activity.<tool>` for the session language). The
// Turkish literal table that used to live here rendered in every language.

/**
 * Bir tool dispatch'i için canlı aktivite satırı. `verbs` içinde tanınan
 * tool'lar oturum dilindeki fiili alır; bilinmeyen → ham ad (teknik token).
 * Hedef (path/cmd) varsa eklenir. TTY → dim (renk kapısına bağlı); non-TTY → düz.
 */
export function renderToolActivity(
  toolName: string,
  args: Record<string, unknown> | undefined,
  tty: boolean | undefined,
  verbs: Readonly<Record<string, string>>,
): string {
  const isTty = tty !== undefined ? tty : process.stdout.isTTY === true;
  const verb = verbs[toolName] ?? toolName;
  const target =
    (args && (args['path'] ?? args['cmd'] ?? args['command'] ?? args['query'])) ?? '';
  const targetStr = target ? `: ${String(target)}` : '';
  const line = `🔧 ${verb}${targetStr}…`;
  return isTty ? dimText(line) : line; // dim only when the color gate allows it
}

// ─── Paste coalescer (Sprint 224 T-224-004) ────────────────────────
//
// Çok-satırlı yapıştırma terminale her satırı ayrı 'line' event'i olarak gelir
// → her satır ayrı tur → ayrı cevap beklenir (kopyala-yapıştır kırık). Coalescer
// kısa bir pencere (windowMs) içinde art-arda gelen satırları TEK mesajda
// (\n ile) birleştirir; pencere boşalınca emit eder. Tek satır → pencere kadar
// (≈40ms) gecikmeyle tek mesaj. Bilinçli art-arda gönderim (saniyeler arayla) →
// ayrı mesajlar. flush() bekleyen tamponu hemen boşaltır (exit/teardown).

export interface PasteCoalescer {
  feed(line: string): void;
  flush(): void;
}

export function createPasteCoalescer(
  emit: (message: string) => void,
  windowMs = 40,
): PasteCoalescer {
  let buf: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = (): void => {
    timer = null;
    if (buf.length === 0) return;
    const msg = buf.join('\n');
    buf = [];
    emit(msg);
  };
  return {
    feed(line: string): void {
      buf.push(line);
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, windowMs);
    },
    flush(): void {
      if (timer) clearTimeout(timer);
      fire();
    },
  };
}

export async function* createLineQueue(
  rl: Pick<ReadlineInterface, 'on'>,
  onIdle?: () => void,
): AsyncGenerator<string> {
  const buf: string[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  const bump = (): void => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };
  rl.on('line', (line: string) => {
    buf.push(line);
    bump();
  });
  rl.on('close', () => {
    closed = true;
    bump();
  });
  while (true) {
    while (buf.length > 0) {
      yield buf.shift() as string;
    }
    if (closed) return;
    // Idle: no buffered line → the REPL is waiting for input. Show the `› `
    // prompt here (between turns) so it appears exactly when ready, never
    // mid-turn. Skipped while lines are queued (back-to-back stays snappy).
    onIdle?.();
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }
}
