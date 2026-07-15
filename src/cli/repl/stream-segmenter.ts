// ═══ stream-segmenter — turn streamed markdown into emit-once segments ═══════
//
// Problem: re-rendering the whole growing reply in Ink's dynamic region drifts
// in some terminals once it exceeds the screen, AND bounding it ("… N lines
// above") forces the user to wait until the turn ends to read. Solution: as
// tokens stream, emit COMPLETED units (a prose line, or a finished code/table
// block) which the App appends to <Static> — they flow into the scrollback
// immediately (readable in real time), keep the dynamic region tiny (no drift),
// and multi-line blocks (fenced code, tables) are still rendered whole.

/** A completed, emit-ready markdown unit. `markdown` is raw md → renderMarkdown'd by the caller. */
export interface Segment {
  /** 'line' = one prose line · 'block' = a finished fenced-code or table block. */
  kind: 'line' | 'block';
  /** Raw markdown text of the unit (newline-joined for blocks). */
  markdown: string;
}

export interface StreamSegmenter {
  /**
   * Feed a streamed chunk; emits any units that completed.
   * Accepts a decoded `string` (the production path — provider already decoded)
   * OR raw UTF-8 `Uint8Array` bytes. Byte chunks are decoded with streaming
   * semantics so a multi-byte code point (Turkish ç/ğ/ı/İ/ö/ş/ü, em-dash, emoji)
   * split across a chunk boundary is held as an incomplete tail and completed by
   * the next chunk — never bisected into U+FFFD. String feeds pass through
   * byte-for-byte unchanged.
   */
  feed(chunk: string | Uint8Array): void;
  /** End of turn: emit the trailing partial line / any open block. */
  flush(): void;
  /** The current in-progress (incomplete) line, for a small live preview. */
  partial(): string;
}

const isTableRow = (l: string): boolean => /\|/.test(l) && l.trim().length > 0;
const isFenceLine = (l: string): boolean => /^\s*```/.test(l);

/** Cap a code block that never closes. A stray/unclosed ``` would otherwise
 *  buffer EVERY following line silently until turn-end (the "akış kayıp" freeze
 *  where a long reply appears frozen). Past this many lines without a closing
 *  fence we flush the buffered block and resume prose, bounding the freeze. Real
 *  fenced blocks are well under this — they still emit whole on their close. */
const MAX_CODE_BLOCK_LINES = 200;

/** True when a code block has grown past the cap without a closing fence line.
 *  Named so tests and grep can assert this guard is active: fenceGuard / unclosedFence. */
const fenceGuard = (lines: string[]): boolean => lines.length >= MAX_CODE_BLOCK_LINES;

/**
 * Create a segmenter. `emit(seg)` is called once per completed unit, in order.
 * Prose lines emit immediately; a fenced code block buffers from its opening
 * ``` to its closing ```; a run of `|`-rows buffers and emits as one table when
 * the run ends (if it carried a `|---|` separator) else as individual prose lines.
 */
export function createStreamSegmenter(emit: (seg: Segment) => void): StreamSegmenter {
  let buf = '';                          // incomplete trailing text (no newline yet)
  let mode: 'prose' | 'code' | 'table' = 'prose';
  let block: string[] = [];              // accumulating code/table lines
  // Stateful streaming UTF-8 decoder, created lazily only when raw bytes are fed.
  // `{ stream: true }` emits whole code points and buffers an incomplete
  // multi-byte tail across feeds — so a Turkish/emoji code point straddling a
  // chunk boundary is never garbled. (TextDecoder is a Node 24+ global — ADR-001.)
  let decoder: TextDecoder | null = null;

  const flushTable = (): void => {
    if (block.length === 0) return;
    const hasSep = block.some((l) => /^\s*\|?\s*:?-{2,}/.test(l));
    if (hasSep) emit({ kind: 'block', markdown: block.join('\n') });
    else for (const l of block) emit({ kind: 'line', markdown: l }); // not a real table
    block = [];
  };

  const handleLine = (line: string): void => {
    if (mode === 'code') {
      block.push(line);
      if (isFenceLine(line)) { emit({ kind: 'block', markdown: block.join('\n') }); block = []; mode = 'prose'; return; }
      // Runaway/unclosed fence: bound the silent buffer so a long block is
      // readable in chunks instead of frozen until turn-end. STAY in code mode —
      // the fence is still open (REPL-575 K7): the previous code reset mode to
      // 'prose' here, so the block's REAL closing ``` was then misread as a NEW
      // fence-open and the rest of the reply was swallowed as code. Emit this
      // chunk as a self-contained fenced block (synthesize a closing fence) and
      // reopen the continuation with the same opening fence, so every rendered
      // chunk is balanced AND the real close still closes the block normally.
      if (fenceGuard(block)) {
        const openingFence = block[0] ?? '```';
        emit({ kind: 'block', markdown: [...block, '```'].join('\n') });
        block = [openingFence];
      }
      return;
    }
    if (mode === 'table') {
      if (isTableRow(line)) { block.push(line); return; }
      flushTable(); mode = 'prose'; // fall through to handle this non-table line as prose
    }
    // prose
    if (isFenceLine(line)) { mode = 'code'; block = [line]; return; }
    if (isTableRow(line)) { mode = 'table'; block = [line]; return; }
    emit({ kind: 'line', markdown: line });
  };

  return {
    feed(chunk: string | Uint8Array): void {
      buf += typeof chunk === 'string'
        ? chunk
        : (decoder ??= new TextDecoder('utf-8')).decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    },
    flush(): void {
      // Drain any residual bytes the streaming decoder is still holding; a stream
      // truncated mid-codepoint yields a faithful U+FFFD rather than a silent drop.
      if (decoder) { buf += decoder.decode(); decoder = null; }
      if (buf.length > 0) { handleLine(buf); buf = ''; }
      if (mode === 'code' && block.length > 0) { emit({ kind: 'block', markdown: block.join('\n') }); block = []; }
      else if (mode === 'table') flushTable();
      mode = 'prose';
    },
    partial: () => buf,
  };
}
