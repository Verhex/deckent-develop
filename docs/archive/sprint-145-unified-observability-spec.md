# Sprint 145 Spec — Unified Native Observability

**Tarih:** 2026-04-17 (Sprint 144 canlı sırasında, Alperen direktifi 13:30 UTC)
**Durum:** SPEC — Sprint 145 DIRECTIVES'e taşınacak
**Öncelik:** P0 (Deckent vision'ı "kur-çalıştır, açık kaynak" için zorunlu)
**Cross-reference:** `sprint-145-adaptive-timeout-spec.md`, `sprint-144-cli-mcp-audit.md`

---

## Problem Tanımı

### Alperen Direktifi
> "Bu monitoringi MCP ve CLI olarak Deckent'e yazamaz mıyız? Mantık zaten bizde de vardı. Çoklu terminali gezip komut yazdırmadan ana terminalde akışı ve takibi yapabilsin. CC'de hem native hem Deckent özelliğiyle bunu kontrol etsin."

### Mevcut Durum
Koordinatör Sprint 144 boyunca **CC Monitor tool'u** (`bc7yzao57`) kullandı — Claude Code harness özelliği. Bu Deckent'e değil, CC'ye özel. Kullanıcı:
- **CC'de:** Monitor tool ile chat'e push notification alıyor ✅
- **Cursor'da:** Yok
- **Bağımsız terminal'de:** `tail -f .deckent/sprint-144-events.jsonl` + `deckent status` + `watch -n 5 'ls .tasks/'` gibi çoklu terminal kombinasyonu gerekli

### Deckent'in Mevcut Parçaları (%70 hazır)
- `src/orchestra/event-stream.ts` (305 LoC, Sprint 138 foundation) — **foundation var, emit call-site'lar eksik (T-144-015)**
- `src/core/notification-dispatcher.ts` — **yazıldı ama instantiate edilmiyor (Sprint 139 T-41 runtime-dead, audit raporu kanıtı)**
- Worker heartbeat (.hb dosyaları) — her 15s yazılıyor
- `deckent://dashboard` MCP resource — canlı snapshot
- `deckent_status` MCP tool — on-demand snapshot
- `.deckent/dashboard.json` — auditor scan loop yazıyor
- `deckent status --watch` CLI — her 5s poll refresh

### Eksik Parça
- **Push delivery:** event stream → stdout/MCP notification. Şu an sadece pull (snapshot on-demand)
- **Unified terminal UI:** tek pencerede tüm akış (progress + workers + events + alerts + cost)
- **MCP notifications/message subscribe:** uzun süreli event subscribe tool'u
- **NotifyDispatcher adapter wire:** McpNotificationAdapter + CliNotificationAdapter + FileAdapter birleşimi

---

## Tasarım

### 1. `deckent status --follow` (CLI Yeni Flag)

Mevcut `deckent status`'u extend et, `--follow` (veya kısa `-f`) flag'i ekle.

```bash
deckent status                  # mevcut: on-demand snapshot
deckent status --watch          # mevcut: 5s poll refresh
deckent status --follow         # YENİ: snapshot + event tail -f (single pane)
```

**Davranış:**
1. Anlık snapshot render (mevcut `--watch` davranışı + rich format)
2. `.deckent/sprint-<current>-events.jsonl` dosyasına `tail -f` yap
3. Her event geldikçe **inkrementalquattro render** (önceki satırı kırpma, yeni satır append)
4. Heartbeat/result/alert/NOTIFY kanallarını dinle
5. Ctrl+C ile temiz çık (event unsubscribe + tail-f kapat)

**Renderer tasarımı (terminal UI):**

```
╭────────────────────────────────────────────────────────────────────╮
│ 🚀 Sprint 144 — EXECUTE phase (13:34:15)                            │
├────────────────────────────────────────────────────────────────────┤
│ 📊 Progress: ██████████████░░░░░░  14/27 (52%)                      │
│ ⏱️  Elapsed: 61m · ETA ~19m · Hard cap 6h · Budget $2.4/$100       │
├────────────────────────────────────────────────────────────────────┤
│ 👷 Active Workers (3):                                              │
│   [12:17] w-144-017 │ orphan-cleanup │ bug-fixer    │ 🟢 healthy    │
│   [08:33] w-144-018 │ rich-output    │ doc-writer   │ 🟢 healthy    │
│   [04:42] w-144-019 │ test-memory-v2 │ test-writer  │ 🟢 healthy    │
├────────────────────────────────────────────────────────────────────┤
│ 📝 Recent Events (last 5):                                          │
│   13:34  ✅ RESULT   T-144-016 pid-manager        DONE (opus)      │
│   13:31  🔁 SPAWN    T-144-017                    w-144-017        │
│   13:31  ✅ RESULT   T-144-011 i18n-cli           DONE (sonnet)    │
│   13:31  ❌ NO_GO    T-144-008 dead-code-wave-b   timeout (1200s)  │
│   13:30  ✅ RESULT   T-144-013 redact-sensitive   DONE (sonnet)    │
├────────────────────────────────────────────────────────────────────┤
│ ⚠️  Alerts: 0 · 🎯 NO_GO: 5 (gate cap 3) · 💰 Cost: ~$2.40          │
╰────────────────────────────────────────────────────────────────────╯
Press Ctrl+C to exit · deckent status (snapshot) · deckent retro (after)
```

**Renderer implementation (önerilen):**
- **blessed** veya **ink** (React for CLI) **HAYIR** — extra dependency, Deckent minimum bağımlılık vision
- **Native ANSI escape** + cursor manipulation + `process.stdout.write` — 0 dependency
- Helper library: zaten dahil olan `chalk` varsa kullan, yoksa `\x1b[` raw sequence
- Box drawing: `╭╮╰╯├┤─│` unicode karakterler

### 2. `deckent_watch` MCP Tool

**MCP protokolü `notifications/message` spec**'i ile sunucu istemciye push gönderebilir. CC, Cursor, Claude Desktop bunu yansıtır.

```typescript
// src/mcp/tools/watch.ts (YENİ)
export function registerWatch(server: McpServer): void {
  server.registerTool("deckent_watch", {
    title: "Subscribe to sprint live event stream via MCP notifications",
    description:
      "Subscribe to live sprint events (phase changes, worker lifecycle, alerts, results, NOTIFY). " +
      "Events are pushed as MCP logging notifications. Call with sprintId (default: current) " +
      "and channels filter. Unsubscribe with deckent_watch_stop or by MCP session end.",
    inputSchema: z.object({
      sprintId: z.string().optional(),
      channels: z.array(z.enum([
        'PHASE', 'TASK_ASSIGN', 'HEARTBEAT', 'RESULT', 'ALERT', 'NOTIFY', 'METRIC'
      ])).optional(),
      tail: z.number().default(20).optional(), // initial backfill
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, ctx) => {
    const sprintId = args.sprintId ?? getCurrentSprintId();
    const eventBus = getEventBus();

    // Backfill last N events
    const recent = await eventBus.tail(sprintId, args.tail ?? 20);
    for (const event of recent) {
      await server.server.sendLoggingMessage({
        level: 'info',
        logger: `deckent.sprint.${sprintId}`,
        data: formatEventForMcp(event),
      });
    }

    // Live subscribe
    const unsubscribe = eventBus.subscribe(sprintId, args.channels, async (event) => {
      try {
        await server.server.sendLoggingMessage({
          level: event.channel.includes('ALERT') ? 'warning' : 'info',
          logger: `deckent.sprint.${sprintId}`,
          data: formatEventForMcp(event),
        });
      } catch (err) {
        // client disconnected — auto-unsubscribe
        unsubscribe();
      }
    });

    return {
      content: [{
        type: 'text',
        text: `Subscribed to sprint ${sprintId} events. Channels: ${args.channels?.join(', ') ?? 'all'}. Unsubscribe via deckent_watch_stop.`
      }],
    };
  });
}
```

**İkinci tool:** `deckent_watch_stop` — explicit unsubscribe (opsiyonel, MCP session kapanınca otomatik).

### 3. Event Bus Abstraction (`src/orchestra/event-bus.ts`)

Şu an `event-stream.ts` JSONL dosyasına yazıyor. **Subscribe API** eksik.

```typescript
// src/orchestra/event-bus.ts (YENİ)
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import { watch } from 'node:fs';
import type { EventMessage, Channel } from './event-stream.js';

class EventBus extends EventEmitter {
  private subscribers = new Map<string, Set<SubscriberFn>>();

  // Writer: event-stream.ts her writeEvent çağrısından sonra publish
  publish(event: EventMessage): void {
    // JSONL dosyasına yazma (mevcut event-stream.ts'de zaten var)
    // + in-process subscriber notification
    this.emit('event', event);
    this.emit(`channel:${event.channel}`, event);
    this.emit(`sprint:${event.sprintId}`, event);
  }

  subscribe(
    sprintId: string,
    channels: Channel[] | undefined,
    fn: SubscriberFn
  ): () => void {
    const filter = (event: EventMessage) => {
      if (event.sprintId !== sprintId) return;
      if (channels && !channels.some(c => event.channel.includes(c))) return;
      fn(event);
    };
    this.on('event', filter);
    return () => this.off('event', filter);
  }

  // Tail: son N event'i dosyadan oku (backfill için)
  async tail(sprintId: string, n: number): Promise<EventMessage[]> {
    const path = `.deckent/sprint-${sprintId}-events.jsonl`;
    const content = await fs.readFile(path, 'utf-8');
    const lines = content.trim().split('\n').slice(-n);
    return lines.map(l => JSON.parse(l) as EventMessage);
  }

  // File watch: başka process'in yazdığı event'leri de yakalar
  watchFile(sprintId: string): void {
    const path = `.deckent/sprint-${sprintId}-events.jsonl`;
    watch(path, { persistent: false }, async () => {
      // read new lines since last pos, publish
    });
  }
}

export const eventBus = new EventBus(); // singleton
```

### 4. NotifyDispatcher Wire (P0 — Sprint 145 #8 ile birleşik)

Audit'te ölü kanıtlanmıştı. Bu wire `deckent_watch` ve `--follow` için **zorunlu önkoşul**.

```typescript
// src/mcp/server.ts (mevcut dosyayı düzenle)
import { NotifyDispatcher } from '../core/notification-dispatcher.js';
import { McpNotificationAdapter } from '../core/notify-adapters/mcp-adapter.js';
import { CliNotificationAdapter } from '../core/notify-adapters/cli-adapter.js';
import { FileNotificationAdapter } from '../core/notify-adapters/file-adapter.js';

// Server startup:
const notifyDispatcher = new NotifyDispatcher();
notifyDispatcher.addAdapter(new McpNotificationAdapter(server));
notifyDispatcher.addAdapter(new FileNotificationAdapter('.deckent/notifications.jsonl'));
// CliNotificationAdapter sadece CLI mode'da eklenir

// Event bus → dispatcher
eventBus.on('event', (event) => {
  if (event.channel === CHANNELS.NOTIFY) {
    notifyDispatcher.dispatch(event);
  }
});
```

### 5. Terminal UI Renderer (`src/cli/helpers/status-renderer.ts`)

```typescript
// src/cli/helpers/status-renderer.ts (YENİ, ~200 LoC)
import { clearScreen, cursorTo, color } from './ansi.js';

export class StatusRenderer {
  private lastRender: string = '';

  render(state: SprintState, events: RecentEvents): string {
    const lines: string[] = [];

    // Header
    lines.push(this.renderHeader(state));

    // Progress bar
    lines.push(this.renderProgress(state));

    // Active workers table
    lines.push(...this.renderWorkers(state.activeWorkers));

    // Recent events tail (last 5)
    lines.push(...this.renderEvents(events.slice(-5)));

    // Footer: alerts + cost
    lines.push(this.renderFooter(state));

    return lines.join('\n');
  }

  // Partial update: sadece değişen satırı yeniden çiz
  redraw(prev: string, next: string): void {
    const prevLines = prev.split('\n');
    const nextLines = next.split('\n');
    for (let i = 0; i < nextLines.length; i++) {
      if (prevLines[i] !== nextLines[i]) {
        cursorTo(0, i);
        clearLine();
        process.stdout.write(nextLines[i]);
      }
    }
  }
}
```

---

## Sprint 145 Task'ları (Öneri — Adaptive Timeout spec'i ile birleşik)

### Task M1 — Event Bus Abstraction + Subscribe API (P0)
- **Model:** opus | **Effort:** normal | **Agent:** architect | **Skills:** typescript-expert, system-architect
- **Files:** `src/orchestra/event-bus.ts` (yeni), `src/orchestra/event-stream.ts`, `tests/orchestra/event-bus.test.ts`
- **Scope:** `src/orchestra/`, `tests/orchestra/`
- **Description:** EventEmitter-based in-process subscribe + file watch + tail. `event-stream.ts` writeEvent → eventBus.publish.

### Task M2 — NotifyDispatcher Wire + 3 Adapter (P0, önceki P0 #8 ile birleşik)
- **Model:** opus | **Effort:** normal | **Agent:** bug-fixer | **Skills:** typescript-expert
- **Files:** `src/mcp/server.ts`, `src/cli/entry.ts`, `src/core/notification-dispatcher.ts`, `src/core/notify-adapters/*.ts`
- **Scope:** `src/mcp/`, `src/cli/`, `src/core/`
- **Description:** NotifyDispatcher instantiate, 3 adapter wire (MCP/CLI/File), eventBus → dispatcher bağla. Sprint 139 T-41 runtime-dead fix.

### Task M3 — `deckent status --follow` Flag + Terminal Renderer (P0)
- **Model:** opus | **Effort:** normal | **Agent:** refactorer | **Skills:** typescript-expert
- **Files:** `src/cli/commands/status.ts`, `src/cli/helpers/status-renderer.ts` (yeni), `src/cli/helpers/ansi.ts` (yeni), `tests/cli/status-follow.test.ts`
- **Scope:** `src/cli/`, `tests/cli/`
- **Description:** `--follow` flag handler, eventBus subscribe, terminal UI render (ANSI escape, no external deps), Ctrl+C graceful cleanup.

### Task M4 — `deckent_watch` MCP Tool + Notifications (P0)
- **Model:** opus | **Effort:** normal | **Agent:** architect | **Skills:** typescript-expert, anthropic-sdk
- **Files:** `src/mcp/tools/watch.ts` (yeni), `src/mcp/tools/index.ts`, `tests/mcp/tools/watch.test.ts`
- **Scope:** `src/mcp/`, `tests/mcp/`
- **Description:** `deckent_watch` tool, MCP `sendLoggingMessage` subscribe, auto-unsubscribe on client disconnect. `deckent_watch_stop` opsiyonel explicit unsubscribe.

### Task M5 — UI Polish (P2)
- **Model:** sonnet | **Effort:** low | **Agent:** doc-writer | **Skills:** frontend-design
- **Files:** `src/cli/helpers/status-renderer.ts`, `src/cli/helpers/ansi.ts`
- **Scope:** `src/cli/helpers/`
- **Description:** Renk (emoji icon map, alert rengi kırmızı, DONE yeşili), partial redraw optimization, terminal width responsive.

---

## Sprint 144 Canlı Kanıt

### Koordinatörün Dert Yaşadığı Pattern
Sprint 144 boyunca koordinatör:
- CC Monitor kullandı (`bc7yzao57`) — chat event push ✅
- Her event'te manuel `cat .tasks/task-XXX.result` + `git status` kontrolü
- `deckent_status` MCP tool'u dashboard.json stale (Sprint 143 snapshot) döndürdü
- 4 ayrı gözlem kaynağı: Monitor + filesystem + git + MCP status

### Eğer Unified Observability Canlı Olsa
```bash
# Terminal 1:
deckent start

# Terminal 2 (ana terminal, tek pencerede her şey):
deckent status --follow
# → automatic rich UI + event tail + worker status + alerts + cost
# → Ctrl+C ile çık
```

Claude Code'da:
```
deckent_watch({ sprintId: 'sprint-144' })
# → chat'e MCP notifications otomatik akar, Monitor tool gerekmez
```

---

## Bağımlılık Zinciri

```
T-144-015 (Event Stream Emit Wire, Sprint 144'te yapılıyor)
  └─> Sprint 145 M1 (Event Bus)
       └─> Sprint 145 M2 (NotifyDispatcher Wire)
            ├─> Sprint 145 M3 (CLI --follow)
            └─> Sprint 145 M4 (MCP deckent_watch)
                 └─> Sprint 145 M5 (UI polish)
```

T-144-015 şu an Sprint 144'te aktif worker üzerinde (hb=17'de görülmüş olabilir). Sprint 145 M1-M4 bu foundation üzerine inşa edilecek.

