// ─── Telemetry ──────────────────────────────────────────────────────
// Opt-in only. No data is sent anywhere by default.
// This module collects events locally for debugging and analytics.

export interface TelemetryEvent {
  event: string;
  properties: Record<string, string | number | boolean>;
  timestamp: string;
}

export class TelemetryCollector {
  private events: TelemetryEvent[] = [];
  private enabled: boolean = false;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
    this.events = [];
  }

  record(event: string, properties: Record<string, string | number | boolean> = {}): void {
    if (!this.enabled) return;
    this.events.push({
      event,
      properties: this.sanitize(properties),
      timestamp: new Date().toISOString(),
    });
  }

  flush(): TelemetryEvent[] {
    const e = [...this.events];
    this.events = [];
    return e;
  }

  getEvents(): readonly TelemetryEvent[] {
    return this.events;
  }

  private sanitize(
    props: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(props)) {
      if (
        typeof v === 'string' &&
        (v.includes('@') || v.includes('/home/') || v.includes('/Users/'))
      ) {
        continue;
      }
      result[k] = v;
    }
    return result;
  }
}
