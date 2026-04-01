import { useEffect, useState } from "react";
import type { DashboardState } from "../types";

export type SSEStatus = "connecting" | "connected" | "disconnected";

export interface SSEResult {
  data: DashboardState | null;
  status: SSEStatus;
}

export function useSSE(url = "/api/events"): DashboardState | null {
  const result = useSSEWithStatus(url);
  return result.data;
}

export function useSSEWithStatus(url = "/api/events"): SSEResult {
  const [data, setData] = useState<DashboardState | null>(null);
  const [status, setStatus] = useState<SSEStatus>("connecting");

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      setStatus("connecting");
      es = new EventSource(url);

      es.onopen = () => {
        setStatus("connected");
      };

      es.onmessage = (event) => {
        try {
          setData(JSON.parse(event.data) as DashboardState);
          setStatus("connected");
        } catch {
          // ignore malformed data
        }
      };

      es.onerror = () => {
        es?.close();
        setStatus("disconnected");
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [url]);

  return { data, status };
}