---

## Sprint 145 Toplam Kapsamı (güncellenmiş)

**Adaptive Timeout Spec (7 task):** A, B, C, D, E, F, G
**Unified Observability Spec (5 task):** M1, M2, M3, M4, M5

**Toplam Sprint 145:** ~12 task + önceki audit'ten 5 P0 runtime wire fix = **~17 task**.

Bu Sprint 144 boyutunda (27 task) değil, daha kompakt. Hard cap 4-5 saat.

### Sprint 145 Teması Güncellendi
**"Runtime Wire + Adaptive Timeout + Unified Observability Reform"**

Felsefesi: **Deckent kendi davranışını bilsin (timeout scaling, wire canlı) ve kullanıcıya iletsin (unified observability).**

---

## Alperen Direktiflerinin Özetlenmesi

1. **"Timeout brain'e ver, parametize et, min floor user-editable"** → Adaptive Timeout Spec A/B/C
2. **"Fix fazı koruyor ama timeout her worker'da aynı olmamalı"** → Adaptive Timeout Spec B heuristic
3. **"Canlı çalışırken timeout değiştirilebilir mi?"** → Adaptive Timeout Spec 3 opsiyon analizi (Opsiyon B + C hibrit önerisi)
4. **"Monitoring'i MCP+CLI olarak Deckent'e yaz, çoklu terminal gezdirmeden ana terminalde akış"** → Unified Observability Spec M1-M5
5. **"CC'de hem native hem Deckent özelliği ile kontrol etsin"** → MCP `deckent_watch` + CLI `deckent status --follow` hibrit

