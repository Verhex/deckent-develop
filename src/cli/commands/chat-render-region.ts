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

const THINKING_VERBS: readonly string[] = [
  'düşünüyor',
  'şahlanıyor',
  'derinlere dalıyor',
  'tartıyor',
  'kurguluyor',
  'bağ kuruyor',
  'damıtıyor',
  'yoğunlaşıyor',
];

const TICK_MS = 700;
const HEADER = '\x1b[35m\x1b[1m● deckent\x1b[0m'; // bold magenta, chat-layout ile uyumlu

export interface ThinkingTicker {
  start(): void;
  stop(): void;
}

/**
 * `● deckent · <fiil>…` dönen düşünme göstergesi. start() → header satırını
 * (prompt'un 1 üstü) timer ile günceller; stop() → fiili silip `● deckent`
 * bırakır + prompt'u yeniden çizer. Non-TTY → no-op (test/pipe temiz).
 */
export function createThinkingTicker(
  rl: Pick<ReadlineInterface, 'prompt'>,
  out: NodeJS.WriteStream,
  opts: { isTty?: boolean } = {},
): ThinkingTicker {
  const isTty = opts.isTty ?? out.isTTY === true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let i = 0;

  // Header satırını (prompt'un 1 üstü) verilen metinle yeniden yaz, sonra
  // prompt'a geri dön + yeniden çiz. Cursor reprompt sonrası prompt satırında.
  const rewriteHeader = (text: string): void => {
    out.write('\x1b[1A\r\x1b[2K'); // yukarı 1, col0, satırı temizle (header satırı)
    out.write(text);
    out.write('\r\x1b[1B'); // col0, aşağı 1 (prompt satırına dön)
    rl.prompt(true); // prompt + korunan buffer yeniden çiz
  };

  return {
    start(): void {
      if (!isTty || timer !== null) return;
      i = 0;
      rewriteHeader(`${HEADER} \x1b[2m· ${THINKING_VERBS[0]}…\x1b[0m`);
      timer = setInterval(() => {
        i = (i + 1) % THINKING_VERBS.length;
        rewriteHeader(`${HEADER} \x1b[2m· ${THINKING_VERBS[i]}…\x1b[0m`);
      }, TICK_MS);
    },
    stop(): void {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      rewriteHeader(HEADER); // fiili sil, sade `● deckent` bırak
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
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }
}
