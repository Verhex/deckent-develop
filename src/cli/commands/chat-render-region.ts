// ═══ chat-render-region — sabit alt-prompt penceresi (Sprint 224 T-224-014) ═══
//
// claude-code hissi: input satırı altta SABİT `› ` prompt'unda durur, cevap/
// stream çıktısı bunun ÜSTÜNE akar, kullanıcının yazdığı (rl.line) KORUNUR.
//
// Mekanizma (ADR-010 — Node built-in readline + ANSI, yeni-dep YOK):
//   writeAbove(text): mevcut input satırını temizle (clearLine/cursorTo) →
//   çıktıyı bas → `rl.prompt(true)` ile prompt'u + korunan buffer'ı yeniden çiz.
//   Böylece akan çıktı ile altta beklenen input çakışmaz ("düşünüyor…fd" garble
//   biter) ve yazdığın kaybolmaz.
//
// createLineQueue(rl): readline 'line' event'lerini tampona alır → bir tur
// işlenirken yazılan satırlar kuyruğa girer, sırayla işlenir ("art arda
// iletebilelim"). Non-TTY/pipe yolu createPromptRegion'da düz-geçiş yapar
// (test/HTTP/`printf | deckent` davranışı korunur).

import { clearLine, cursorTo, type Interface as ReadlineInterface } from 'node:readline';

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
  rl: Pick<ReadlineInterface, 'setPrompt' | 'prompt'>,
  out: NodeJS.WriteStream,
  opts: PromptRegionOptions = {},
): PromptRegion {
  const isTty = opts.isTty ?? out.isTTY === true;
  const prompt = opts.prompt ?? DEFAULT_PROMPT;
  if (isTty) rl.setPrompt(prompt);

  return {
    writeAbove(text: string): void {
      const block = text.endsWith('\n') ? text : text + '\n';
      if (!isTty) {
        out.write(block);
        return;
      }
      // Input satırını temizle → çıktıyı bas → prompt+buffer yeniden çiz.
      cursorTo(out, 0);
      clearLine(out, 0);
      out.write(block);
      rl.prompt(true);
    },
    reprompt(): void {
      if (isTty) rl.prompt(true);
    },
  };
}

// ─── Thinking ticker — `● deckent · <fiil>…` (Sprint 224 T-224-014) ──────────
//
// claude-code'un oynak "Pondering…/Noodling…" döngüsü gibi: pinli prompt'un
// hemen ÜSTÜNDEKİ `● deckent` satırını YERİNDE güncelleyerek dönen Türkçe
// fiil gösterir. Animasyon o satırda; alttaki `› ` prompt + kullanıcı buffer'ı
// dokunulmaz (eski stderr braille spinner'ın çakışması YOK). İlk token gelince
// stop() fiili siler → `● deckent` kalır, cevap altına akar. Non-TTY → no-op.

export const THINKING_VERBS: readonly string[] = [
  'düşünüyor',
  'şahlanıyor',
  'derinlere dalıyor',
  'tartıyor',
  'kurguluyor',
  'bağ kuruyor',
  'damıtıyor',
  'yoğunlaşıyor',
];

const BRAILLE: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TICK_MS = 90;

// Kraken marka renkleri (splash.ts ile birebir): gövde teal, DECKENT gold.
const KRAKEN_TEAL = '\x1b[38;2;77;184;164m';
const KRAKEN_GOLD = '\x1b[1;38;2;196;168;85m';
const RESET_C = '\x1b[0m';
// `● deckent` — `●` teal (kraken gövdesi), `deckent` gold (DECKENT marka).
const HEADER = `${KRAKEN_TEAL}●${RESET_C} ${KRAKEN_GOLD}deckent${RESET_C}`;

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
 * `opts.verb` verilirse o kullanılır (deterministik test); yoksa rastgele.
 */
export function createThinkingTicker(
  out: NodeJS.WriteStream,
  opts: { isTty?: boolean; verb?: string } = {},
): ThinkingTicker {
  const isTty = opts.isTty ?? out.isTTY === true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let frame = 0;
  let verb = opts.verb ?? THINKING_VERBS[0] as string;

  const paint = (): void => {
    out.write(`\r\x1b[2K${BRAILLE[frame % BRAILLE.length]} ${HEADER} \x1b[2m· ${verb}…${RESET_C}`);
  };

  return {
    start(): void {
      if (!isTty || timer !== null) return;
      // Prompt başına SABİT rastgele fiil (sürekli değişmesin — kullanıcı isteği).
      if (opts.verb === undefined) {
        verb = THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)] as string;
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
      out.write(`\r\x1b[2K${HEADER}\n`);
    },
  };
}

/**
 * readline 'line' event'lerini tampona alan async kuyruk. Bir tur işlenirken
 * yazılan satırlar tamponda birikir, sırayla yield edilir ("art arda"). rl
 * kapanınca (`close`) iterator biter. Strict-sequential async-iterator'ın
 * aksine, tur-arası bloke olmaz: kullanıcı cevap beklerken yazmaya devam eder.
 */
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