---

**Oluşturan:** Koordinatör, 2026-04-17 ~13:35 UTC (Sprint 144 canlı, 14/27 result, 9 DONE + 5 spurious NO_GO)
**Kaynak:** Alperen direktifleri + Sprint 144 canlı kanıt + CLI+MCP audit raporu
**Sonraki adım:** Sprint 144 bitince retrospektif + Sprint 145 DIRECTIVES yazımında bu spec + adaptive timeout spec birleştirilecek.

---

## 🔌 Backend-Aware Otonom Monitoring (Alperen Direktifi 2026-04-17 13:36 UTC)

### Problem
3 backend (docker/tmux/subprocess) farklı observability capability'lerine sahip. `deckent status --follow` her 3'ünde de çalışmalı ama backend-specific zenginlikten faydalanmalı.

### Alperen Sözleri
> "Monitoring Deckent'te olmalı, subprocess olursa çalışmaz sanırım ama tmux veya docker ayarlarında çalışmalı. deckent watch komutu değiştirilebilir veya monitor'e backend durumuna göre otonom yakalaması gerekir. Bunu yapabilir miyiz?"

### Cevap: EVET, Yapılabilir. %90 Backend-Agnostic.

**Backend-agnostic kaynaklar (3/3 backend'de çalışır):**
- `.tasks/task-*.hb` (heartbeat) — `heartbeat-daemon.ts` aynı kod
- `.tasks/task-*.result` (result) — `worker-lifecycle.ts` aynı kod
- `.deckent/sprint-<N>-events.jsonl` (event stream) — `event-stream.ts` aynı kod
- Sprint PID + finalize lifecycle

**Backend-specific ek katman (opsiyonel zenginlik):**

| Feature | Docker | Tmux | Subprocess |
|---|---|---|---|
| `listActiveWorkers()` | `docker ps --filter name=deckent-w-` | `tmux ls` | `.deckent/workers/*.pid` |
| `captureOutput()` | `docker logs --tail 20` | `tmux capture-pane -p` | ⚠ stdout pipe (karışık) |
| `resourceUsage()` | `docker stats --no-stream` | ⚠ yok | ⚠ `ps` (sınırlı) |
| `killWorker()` | `docker kill` | `tmux kill-session` | `kill <pid>` |

### Monitor Adapter Pattern

```typescript
// src/orchestra/monitor-adapter.ts (YENİ, ~250 LoC)
export interface MonitorAdapter {
  readonly backend: 'docker' | 'tmux' | 'subprocess';
  listActiveWorkers(): Promise<WorkerInfo[]>;
  captureWorkerOutput(workerId: string, lines: number): Promise<string | null>;
  getResourceUsage(workerId: string): Promise<ResourceUsage | null>;
  killWorker(workerId: string): Promise<void>;
}

export class DockerMonitorAdapter implements MonitorAdapter {
  readonly backend = 'docker' as const;
  async listActiveWorkers(): Promise<WorkerInfo[]> {
    const out = await exec('docker ps --filter name=deckent-w- --format "{{json .}}"');
    return out.split('\n').filter(Boolean).map(l => {
      const d = JSON.parse(l);
      return { id: d.Names, status: d.Status, createdAt: d.CreatedAt };
    });
  }
  async captureWorkerOutput(id: string, n: number): Promise<string> {
    return exec(`docker logs --tail ${n} ${id} 2>&1`);
  }
  async getResourceUsage(id: string): Promise<ResourceUsage> {
    const s = await exec(`docker stats --no-stream --format "{{json .}}" ${id}`);
    const d = JSON.parse(s);
    return { cpu: d.CPUPerc, memory: d.MemUsage, diskIo: d.BlockIO };
  }
  async killWorker(id: string): Promise<void> {
    await exec(`docker kill ${id}`);
  }
}

export class TmuxMonitorAdapter implements MonitorAdapter {
  readonly backend = 'tmux' as const;
  async listActiveWorkers(): Promise<WorkerInfo[]> {
    const out = await exec('tmux ls -F "#{session_name}:#{session_created}"');
    return out.split('\n').filter(l => l.startsWith('deckent-w-')).map(l => {
      const [name, created] = l.split(':');
      return { id: name, status: 'running', createdAt: new Date(parseInt(created) * 1000).toISOString() };
    });
  }
  async captureWorkerOutput(id: string, n: number): Promise<string> {
    return exec(`tmux capture-pane -t ${id} -p -S -${n}`);
  }
  async getResourceUsage(): Promise<null> { return null; }
  async killWorker(id: string): Promise<void> {
    await exec(`tmux kill-session -t ${id}`);
  }
}

export class SubprocessMonitorAdapter implements MonitorAdapter {
  readonly backend = 'subprocess' as const;
  async listActiveWorkers(): Promise<WorkerInfo[]> {
    const files = await fs.readdir('.deckent/workers').catch(() => []);
    return files.filter(f => f.endsWith('.pid')).map(f => {
      const id = f.replace('.pid', '');
      return { id, status: 'running' };
    });
  }
  async captureWorkerOutput(): Promise<string> {
    return '(subprocess backend: stdout not captured — live output unavailable, use .tasks/ files for progress)';
  }
  async getResourceUsage(id: string): Promise<ResourceUsage | null> {
    try {
      const pidFile = `.deckent/workers/${id}.pid`;
      const pid = (await fs.readFile(pidFile, 'utf-8')).trim();
      const out = await exec(`ps -o pid,pcpu,pmem -p ${pid}`);
      const [_, line] = out.split('\n');
      const [, cpu, mem] = line.trim().split(/\s+/);
      return { cpu: `${cpu}%`, memory: `${mem}%`, diskIo: 'N/A' };
    } catch { return null; }
  }
  async killWorker(id: string): Promise<void> {
    const pid = (await fs.readFile(`.deckent/workers/${id}.pid`, 'utf-8')).trim();
    process.kill(parseInt(pid), 'SIGTERM');
  }
}

// Factory — otonom backend detection
export function createMonitorAdapter(config: ResolvedConfig): MonitorAdapter {
  switch (config.spawn_backend) {
    case 'docker': return new DockerMonitorAdapter();
    case 'tmux': return new TmuxMonitorAdapter();
    case 'subprocess': return new SubprocessMonitorAdapter();
    default: throw new Error(`Unknown backend: ${config.spawn_backend}`);
  }
}
```

### `deckent status --follow` Backend-Aware Render

```typescript
const adapter = createMonitorAdapter(config);
const workers = await adapter.listActiveWorkers();

// Conditional render based on backend capability
if (workers.length > 0) {
  renderWorkersTable(workers);

  // Resource panel: sadece destekleyen backend'lerde
  const resources = await Promise.all(workers.map(w => adapter.getResourceUsage(w.id)));
  if (resources.some(r => r !== null)) {
    renderResourcePanel(resources);
  }

  // Live output: docker/tmux'ta zengin, subprocess'te placeholder
  if (adapter.backend !== 'subprocess') {
    const logs = await adapter.captureWorkerOutput(workers[0].id, 5);
    renderLiveOutputPane(logs);
  }
}
```

### Header Display (Backend Bilgisi)

```
╭────────────────────────────────────────────────────────────────────╮
│ 🚀 Sprint 144 — EXECUTE phase · 🐳 Docker backend · 3 workers       │
├────────────────────────────────────────────────────────────────────┤
```

veya

```
│ 🚀 Sprint 144 — EXECUTE phase · 🖥  Tmux backend · 3 sessions       │
```

veya

```
│ 🚀 Sprint 144 — EXECUTE phase · ⚙  Subprocess backend · 3 PIDs     │
│ ℹ️  Live worker output unavailable in subprocess mode               │
```

### Task M1 → M3 Güncellendi

**M3 (CLI --follow)** artık backend-aware renderer yapacak:
- Backend detect (config'ten)
- Adapter factory çağrısı
- Conditional render (resource panel only if supported)
- Subprocess'te placeholder + event stream fallback

### Yeni Task: M6 — Monitor Adapter (P0)

- **Model:** opus | **Effort:** normal | **Agent:** architect | **Skills:** typescript-expert, devops-engineer
- **Files:** `src/orchestra/monitor-adapter.ts` (yeni, ~250 LoC), `tests/orchestra/monitor-adapter.test.ts`
- **Scope:** `src/orchestra/`, `tests/orchestra/`
- **Description:** 3 adapter (Docker/Tmux/Subprocess) + factory + contract test. Her adapter aynı interface, backend-specific gerçekleme.
- **Kanıt:** `createMonitorAdapter({spawn_backend: 'docker'}).listActiveWorkers()` → Docker container listesi. Subprocess'te aynı çağrı PID listesi döner.

### Yanıt: "Bunu yapabilir miyiz?"

**%100 Evet.** Foundation zaten var:
- `heartbeat-daemon.ts`, `event-stream.ts`, `worker-lifecycle.ts` backend-agnostic
- Spawn-backend klasöründe zaten `spawn-backend-docker.ts`, `tmux.ts`, `spawn-backend.ts` (subprocess) var — her birinden "monitor adapter" extract edilir

**Subprocess'te kaybedilen:** Worker stdout live tail. Ama **en önemli metric'ler (progress, heartbeat, result, alert) 3 backend'de de çalışır**. Subprocess'te UI sadece "live output pane" göstermez, diğer paneller tam çalışır.

Bu Sprint 145 Unified Observability spec'inin **doğal parçası**, M6 task'ı eklendi (toplam 6 task: M1-M6 + önceki 5 + adaptive timeout 7 = ~18 task Sprint 145).

---

## 🐛 YENİ BULGU — IPC Directory Leak (Sprint 144 canlı, 2026-04-17 13:42 UTC)

### Tespit
`.deckent/sprint-<timestamp>-ipc/` dizinleri her `deckent_start` çağrısında oluşuyor, sprint bitince silinmiyor.
- **Toplam orphan IPC dizin:** 464 (bugün boyunca)
- **Her biri:** `config.json` içeren tek dosyalı dizin (~100 bytes)
- **Total disk:** ~1.8MB (küçük ama sayı endişe verici)

### Root Cause (Sprint 143 T-143-012 pattern'i)
MCP `deckent_start` tool'u detached fork ile `sprint-runner-entry.js` spawn ederken config'i path üzerinden geçiriyor:
```
.deckent/sprint-<jobId>-ipc/config.json
= { projectRoot, jobId, autoApprove }
```
Child process başlarken bu dosyayı okur ama **kimse silmiyor**.

### Sprint 144 Canlı Etkisi
Her sprint çalıştırıldığında +1 orphan. Dev/test iterasyonları ile saatlerde ~50-100 ekleniyor.

### Çözüm — Sprint 145 M7 (yeni task)

**Yaklaşım: Defense-in-depth (3 katman)**

**M7.1 — Sprint-runner startup cleanup:**
```typescript
// src/orchestra/sprint-runner-entry.ts
const configPath = process.argv[2];
const config = JSON.parse(await fs.readFile(`${configPath}/config.json`, 'utf-8'));
// ... run sprint ...
// Cleanup on exit:
process.on('exit', () => fs.rmSync(configPath, { recursive: true, force: true }));
```

**M7.2 — Preflight orphan cleanup scope extension:**
T-144-018'in scope'u `.tasks/` + `.locks/` idi. Sprint 145'te IPC dizinlerini de cover et:
```typescript
// src/core/orphan-cleaner.ts
const ipcDirs = (await fs.readdir('.deckent'))
  .filter(d => /^sprint-\d+-ipc$/.test(d));
for (const d of ipcDirs) {
  // Current sprint IPC'sini koru, diğerlerini sil
  const ipcJobId = d.match(/sprint-(\d+)-ipc/)?.[1];
  if (ipcJobId !== currentJobId) {
    await fs.rm(`.deckent/${d}`, { recursive: true, force: true });
  }
}
```

**M7.3 — MCP server side cleanup:**
```typescript
// src/mcp/tools/start.ts
const child = fork(sprintRunnerPath, [ipcPath], { detached: true });
child.on('exit', () => {
  fs.rm(ipcPath, { recursive: true, force: true }).catch(() => {});
});
child.unref();
```

### Task M7 — IPC Directory Leak Fix (P0)

- **Model:** opus | **Effort:** normal | **Agent:** bug-fixer | **Skills:** typescript-expert
- **Files:** `src/orchestra/sprint-runner-entry.ts`, `src/core/orphan-cleaner.ts`, `src/mcp/tools/start.ts`, `tests/mcp/tools/start-detached-fork.integration.test.ts`
- **Scope:** `src/orchestra/`, `src/core/`, `src/mcp/`, `tests/`
- **Description:** IPC directory orphan leak fix, 3-katman savunma (sprint-runner + orphan-cleaner + MCP server). T-144-018 pre-flight scope genişletme.
- **Kanıt:**
  - `ls -d .deckent/sprint-*-ipc 2>/dev/null | wc -l` → 0 (veya 1 = current sprint)
  - T-144-024 integration test (Sprint 144'te zaten tamamlandı) bu cleanup'i verify eder
- **Sprint 144 canlı sayıları:** 464 orphan IPC dizin tespit edildi (2026-04-17 13:42)

### Alperen Tespit Kredisi
> "sprint-1776432932780-ipc formatında dosyalar oluşuyor bunlar neden oluşuyor ne işe yarıyor"

Koordinatör soruyu araştırdı, 464 orphan dizini kanıtladı, Sprint 143 IPC fork pattern'inin silme mekanizması eksikliğini tespit etti. Sprint 145 M7 task'ı olarak planlanıyor.

---

## 🎯 KÖK NEDEN TESPİTİ (2026-04-17 13:46 UTC, Alperen direktifi ile)

### Lokasyon
- **Dosya:** `src/mcp/tools/start.ts:110-128`
- **Bug:** `fork()` çağrısı sonrası `child.on('exit')` cleanup listener YOK
- **Kaynak:** Sprint 143 T-143-012 "MCP Disconnect Fix" — fork pattern yazıldı, cleanup unutuldu

### Kanıt Akışı (Sprint 144 canlı, 16:45:20)
Son 3 IPC dizini **25 milisaniye** arayla oluştu → T-144-024 integration test worker aktif:
```
2026-04-17 16:45:20.230 .deckent/sprint-1776433520235-ipc
2026-04-17 16:45:20.244 .deckent/sprint-1776433520247-ipc
2026-04-17 16:45:20.255 .deckent/sprint-1776433520257-ipc
```
Bu test'ler `fork()` çağrılarını simulate ediyor, gerçek bug'ı tetikliyor.

### Detay Davranış
```
deckent_start MCP çağrısı
  ↓
src/mcp/tools/start.ts:110
  const ipcDir = getIpcDir(root, jobId)      // .deckent/sprint-<jobId>-ipc
  mkdirSync(ipcDir, { recursive: true })     // ← dizin YARATILIYOR
  writeFileSync(ipcDir/config.json, {...})   // ← config yazılıyor
  ↓
fork(sprint-runner-entry.js, [ipcDir])
  ↓
child process:
  - readFileSync(config.json)                // config okunuyor
  - sprint çalışıyor
  - writeIpcStatus/Result/Error (ipcDir)     // status güncelleniyor
  - exit                                     // ← BURADA CLEANUP GEREKİYOR
  ↓
IPC DİZİNİ KALIYOR (BUG)
```

### Doğru Fix — `src/mcp/tools/start.ts`

```typescript
import { rmSync } from 'node:fs';

// ... fork() sonrası:
const child = fork(runnerPath, [ipcDir], {
  detached: true,
  stdio: 'ignore',
  cwd: root,
});

child.on('exit', (code) => {
  if (code === 0) {
    // Sprint başarıyla bitti — IPC artık gereksiz
    try { rmSync(ipcDir, { recursive: true, force: true }); } catch {}
  }
  // code !== 0 → IPC bırakılır (debug için), pre-flight temizler
});

child.unref();
```

### 2 Satır İle Bug Çözülür
Sprint 145 M7.3 (MCP server cleanup) tam bu fix. M7.2 (pre-flight orphan cleanup) yedek savunma — eski orphan'ları temizler.

### Neden `code === 0` Koşulu?
- **Success:** IPC tamamlanmış, tüm status yazılmış, client result okumuş → silinebilir
- **Failure:** IPC'de `sprint-runner-error.json` olabilir, debug için birkaç saat/gün kalmasında fayda var (pre-flight sonunda zaten siler)

### Sprint 143 T-143-012 Post-Mortem
Sprint 143 debt #5 (MCP integration test eksik) ironik şekilde **bu bug'ı tespit edecek test'ti**. Sprint 144 T-144-024 o testi yazdı, ama **test writer bug'ı gördü ama fix yapmadı** (scope dışı). Sprint 145 M7'de fix zaten planlı.

### Update — M7.A MANUEL ÇÖZÜLDÜ (2026-04-17 13:52 UTC)

**M7.A — ✅ MANUAL FIX Sprint 144 canlı sırasında, Sprint 145'e dahil DEĞİL:**

Alperen direktifi: *"sprint 145ten önce bunu manuel olarak cc düzeltsin sprint145e bu eklenmesin"*

CC tarafından yapılan değişiklikler:
1. `src/mcp/tools/start.ts:4` — `rmSync` import eklendi
2. `src/mcp/tools/start.ts:136-140` — `child.on('exit', ...)` cleanup listener eklendi
3. `tsc --noEmit` PASS
4. `dist/mcp/tools/start.js` otomatik rebuild (16:50 timestamp)
5. **477 mevcut orphan IPC dizini temizlendi** (Sprint 144 aktif `sprint-1776429182356-ipc` korundu)

**Kalan M7 Sprint 145 görevleri:**

**M7.B (Sprint 145 P1, T-144-018 extension):** Pre-flight orphan cleanup IPC dizinlerini de kapsa. M7.A sonrası yeni orphan birikmemeli ama pre-flight **yedek savunma** olarak IPC dizinlerini de tarasın (MCP server crash gibi edge case'ler için).

**M7.C (Sprint 145 P2, defense-in-depth):** `sprint-runner-entry.ts` `process.on('exit')` self-cleanup. Child kendisi de silsin — `start.ts` tarafındaki listener çalışmazsa yedek.

### Alperen Direktifi Özeti (2026-04-17)
> "hala bu sprint-*-ipc dosyaları oluşmaya devam ediyor. içeriğide böyle {projectRoot:/workspace, jobId:..., autoApprove:true} kök neden bulaım."
> → "sprint 145ten önce bunu manuel olarak cc düzeltsin sprint145e bu eklenmesin. izlemeye devam"

**Sonuç:**
- Kök neden tespit: `src/mcp/tools/start.ts:128` fork sonrası `child.on('exit', () => rmSync(ipcDir))` eksikti. Sprint 143 T-143-012 tasarım ihmali.
- **Manuel fix canlı, build geçti, orphan'lar temizlendi.** Sprint 145'e sadece M7.B (P1) ve M7.C (P2) kaldı — yedek savunma katmanları.
