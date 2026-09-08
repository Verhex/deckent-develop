import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExactTaskOutput } from "../../src/dashboard/src/lib/useExactTaskOutput";
import { WorkerLogPanel } from "../../src/dashboard/src/components/WorkerLogPanel";
import { WorkerLogViewer } from "../../src/dashboard/src/components/WorkerLogViewer";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

vi.mock("../../src/dashboard/src/lib/api", () => ({
  buildSseUrl: (url: string) => url,
  fetchJson: async () => ({ language: "en" }),
}));

const selected = { projectId: "fixture-project", taskId: "724-001", sprintId: "sprint-724",
  attemptId: "fixture-attempt", generation: 1, dispatchRequestId: "fixture-dispatch", tenantId: "fixture-tenant",
  provider: "codex", model: "fixture-model" };
class Source {
  static instances: Source[] = [];
  handlers = new Map<string, ((event: Event) => void)[]>();
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) { Source.instances.push(this); }
  addEventListener(name: string, handler: (event: Event) => void) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
  }
  emit(name: string, body: unknown) {
    for (const handle of this.handlers.get(name) ?? []) handle(new MessageEvent(name, { data: JSON.stringify(body) }));
  }
}
function source() { return Source.instances.at(-1)!; }
function state(kind = "pending") { source().emit("output-state", { state: kind, identity: selected }); }
function output(lines: string[], overrides: Record<string, unknown> = {}) {
  source().emit("output-lines", { type: "lines", identity: selected, source: "live-stdout",
    redacted: true, omittedLines: 0, lines, ...overrides });
}
beforeEach(() => {
  Source.instances = [];
  vi.stubGlobal("EventSource", Source);
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("exact task output Dashboard consumers", () => {
  it("consumes only the exact typed read model and bounds whole retained lines", () => {
    const { result } = renderHook(() => useExactTaskOutput("724-001", true, 2));
    expect(source().url).toContain("/api/output-stream?taskId=724-001&tail=2");
    act(() => { state(); output(["first", "yağmurlu", "last"]); });
    expect(result.current.status).toBe("live");
    expect(result.current.lines.map((entry) => entry.line)).toEqual(["yağmurlu", "last"]);
    expect(result.current.omittedLines).toBe(1);
  });

  it("rejects foreign task/attempt bytes before rendering and preserves previous partial evidence", () => {
    const { result } = renderHook(() => useExactTaskOutput("724-001"));
    act(() => { state(); output(["own"]); });
    act(() => output(["foreign"], { identity: { ...selected, attemptId: "sibling" } }));
    expect(result.current.status).toBe("held");
    expect(result.current.lines.map((entry) => entry.line)).toEqual(["own"]);
    expect(source().close).toHaveBeenCalled();
  });

  it("rejects lines without verified identity or redacted display metadata", () => {
    const { result } = renderHook(() => useExactTaskOutput("724-001"));
    act(() => output(["unknown"]));
    expect(result.current.status).toBe("held");
    expect(result.current.lines).toEqual([]);
    act(() => result.current.retry());
    act(() => { state(); output(["raw"], { redacted: false }); });
    expect(result.current.status).toBe("held");
    expect(result.current.lines).toEqual([]);
  });

  it("pins provider/model custody identity and rejects missing or substituted fields", () => {
    const { result } = renderHook(() => useExactTaskOutput("724-001"));
    for (const altered of [{ ...selected, provider: "foreign-provider" },
      { ...selected, model: "foreign-model" }, { ...selected, model: undefined }]) {
      act(() => result.current.retry());
      act(() => { state(); output(["substituted"], { identity: altered }); });
      expect(result.current.status).toBe("held");
      expect(result.current.lines).toEqual([]);
    }
  });

  it("distinguishes pending, sealed and observer-only EOF from task completion", () => {
    const { result } = renderHook(() => useExactTaskOutput("724-001"));
    act(() => state());
    expect(result.current.status).toBe("pending");
    act(() => source().emit("output-observation-end", { state: "closed", terminalMeaning: "observer-only" }));
    expect(result.current.status).toBe("closed");
    act(() => source().emit("output-view-end", { state: "live-view", observation: { state: "closed", terminalMeaning: "observer-only" } }));
    expect(source().close).toHaveBeenCalledOnce();
    act(() => source().onerror?.());
    expect(result.current.status).toBe("closed");
    act(() => result.current.retry());
    act(() => { state("sealed"); output(["durable"], { source: "pristine-provider-stream" }); });
    expect(result.current.status).toBe("sealed");
  });

  it("keeps denied and ambiguous outcomes distinct and never silently retries them", () => {
    const { result } = renderHook(() => useExactTaskOutput("724-001"));
    act(() => source().emit("output-state", { state: "denied", reasonCode: "tenant-mismatch" }));
    expect(result.current.status).toBe("denied");
    act(() => source().emit("output-view-end", { state: "not-observed" }));
    expect(Source.instances).toHaveLength(1);
    act(() => result.current.retry());
    act(() => source().emit("output-state", { state: "ambiguous", candidateCount: 2 }));
    expect(result.current.status).toBe("ambiguous");
  });

  it("disconnects without hiding lines; an explicit retry starts a new snapshot without duplicate append", () => {
    const { result, unmount } = renderHook(() => useExactTaskOutput("724-001"));
    act(() => { state(); output(["retained"]); source().onerror?.(); });
    expect(result.current.status).toBe("disconnected");
    expect(result.current.lines).toHaveLength(1);
    act(() => result.current.retry());
    expect(result.current.lines).toEqual([]);
    act(() => { state(); output(["retained"]); });
    expect(result.current.lines).toHaveLength(1);
    const last = source();
    unmount();
    expect(last.close).toHaveBeenCalledOnce();
  });

  it("renders actual panel output and a HOLD together rather than hiding evidence", () => {
    render(<WorkerLogPanel taskId="724-001" onClose={() => {}} />);
    act(() => { state(); output(["useful evidence"]); source().emit("output-view-end", { state: "held", reason: "invalid-utf8" }); });
    expect(screen.getByText("useful evidence")).toBeDefined();
    expect(screen.getByTestId("output-view-status").textContent).toContain("worker_log.state.held");
    fireEvent.click(screen.getByText("worker_log.retry_view"));
    expect(Source.instances).toHaveLength(2);
  });

  it("defaults WorkerLogViewer to real provider lines, without synthesizing structured tool events", () => {
    render(<WorkerLogViewer taskId="724-001" />);
    act(() => { state(); output(['{"type":"tool_use","name":"not-parsed"}']); });
    expect(screen.getByTestId("worker-log-viewer")).toBeDefined();
    expect(screen.getByText('{"type":"tool_use","name":"not-parsed"}')).toBeDefined();
    expect(screen.queryByTestId("log-event-tool_use")).toBeNull();
  });

  it("shows Turkish view closure without claiming worker success", () => {
    window.localStorage.setItem("deckent.dashboard.lang", "tr");
    render(<LanguageProvider><WorkerLogPanel taskId="724-001" /></LanguageProvider>);
    act(() => { state(); source().emit("output-observation-end", { state: "closed", terminalMeaning: "observer-only" }); });
    expect(screen.getByTestId("output-view-status").textContent).toBe("Çıktı gözlemcisi kapandı; görev sonucu ayrıdır");
  });

  it("lets the operator resolve ambiguity with an explicit attempt instead of selecting latest", () => {
    render(<WorkerLogPanel taskId="724-001" />);
    act(() => source().emit("output-state", { state: "ambiguous", candidateCount: 2 }));
    fireEvent.change(screen.getByLabelText("worker_log.attempt_selector"), { target: { value: "exact-attempt" } });
    expect(Source.instances).toHaveLength(1);
    fireEvent.click(screen.getByText("worker_log.select_attempt"));
    expect(source().url).toContain("&attemptId=exact-attempt");
    expect(Source.instances).toHaveLength(2);
  });
});
