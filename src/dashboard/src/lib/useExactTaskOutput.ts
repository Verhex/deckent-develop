import { useCallback, useEffect, useState } from "react";
import { buildSseUrl } from "./api";

export type OutputViewStatus = "connecting" | "pending" | "live" | "sealed"
  | "unavailable" | "denied" | "ambiguous" | "not-dispatched" | "aborted"
  | "closed" | "held" | "disconnected";

interface OutputIdentity {
  projectId: string;
  taskId: string;
  sprintId: string;
  attemptId: string;
  generation: number;
  dispatchRequestId: string;
  tenantId: string;
  provider: string;
  model: string;
}

export interface ExactOutputLine {
  id: number;
  line: string;
  source: "pristine-provider-stream" | "live-stdout" | "live-stderr";
  byteLength: number;
}

interface OutputView {
  status: OutputViewStatus;
  lines: ExactOutputLine[];
  identity?: OutputIdentity;
  omittedLines: number;
}

const INITIAL: OutputView = { status: "connecting", lines: [], omittedLines: 0 };
const MAX_DISPLAY_BYTES = 4 * 1024 * 1024;
const STATES = new Set(["pending", "sealed", "unavailable", "denied", "ambiguous", "not-dispatched"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identity(value: unknown, taskId: string): OutputIdentity | undefined {
  if (!record(value) || value.taskId !== taskId || !Number.isSafeInteger(value.generation)
    || (value.generation as number) < 1) return undefined;
  for (const key of ["projectId", "taskId", "sprintId", "attemptId", "dispatchRequestId", "tenantId", "provider", "model"]) {
    if (typeof value[key] !== "string" || value[key].length === 0) return undefined;
  }
  return value as unknown as OutputIdentity;
}

function sameIdentity(a: OutputIdentity, b: OutputIdentity): boolean {
  return a.projectId === b.projectId && a.tenantId === b.tenantId && a.taskId === b.taskId
    && a.sprintId === b.sprintId && a.attemptId === b.attemptId
    && a.generation === b.generation && a.dispatchRequestId === b.dispatchRequestId
    && a.provider === b.provider && a.model === b.model;
}

/** Three Dashboard consumers share the server's exact read model, not task completion inference. */
export function useExactTaskOutput(taskId: string | undefined, enabled = true, tail = 500, attemptId?: string) {
  const [view, setView] = useState<OutputView>(INITIAL);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    setView(INITIAL);
    if (!enabled || !taskId || typeof EventSource === "undefined") return;
    const selector = attemptId ? `&attemptId=${encodeURIComponent(attemptId)}` : "";
    const es = new EventSource(buildSseUrl(`/api/output-stream?taskId=${encodeURIComponent(taskId)}&tail=${tail}${selector}`));
    let stopped = false;
    let selected: OutputIdentity | undefined;
    let seq = 0;
    const close = () => { stopped = true; es.close(); };
    const hold = () => {
      setView((previous) => ({ ...previous, status: "held" }));
      close();
    };
    const parse = (event: Event): unknown => JSON.parse((event as MessageEvent).data);

    es.addEventListener("output-state", (event) => {
      if (stopped) return;
      try {
        const body = parse(event);
        if (!record(body) || typeof body.state !== "string" || !STATES.has(body.state)) return hold();
        const next = identity(body.identity, taskId);
        if (["pending", "sealed", "not-dispatched"].includes(body.state) && !next) return hold();
        if (next && selected && !sameIdentity(next, selected)) return hold();
        selected = next;
        setView((previous) => ({ ...previous, identity: next, status: body.state as OutputViewStatus }));
      } catch { hold(); }
    });

    es.addEventListener("output-lines", (event) => {
      if (stopped) return;
      try {
        const body = parse(event);
        if (!record(body) || !selected || body.redacted !== true
          || !Array.isArray(body.lines) || !body.lines.every((line) => typeof line === "string")
          || !Number.isSafeInteger(body.omittedLines) || (body.omittedLines as number) < 0
          || !["pristine-provider-stream", "live-stdout", "live-stderr"].includes(String(body.source))) return hold();
        const next = identity(body.identity, taskId);
        if (!next || !sameIdentity(selected, next)) return hold();
        const additions = (body.lines as string[]).map((line) => ({ id: ++seq, line,
          byteLength: new TextEncoder().encode(line).length,
          source: body.source as ExactOutputLine["source"] }));
        setView((previous) => {
          const all = [...previous.lines, ...additions];
          let bytes = all.reduce((sum, entry) => sum + entry.byteLength, 0);
          let start = 0;
          while (all.length - start > tail || bytes > MAX_DISPLAY_BYTES) {
            bytes -= all[start++]!.byteLength;
          }
          return { ...previous, lines: all.slice(start),
            status: body.source === "pristine-provider-stream" ? "sealed" : "live",
            omittedLines: previous.omittedLines + (body.omittedLines as number) + start };
        });
      } catch { hold(); }
    });

    es.addEventListener("output-observation-end", (event) => {
      if (stopped) return;
      try {
        const body = parse(event);
        if (!record(body) || !["closed", "aborted", "unavailable"].includes(String(body.state))) return hold();
        if (body.state === "closed" && body.terminalMeaning !== "observer-only") return hold();
        setView((previous) => ({ ...previous, status: body.state as OutputViewStatus }));
      } catch { hold(); }
    });

    es.addEventListener("output-view-end", (event) => {
      if (stopped) return;
      try {
        const body = parse(event);
        if (!record(body) || !["held", "not-observed", "sealed-view", "live-view"].includes(String(body.state))) return hold();
        if (body.state === "held") setView((previous) => ({ ...previous, status: "held" }));
        close(); // A view ended; the worker's lifecycle is untouched.
      } catch { hold(); }
    });

    es.onerror = () => {
      if (stopped) return;
      setView((previous) => ({ ...previous, status: "disconnected" }));
      close(); // Explicit retry reopens a bounded snapshot; no duplicate append/retry loop.
    };
    return close;
  }, [taskId, enabled, tail, revision, attemptId]);

  return { ...view, retry };
}
