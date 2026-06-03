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
  /** Feed a streamed chunk; emits any units that completed. */
  feed(chunk: string): void;
  /** End of turn: emit the trailing partial line / any open block. */
  flush(): void;
  /** The current in-progress (incomplete) line, for a small live preview. */
  partial(): string;
}

const isTableRow = (l: string): boolean => /\|/.test(l) && l.trim().length > 0;
const isFenceLine = (l: string): boolean => /^\s*```/.test(l);

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
      if (isFenceLine(line)) { emit({ kind: 'block', markdown: block.join('\n') }); block = []; mode = 'prose'; }
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
    feed(chunk: string): void {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    },
    flush(): void {
      if (buf.length > 0) { handleLine(buf); buf = ''; }
      if (mode === 'code' && block.length > 0) { emit({ kind: 'block', markdown: block.join('\n') }); block = []; }
      else if (mode === 'table') flushTable();
      mode = 'prose';
    },
    partial: () => buf,
  };
}
