import { createContext, createElement, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type { Instance } from 'ink';

export interface TerminalViewport { readonly columns: number; readonly rows: number; }
export const TerminalViewportContext = createContext<TerminalViewport | null>(null);

type ResizeListener = () => void;
type TerminalStream = NodeJS.WriteStream & { columns?: number; rows?: number };

export interface TerminalResizeFailure {
  readonly code: 'TERMINAL_RESIZE_FLUSH_TIMEOUT' | 'TERMINAL_RESIZE_FLUSH_FAILED';
  readonly cause?: unknown;
}

export interface TerminalResizeMediator {
  readonly stdout: NodeJS.WriteStream;
  getSnapshot(): TerminalViewport;
  subscribe(listener: ResizeListener): () => void;
  bind(instance: Pick<Instance, 'waitUntilRenderFlush'>): void;
  dispose(): void;
}

function dimension(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function createTerminalResizeMediator(options: {
  stdout: TerminalStream;
  flushTimeoutMs?: number;
  onFailure?: (failure: TerminalResizeFailure) => void;
}): TerminalResizeMediator {
  const source = options.stdout;
  const flushTimeoutMs = Math.max(1, Math.floor(options.flushTimeoutMs ?? 1_000));
  let snapshot: TerminalViewport = Object.freeze({ columns: dimension(source.columns, 80), rows: dimension(source.rows, 24) });
  let rendererRows = snapshot.rows;
  let instance: Pick<Instance, 'waitUntilRenderFlush'> | null = null;
  let disposed = false;
  let processing = false;
  let pending: TerminalViewport | null = null;
  const disposeWaiters = new Set<() => void>();
  const subscribers = new Set<ResizeListener>();
  const rendererResizeListeners: Array<{ listener: ResizeListener; once: boolean }> = [];

  const addRendererListener = (listener: ResizeListener, once: boolean, prepend: boolean): NodeJS.WriteStream => {
    const entry = { listener, once };
    if (prepend) rendererResizeListeners.unshift(entry);
    else rendererResizeListeners.push(entry);
    return proxy;
  };
  const removeRendererListener = (listener: ResizeListener): NodeJS.WriteStream => {
    for (let index = rendererResizeListeners.length - 1; index >= 0; index--) {
      if (rendererResizeListeners[index]!.listener === listener) {
        rendererResizeListeners.splice(index, 1);
        break;
      }
    }
    return proxy;
  };

  const proxy = new Proxy(source, {
    get(target, property) {
      if (property === 'columns') return snapshot.columns;
      if (property === 'rows') return rendererRows;
      if (property === 'on' || property === 'addListener') return (event: string, listener: ResizeListener) => {
        if (event === 'resize') return addRendererListener(listener, false, false);
        target.on(event, listener); return proxy;
      };
      if (property === 'once') return (event: string, listener: ResizeListener) => {
        if (event === 'resize') return addRendererListener(listener, true, false);
        target.once(event, listener); return proxy;
      };
      if (property === 'prependListener' || property === 'prependOnceListener') return (event: string, listener: ResizeListener) => {
        if (event === 'resize') return addRendererListener(listener, property === 'prependOnceListener', true);
        target[property](event, listener); return proxy;
      };
      if (property === 'off' || property === 'removeListener') return (event: string, listener: ResizeListener) => {
        if (event === 'resize') return removeRendererListener(listener);
        else target.off(event, listener);
        return proxy;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as NodeJS.WriteStream;

  const notify = (): void => { for (const listener of [...subscribers]) listener(); };
  const awaitFlush = async (): Promise<void> => {
    if (!instance) throw new Error('TERMINAL_RESIZE_INSTANCE_UNBOUND');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposeResolve: (() => void) | undefined;
    try {
      await Promise.race([
        instance.waitUntilRenderFlush(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('TERMINAL_RESIZE_FLUSH_TIMEOUT')), flushTimeoutMs); }),
        new Promise<void>((resolve) => { disposeResolve = resolve; disposeWaiters.add(resolve); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (disposeResolve) disposeWaiters.delete(disposeResolve);
    }
  };
  const process = async (): Promise<void> => {
    if (processing || disposed || !instance) return;
    processing = true;
    try {
      while (!disposed && pending) {
        const target = pending;
        pending = null;
        snapshot = Object.freeze(target);
        // A growing viewport may immediately admit a taller compact frame.
        // Expose that real larger row extent before React renders it; a
        // shrinking viewport keeps the prior extent until the compact target
        // frame has flushed. This is presentation sequencing only — snapshot
        // always remains the physical target geometry.
        rendererRows = Math.max(rendererRows, target.rows);
        const flush = awaitFlush();
        notify();
        await flush;
        if (pending) continue;
        if (disposed) return;
        rendererRows = target.rows;
        for (const entry of [...rendererResizeListeners]) {
          entry.listener();
          if (entry.once) removeRendererListener(entry.listener);
        }
      }
    } catch (cause) {
      if (!disposed) options.onFailure?.({
        code: cause instanceof Error && cause.message === 'TERMINAL_RESIZE_FLUSH_TIMEOUT'
          ? 'TERMINAL_RESIZE_FLUSH_TIMEOUT' : 'TERMINAL_RESIZE_FLUSH_FAILED',
        cause,
      });
    } finally {
      processing = false;
      if (!disposed && pending && instance) void process();
    }
  };
  const onPhysicalResize = (): void => {
    if (disposed) return;
    pending = Object.freeze({ columns: dimension(source.columns, snapshot.columns), rows: dimension(source.rows, snapshot.rows) });
    void process();
  };
  source.on('resize', onPhysicalResize);

  return {
    stdout: proxy,
    getSnapshot: () => snapshot,
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    bind(value) { instance = value; void process(); },
    dispose() {
      disposed = true;
      pending = null;
      subscribers.clear();
      rendererResizeListeners.length = 0;
      for (const resolve of disposeWaiters) resolve();
      disposeWaiters.clear();
      source.off('resize', onPhysicalResize);
    },
  };
}

export function TerminalViewportProvider(props: { readonly mediator: TerminalResizeMediator; readonly children: ReactNode }): ReactElement {
  const viewport = useSyncExternalStore(props.mediator.subscribe, props.mediator.getSnapshot, props.mediator.getSnapshot);
  return createElement(TerminalViewportContext.Provider, { value: viewport }, props.children);
}
