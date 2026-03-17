import { useEffect, useState } from "react";
import type { DashboardState } from "../types";

export function useSSE(url = "/api/events"): DashboardState | null {
  const [state, setState] = useState<DashboardState | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource(url);

      es.onmessage = (event) => {
        try {
          setState(JSON.parse(event.data) as DashboardState);
        } catch {
          // ignore malformed data
        }
      };

      es.onerror = () => {
        es?.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [url]);

  return state;
}
