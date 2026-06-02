import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildChatStreamUrl, streamChatResponse } from "../../src/dashboard/src/lib/chat-stream-client";

// ─── Mock EventSource ─────────────────────────────────────────────────────────
//
// happy-dom provides a real EventSource, but we need full control over the
// message/error dispatch for synchronous test assertions. We replace the global
// with a controllable fake and restore it after each test.

interface MockESInstance {
  url: string;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  closeCalls: number;
  close: () => void;
  /** Simulate a server event frame. */
  emit: (data: unknown) => void;
  /** Simulate a connection error. */
  error: () => void;
}

let latestEs: MockESInstance | null = null;

class MockEventSource {
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closeCalls = 0;

  constructor(url: string) {
    this.url = url;
    // Register as the latest instance so tests can drive it.
    latestEs = this as unknown as MockESInstance;
  }

  close() {
    this.closeCalls++;
  }

  /** Trigger onmessage with JSON-stringified data. */
  emit(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  /** Trigger onerror. */
  error() {
    if (this.onerror) this.onerror();
  }
}

const originalWindow = (globalThis as { window?: unknown }).window;
const originalEventSource = (globalThis as { EventSource?: unknown }).EventSource;

beforeEach(() => {
  vi.clearAllMocks();
  latestEs = null;
  // Provide a window object without __DECKENT_API_TOKEN__ for most tests.
  (globalThis as { window: unknown }).window = {};
  // Install the mock EventSource globally.
  (globalThis as { EventSource: unknown }).EventSource = MockEventSource;
});

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window: unknown }).window = originalWindow;
  }
  if (originalEventSource === undefined) {
    delete (globalThis as { EventSource?: unknown }).EventSource;
  } else {
    (globalThis as { EventSource: unknown }).EventSource = originalEventSource;
  }
});

// ─── buildChatStreamUrl ───────────────────────────────────────────────────────

describe("chat-stream-client / buildChatStreamUrl", () => {
  it("encodes message in query string", () => {
    const url = buildChatStreamUrl("hello world");
    expect(url).toContain("/api/chat/stream");
    expect(url).toContain("message=hello+world");
  });

  it("uses custom baseUrl when provided", () => {
    const url = buildChatStreamUrl("test", "/custom/stream");
    expect(url.startsWith("/custom/stream?")).toBe(true);
    expect(url).toContain("message=test");
  });

  it("includes token when window.__DECKENT_API_TOKEN__ is set", () => {
    (globalThis as { window: { __DECKENT_API_TOKEN__?: string } }).window = {
      __DECKENT_API_TOKEN__: "tok-abc",
    };
    const url = buildChatStreamUrl("hi");
    expect(url).toContain("token=tok-abc");
  });

  it("omits token param when no token is available", () => {
    const url = buildChatStreamUrl("hi");
    expect(url).not.toContain("token=");
  });
});

// ─── streamChatResponse ───────────────────────────────────────────────────────

describe("chat-stream-client / streamChatResponse — chunk events", () => {
  it("calls onChunk for each chunk event", () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    streamChatResponse({ message: "hello", handlers: { onChunk, onDone, onError } });

    expect(latestEs).not.toBeNull();
    latestEs!.emit({ type: "chunk", text: "Hel" });
    latestEs!.emit({ type: "chunk", text: "lo!" });

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenNthCalledWith(1, "Hel");
    expect(onChunk).toHaveBeenNthCalledWith(2, "lo!");
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("chat-stream-client / streamChatResponse — done event", () => {
  it("calls onDone with full reply and closes EventSource on done event", () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    streamChatResponse({ message: "hello", handlers: { onChunk, onDone, onError } });

    const es = latestEs!;
    es.emit({ type: "chunk", text: "Hi" });
    es.emit({ type: "done", reply: "Hi there!" });

    expect(onDone).toHaveBeenCalledWith("Hi there!");
    expect(onError).not.toHaveBeenCalled();
    // EventSource.close() must be called exactly once after done.
    expect(es.closeCalls).toBe(1);
  });

  it("stops dispatching after done event", () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    streamChatResponse({ message: "hi", handlers: { onChunk, onDone, onError } });

    latestEs!.emit({ type: "done", reply: "finished" });
    // Subsequent events after done must be ignored.
    latestEs!.emit({ type: "chunk", text: "extra" });

    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("chat-stream-client / streamChatResponse — error events", () => {
  it("calls onError with server-side error message and closes EventSource", () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    streamChatResponse({ message: "test", handlers: { onChunk, onDone, onError } });

    const es = latestEs!;
    es.emit({ type: "error", message: "adapter unavailable" });

    expect(onError).toHaveBeenCalledWith("adapter unavailable");
    expect(onDone).not.toHaveBeenCalled();
    expect(es.closeCalls).toBe(1);
  });

  it("calls onError with fallback message when server error has no message field", () => {
    const onError = vi.fn();
    streamChatResponse({
      message: "test",
      handlers: { onChunk: vi.fn(), onDone: vi.fn(), onError },
    });

    latestEs!.emit({ type: "error" });
    expect(onError).toHaveBeenCalledWith("unknown stream error");
  });

  it("calls onError on EventSource.onerror and closes connection", () => {
    const onError = vi.fn();
    streamChatResponse({
      message: "test",
      handlers: { onChunk: vi.fn(), onDone: vi.fn(), onError },
    });

    const es = latestEs!;
    es.error();

    expect(onError).toHaveBeenCalledWith("stream connection error");
    expect(es.closeCalls).toBe(1);
  });

  it("calls onError on malformed JSON and closes connection", () => {
    const onError = vi.fn();
    streamChatResponse({
      message: "test",
      handlers: { onChunk: vi.fn(), onDone: vi.fn(), onError },
    });

    const es = latestEs!;
    // Bypass emit helper to inject bad JSON.
    if (es.onmessage) {
      es.onmessage({ data: "not-json{{" } as MessageEvent);
    }

    expect(onError).toHaveBeenCalledWith("failed to parse stream event");
    expect(es.closeCalls).toBe(1);
  });
});

describe("chat-stream-client / streamChatResponse — manual close", () => {
  it("controller.close() closes the EventSource and stops dispatches", () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const ctrl = streamChatResponse({
      message: "hello",
      handlers: { onChunk, onDone, onError },
    });

    const es = latestEs!;
    es.emit({ type: "chunk", text: "partial" });
    expect(onChunk).toHaveBeenCalledTimes(1);

    ctrl.close();
    expect(es.closeCalls).toBe(1);

    // Events after manual close are silently ignored.
    es.emit({ type: "chunk", text: "after-close" });
    expect(onChunk).toHaveBeenCalledTimes(1);
  });

  it("calling controller.close() a second time is a no-op", () => {
    const ctrl = streamChatResponse({
      message: "hi",
      handlers: { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
    });

    ctrl.close();
    ctrl.close();
    // close() should have been called exactly once on the EventSource.
    expect(latestEs!.closeCalls).toBe(1);
  });
});
