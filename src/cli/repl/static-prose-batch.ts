// Batches streamed prose lines before appending to Ink <Static> — one scrollback
// row per paragraph burst instead of one row per line (terminal "blank banding").

export interface StaticProseBatchEmitter {
  line(markdown: string): void;
  block(markdown: string): void;
  flush(): void;
}

export function createStaticProseBatchEmitter(
  pushSegment: (markdown: string) => void,
  debounceMs = 24,
): StaticProseBatchEmitter {
  let buf: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (buf.length === 0) return;
    pushSegment(buf.join('\n'));
    buf = [];
  };

  return {
    line(markdown: string) {
      buf.push(markdown);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    },
    block(markdown: string) {
      flush();
      pushSegment(markdown);
    },
    flush,
  };
}
