# MCP-GUIDE — Deckent MCP Kullanım Kılavuzu

> **Blueprint Referansı:** §21 MCP Server Architecture, §3 Native CLI & Installation, §20 Claude Code Integration Guide

Deckent, [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) üzerinden Claude Code ve diğer MCP-uyumlu IDE'lere entegre olur. MCP sunucu stdio transport ile çalışır — ekstra kimlik doğrulama gerekmez. Claude Code, Deckent araçlarını doğal konuşma akışı içinde çağırır.

---

## İçindekiler

1. [MCP Sunucu Mimarisi](#mcp-sunucu-mimarisi)
2. [Kurulum ve IDE Entegrasyonu](#kurulum-ve-ide-entegrasyonu)
   - [Claude Code](#claude-code)
   - [VS Code (Cline / Continue)](#vs-code)
   - [Cursor](#cursor)
3. [37 MCP Tool Referansı](#37-mcp-tool-referansı)
   - [deckent_init](#1-deckent_init)
   - [deckent_set_directives](#2-deckent_set_directives)
   - [deckent_plan](#3-deckent_plan)
   - [deckent_start](#4-deckent_start)
   - [deckent_status](#5-deckent_status)
   - [deckent_doctor](#6-deckent_doctor)
   - [deckent_retro](#7-deckent_retro)
   - [deckent_history](#8-deckent_history)
   - [deckent_analyze_project](#9-deckent_analyze_project)
   - [deckent_sync](#10-deckent_sync)
4. [8 MCP Resource Referansı](#8-mcp-resource-referansı)
   - [deckent://dashboard](#1-deckentdashboard)
   - [deckent://directives](#2-deckentdirectives)
   - [deckent://memory](#3-deckentmemory)
   - [deckent://debt](#4-deckentdebt)
   - [deckent://config](#5-deckentconfig)
   - [deckent://retro](#6-deckentretro)
   - [deckent://tasks](#7-deckenttasks)
   - [deckent://agents](#8-deckentagents)
5. [Tipik Kullanım Akışları](#tipik-kullanım-akışları)

---

## MCP Sunucu Mimarisi

```
Claude Code / IDE (MCP client)
         │
         │  stdio transport
         ▼
deckent-mcp process (src/mcp/server.ts)
    ├── 37 Tools  (src/mcp/tools/)
    └──  8 Resources (src/mcp/resources/)
         │
         ▼
Deckent Core Engine
(brain.ts, planner.ts, auditor.ts, worker.ts, analyzer.ts)
```

MCP sunucusu `deckent-mcp` binary'si olarak yayınlanır. `deckent init` komutu bu binary'yi projenin `.claude/settings.json` dosyasına otomatik olarak kaydeder.

---

## Kurulum ve IDE Entegrasyonu

### Önkoşullar

```bash
npm install -g deckent
# veya
npx deckent --version
```

### Claude Code

#### Otomatik Kayıt (Önerilen)

`deckent init` çalıştırıldığında proje kökünde `.claude/settings.json` otomatik oluşturulur/güncellenir:

```json
{
  "mcpServers": {
    "deckent": {
      "command": "deckent-mcp",
      "args": []
    }
  }
}
```

Kayıt başarılıysa Claude Code'u yeniden başlatın — araçlar `deckent_` prefix'iyle hazır olacaktır.

#### Manuel Kayıt

```bash
# Proje düzeyinde (sadece bu proje için)
cat > .claude/settings.json << 'EOF'
{
  "mcpServers": {
    "deckent": {
      "command": "deckent-mcp",
      "args": []
    }
  }
}
EOF

# Global düzey (tüm projeler için)
# ~/.claude/settings.json dosyasına aynı mcpServers bloğunu ekleyin
```

#### Doğrulama

Claude Code terminalinde:
```
/mcp
```
Çıktıda `deckent` sunucusunu ve bağlı tool sayısını görmelisiniz.

---

### VS Code

VS Code'da MCP desteği için **Cline** veya **Continue** eklentisi kullanın.

#### Cline ile

1. Cline eklentisini yükleyin (VS Code Marketplace)
2. Cline ayarlarını açın: `Ctrl+Shift+P` → `Cline: Open Settings`
3. MCP sunucu ekleyin:

```json
{
  "mcpServers": {
    "deckent": {
      "command": "deckent-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

4. Cline'ı yeniden başlatın.

#### Continue ile

`~/.continue/config.json` dosyasına ekleyin:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "deckent-mcp",
          "args": []
        }
      }
    ]
  }
}
```

---

### Cursor

1. Cursor Ayarları'nı açın: `Ctrl+,` → MCP sekmesi
2. "Add MCP Server" butonuna tıklayın
3. Şu değerleri girin:
   - **Name:** `deckent`
   - **Command:** `deckent-mcp`
   - **Args:** (boş bırakın)
4. Kaydedin ve Cursor'ı yeniden başlatın.

Alternatif olarak `~/.cursor/mcp.json` dosyasına ekleyin:

```json
{
  "mcpServers": {
    "deckent": {
      "command": "deckent-mcp",
      "args": []
    }
  }
}
```

---

## 37 MCP Tool Referansı

Tüm tool'lar `src/mcp/tools/` altında tanımlanmıştır. Tam araç listesi ve açıklamaları için `docs/reference/mcp-tools.md` (otomatik oluşturulur) veya `mcp-overview.md` bölümüne bakın. Aşağıdaki tablo en sık kullanılan **10 temel aracı** kapsar:

| Tool | Dosya | Amaç |
|------|-------|-------|
| `deckent_init` | init.ts | Projeyi başlatır |
| `deckent_set_directives` | directives.ts | DIRECTIVES.md yazar |
| `deckent_plan` | plan.ts | Sprint planlar (dry-run) |
| `deckent_start` | start.ts | Sprint başlatır (arka plan) |
| `deckent_status` | status.ts | Anlık sprint durumu |
| `deckent_doctor` | doctor.ts | Sağlık kontrolü |
| `deckent_retro` | retro.ts | Son retrospektif |
| `deckent_history` | history.ts | Sprint geçmişi |
| `deckent_analyze_project` | analyze.ts | Proje analizi |
| `deckent_sync` | sync.ts | Adapter dosyaları senkronize eder |

---

### 1. deckent_init

**Amaç:** Proje kökünde Deckent yapısını oluşturur. `.deckent/`, `.brain/`, `.tasks/`, `.locks/`, `.claude/rules/` dizinlerini ve config dosyalarını yaratır.

**Parametreler:**

| Parametre | Tip | Zorunlu | Varsayılan | Açıklama |
|-----------|-----|---------|-----------|----------|
| `projectName` | string | Evet | — | Proje adı (DECKENT.md başlığında kullanılır) |
| `mode` | enum | Hayır | `performance` | Plan modu: `performance`, `balanced`, `economic`, `api` (legacy: `max_plan`, `max5x_plan`, `pro_plan`) |
| `language` | enum | Hayır | `en` | Ajan prompt dili: `en`, `tr` |

**Örnek Çağrı:**

```json
{
  "tool": "deckent_init",
  "arguments": {
    "projectName": "my-app",
    "mode": "performance",
    "language": "en"
  }
}
```

**Beklenen Çıktı:**

```json
{
  "success": true,
  "created": [
    ".deckent/",
    ".brain/",
    ".tasks/",
    ".locks/",
    ".claude/rules/",
    ".deckent/config.json",
    "DECKENT.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".claude/settings.json"
  ],
  "mode": "performance",
  "language": "en",
  "projectName": "my-app"
}
```

**Kaynak:** `src/mcp/tools/init.ts` | Blueprint §3, §18

---

### 2. deckent_set_directives

**Amaç:** `DIRECTIVES.md` içeriğini yazar. Claude, kullanıcının doğal dil hedeflerini `## Görev N:` / `## Task N:` blokları formatında yapılandırır.

**Parametreler:**

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `content` | string | Evet | `## Görev/Task N:` bloklarını içeren formatlanmış DIRECTIVES.md içeriği |

**Örnek Çağrı:**

```json
{
  "tool": "deckent_set_directives",
  "arguments": {
    "content": "# DIRECTIVES — Sprint 1\n\n## Task 1: Auth API\n- File: src/auth/index.ts\n- Scope: src/auth/\n\n### Description\nImplement JWT-based authentication endpoint.\n"
  }
}
```

**Beklenen Çıktı:**

```json
{
  "success": true,
  "taskCount": 1
}
```

**Not:** `taskCount` `## Görev` veya `## Task` header'larını sayar. Brain bu sayıyı sprint planlamasında kullanır.

**Kaynak:** `src/mcp/tools/directives.ts` | Blueprint §21 (Key Design Decision)

---

### 3. deckent_plan

**Amaç:** Mevcut `DIRECTIVES.md` içeriğine göre sprint planlar. Çalıştırmadan yalnızca görev listesi ve öneri döndürür (her zaman dry-run).

**Parametreler:**

| Parametre | Tip | Zorunlu | Varsayılan | Açıklama |
|-----------|-----|---------|-----------|----------|
| `dryRun` | boolean | Hayır | `true` | Her zaman true — plan tool çalıştırmaz |
| `mode` | enum | Hayır | config'den | Planlama modu: `ai`, `structured`, `auto` |

**Örnek Çağrı:**

```json
{
  "tool": "deckent_plan",
  "arguments": {
    "mode": "ai"
  }
}
```

**Beklenen Çıktı:**

```json
{
  "sprintId": "sprint-018",
  "sprintNumber": 18,
  "tasks": [
    { "id": "018-001", "title": "Auth API", "model": "sonnet", "priority": "HIGH" },
    { "id": "018-002", "title": "DB Schema", "model": "haiku", "priority": "NORMAL" }
  ],
  "recommendation": {
    "size": 4,
    "maxWorkers": 4,
    "reason": "Performance mode: up to 5 parallel workers"
  },
  "reasoning": "Tasks prioritized by dependency and complexity.",
  "planningMode": "ai"
}
```

**Kaynak:** `src/mcp/tools/plan.ts` | Blueprint §7, §21

---

### 4. deckent_start

**Amaç:** Tam sprint yaşam döngüsünü arka planda başlatır: plan → spawn → execute → evaluate → retro → cleanup. Hemen bir `jobId` döndürür; ilerlemeyi `deckent_status` ile takip edin.

**Parametreler:**

| Parametre | Tip | Zorunlu | Varsayılan | Açıklama |
|-----------|-----|---------|-----------|----------|
| `autoApprove` | boolean | Hayır | `false` | Worker işlemlerini otomatik onayla (`--dangerously-skip-permissions`) |

**Örnek Çağrı:**

```json
{
  "tool": "deckent_start",
  "arguments": {
    "autoApprove": false
  }
}
```

**Beklenen Çıktı (anında):**

```json
{
  "success": true,
  "jobId": "sprint-1710768000000",
  "status": "RUNNING",
  "message": "Sprint started in background. Use deckent_status to track progress."
}
```

**Not:** Sprint arka planda çalışır (`child_process.fork()`). MCP zaman aşımı olmaz. İş durumu `.deckent/jobs/{jobId}.json` dosyasına yazılır.

**Kaynak:** `src/mcp/tools/start.ts` | Blueprint §7, §21, Sprint 17 (background jobs)

---

### 5. deckent_status

**Amaç:** Anlık sprint dashboard durumunu döndürür. Ajan durumları, ilerleme, kullanım metrikleri, uyarılar ve arka plan iş durumu.

**Parametreler:** Yok

**Örnek Çağrı:**

```json
{
  "tool": "deckent_status",
  "arguments": {}
}
```

**Beklenen Çıktı (sprint aktifken):**

```json
{
  "active": true,
  "sprintId": "sprint-018",
  "phase": "EXECUTE",
  "agents": [
    { "taskId": "018-001", "status": "EXECUTING", "model": "sonnet", "lastHeartbeat": "..." },
    { "taskId": "018-002", "status": "DONE", "model": "haiku" }
  ],
  "progress": { "total": 4, "done": 1, "failed": 0, "running": 1 },
  "alerts": [],
  "job": {
    "jobId": "sprint-1710768000000",
    "status": "RUNNING",
    "startedAt": "2026-03-18T10:00:00.000Z"
  }
}
```

**Beklenen Çıktı (sprint yokken):**

```json
{
  "active": false,
  "message": "No active sprint.",
  "job": null
}
```

**Kaynak:** `src/mcp/tools/status.ts` | Blueprint §21

---

### 6. deckent_doctor

**Amaç:** Deckent sağlık kontrollerini çalıştırır: Node.js, git, tmux, Claude CLI, workspace, brain budget, debt, locks.

**Parametreler:** Yok

**Örnek Çağrı:**

```json
{
  "tool": "deckent_doctor",
  "arguments": {}
}
```

**Beklenen Çıktı:**

```json
{
  "ok": true,
  "checks": [
    { "name": "node_version", "status": "ok", "detail": "v24.x (>=24.0.0 required)" },
    { "name": "git", "status": "ok", "detail": "git 2.43.0" },
    { "name": "tmux", "status": "ok", "detail": "tmux 3.3a" },
    { "name": "claude_cli", "status": "ok", "detail": "claude 1.2.3" },
    { "name": "workspace", "status": "ok", "detail": ".deckent/ found" },
    { "name": "brain_budget", "status": "ok", "detail": "185/600 lines" },
    { "name": "debt", "status": "warning", "detail": "3 open debt items" },
    { "name": "stale_locks", "status": "ok", "detail": "No stale locks" }
  ]
}
```

**`ok` alanı:** Sadece `required` statüslü kontroller başarısız olduğunda `false` döner. `warning` durumu `ok: true` döndürür.

**Kaynak:** `src/mcp/tools/doctor.ts` | Blueprint §16

---

### 7. deckent_retro

**Amaç:** `.brain/memory.db` üzerinden en son sprint retrospektifini okur (type=`retro`). DB-first — legacy `.brain/RETRO.md` dosyası artık üretilmez.

**Parametreler:** Yok

**Örnek Çağrı:**

```json
{
  "tool": "deckent_retro",
  "arguments": {}
}
```

**Beklenen Çıktı:**

```json
{
  "content": "# Sprint 17 Retrospective\n\n## Completed\n- Background jobs via child_process.fork()\n- React test infra\n\n## Learnings\n- MCP deckent_start no longer times out\n..."
}
```

**Retrospektif yoksa:**

```json
{
  "content": null
}
```

**Kaynak:** `src/mcp/tools/retro.ts` | Blueprint §7 (RETRO phase)

---

### 8. deckent_history

**Amaç:** `.brain/sprints/` dizinindeki sprint geçmiş loglarını okur. Son N sprint'i döndürür.

**Parametreler:**

| Parametre | Tip | Zorunlu | Varsayılan | Açıklama |
|-----------|-----|---------|-----------|----------|
| `last` | number | Hayır | `5` | Döndürülecek son sprint sayısı |

**Örnek Çağrı:**

```json
{
  "tool": "deckent_history",
  "arguments": {
    "last": 3
  }
}
```

**Beklenen Çıktı:**

```json
{
  "sprints": [
    {
      "id": "sprint-015",
      "content": "# Sprint 015\n\n## Tasks\n- DECKENT.md independence...\n"
    },
    {
      "id": "sprint-016",
      "content": "# Sprint 016\n\n## Tasks\n- Watch mode, worker logs...\n"
    },
    {
      "id": "sprint-017",
      "content": "# Sprint 017\n\n## Tasks\n- Background jobs, React test...\n"
    }
  ]
}
```

**Kaynak:** `src/mcp/tools/history.ts` | Blueprint §24

---

### 9. deckent_analyze_project

**Amaç:** Proje stack'ini, boyutunu ve metodoloji önerisini analiz eder. Sadece okuma yapar (destructive değil, idempotent).

**Parametreler:** Yok

**Örnek Çağrı:**

```json
{
  "tool": "deckent_analyze_project",
  "arguments": {}
}
```

**Beklenen Çıktı:**

```json
{
  "stack": ["TypeScript", "Node.js", "vitest"],
  "size": {
    "files": 142,
    "linesOfCode": 8500,
    "testFiles": 38
  },
  "methodology": "sprint-parallel",
  "recommendation": {
    "planMode": "ai",
    "maxWorkers": 5,
    "reason": "Large TypeScript monorepo with test coverage — AI planning recommended"
  }
}
```

**Kaynak:** `src/mcp/tools/analyze.ts`, `src/core/analyzer.ts` | Blueprint §21, Sprint 15

---

### 10. deckent_sync

**Amaç:** Adapter dosyalarını (`CLAUDE.md`, `AGENTS.md`) `@DECKENT.md` referansıyla senkronize eder. Additive — mevcut içeriği asla silmez.

**Parametreler:** Yok

**Örnek Çağrı:**

```json
{
  "tool": "deckent_sync",
  "arguments": {}
}
```

**Beklenen Çıktı:**

```json
{
  "success": true,
  "synced": ["CLAUDE.md", "AGENTS.md"]
}
```

**DECKENT.md bulunamazsa:**

```json
{
  "success": false,
  "error": "DECKENT.md not found. Run deckent init first."
}
```

**Not:** `ensureDeckentImport()` fonksiyonu idempotent'tir — dosya eksikse oluşturur, referans yoksa başa ekler, referans varsa dokunmaz.

**Kaynak:** `src/mcp/tools/sync.ts`, `src/core/utils.ts` | Blueprint §21, Sprint 15

---

## 8 MCP Resource Referansı

Resource'lar IDE'nin context penceresine otomatik olarak dahil edilebilir. `deckent://` URI şemasını kullanırlar.

| Resource URI | MIME Tipi | Kaynak Dosya | Açıklama |
|---|---|---|---|
| `deckent://dashboard` | `application/json` | `.dashboard` | Anlık sprint durumu |
| `deckent://directives` | `text/markdown` | `DIRECTIVES.md` | Aktif sprint hedefleri |
| `deckent://memory` | `text/markdown` | `.brain/memory.db` (type=`memory`) | Öğrenilmiş desenler |
| `deckent://debt` | `application/json` | `.brain/memory.db` (type=`debt`) | Teknik borç kalemleri |
| `deckent://config` | `application/json` | `.deckent/config.json` | Proje konfigürasyonu |
| `deckent://retro` | `text/markdown` | `.brain/memory.db` (type=`retro`) | Son sprint retrospektifi |
| `deckent://tasks` | `application/json` | `.tasks/task-*.json` | Aktif görev listesi |
| `deckent://agents` | `application/json` | `.deckent/agents/*/agent.json` | Kayıtlı ajan havuzu |

---

### 1. deckent://dashboard

**Açıklama:** Auditor'ın her 30 saniyede bir yazdığı anlık sprint dashboard durumu.

**Kaynak Dosya:** `.dashboard` (JSON)

**Örnek Çıktı:**

```json
{
  "active": true,
  "sprintId": "sprint-018",
  "phase": "EXECUTE",
  "agents": [...],
  "progress": { "total": 10, "done": 6, "failed": 0, "running": 4 },
  "alerts": [],
  "updatedAt": "2026-03-18T10:15:30.000Z"
}
```

**Kaynak:** `src/mcp/resources/dashboard.ts` | Blueprint §21

---

### 2. deckent://directives

**Açıklama:** Aktif sprint için `DIRECTIVES.md` içeriği. Brain sprint planlamadan önce bu resource'u okur.

**Kaynak Dosya:** `DIRECTIVES.md` (Markdown)

**Örnek Çıktı:**

```markdown
# DIRECTIVES — Sprint 18

## Task 1: Auth API
- File: src/auth/index.ts
...
```

**Kaynak:** `src/mcp/resources/directives.ts` | Blueprint §21

---

### 3. deckent://memory

**Açıklama:** Önceki sprintlerden öğrenilen desenler. `.brain/memory.db` üzerinden DB-first okur (type=`memory`). Brain her sprint başında bu resource'u okur. Veritabanı yoksa boş string döner.

**Kaynak Dosya:** `.brain/memory.db` (type=`memory`)

**Örnek Çıktı:**

```markdown
# Learned Patterns

## Wave 1 Learnings (Sprint 1)
- @types/node is required as devDependency...
- tsconfig.json needs "types": ["node"]...
```

**Kaynak:** `src/mcp/resources/memory.ts` | Blueprint §6, §21

---

### 4. deckent://debt

**Açıklama:** `memory.db debt entries` — parse edilmiş teknik borç kalemleri. JSON array formatında döner.

**Kaynak Dosya:** `memory.db debt entries` (exported to `.brain/exports/debt.md`)

**Örnek Çıktı:**

```json
[
  {
    "id": "DEBT-001",
    "description": "sleepSync → async sleep migration",
    "severity": "medium",
    "sprint": "sprint-002",
    "status": "resolved"
  },
  {
    "id": "DEBT-003",
    "description": "Dashboard WebSocket upgrade",
    "severity": "low",
    "sprint": "sprint-017",
    "status": "open"
  }
]
```

**Kaynak:** `src/mcp/resources/debt.ts` | Blueprint §8

---

### 5. deckent://config

**Açıklama:** `.deckent/config.json` proje konfigürasyonu. Plan modu, dil ve diğer ayarları içerir.

**Kaynak Dosya:** `.deckent/config.json` (JSON)

**Örnek Çıktı:**

```json
{
  "mode": "performance",
  "language": "en",
  "projectName": "my-app",
  "brain_planning": "ai",
  "last_sprint_id": 18
}
```

**Kaynak:** `src/mcp/resources/config.ts` | Blueprint §21

---

### 6. deckent://retro

**Açıklama:** Son sprint retrospektifi. `.brain/memory.db` üzerinden DB-first okur (type=`retro`, ilk kayıt). Retrospektif yoksa boş string döner.

**Kaynak Dosya:** `.brain/memory.db` (type=`retro`)

**Örnek Çıktı:**

```markdown
# Sprint 345 Retrospective

## Gains
- Doc refresh pipeline completed in one sprint
- VitePress dead-link gate now green

## Losses
- Two tasks required FIX iteration due to stale ADR descriptions

## Decisions
- ADR-093: dead-link enforcement added to CI
```

**Kaynak:** `src/mcp/resources/retro.ts` | Blueprint §7 (RETRO phase)

---

### 7. deckent://tasks

**Açıklama:** `.tasks/task-*.json` dosyalarından ayrıştırılan aktif görev listesi. Sprint yokken `{ tasks: [] }` döner.

**Kaynak Dosya:** `.tasks/task-*.json` (JSON)

**Örnek Çıktı:**

```json
{
  "tasks": [
    {
      "id": "346-001",
      "title": "Fix overview",
      "status": "DONE",
      "model": "sonnet",
      "priority": "HIGH"
    },
    {
      "id": "346-002",
      "title": "Fix guide",
      "status": "EXECUTING",
      "model": "sonnet",
      "priority": "NORMAL"
    }
  ]
}
```

**Kaynak:** `src/mcp/resources/tasks.ts`

---

### 8. deckent://agents

**Açıklama:** `.deckent/agents/*/agent.json` dosyalarından kayıtlı ajan havuzu. Yerleşik ajanlar bellekte tutulur; yalnızca özel/geçici ajanlar dosya olarak görünür.

**Kaynak Dosya:** `.deckent/agents/*/agent.json` (JSON)

**Örnek Çıktı:**

```json
{
  "agents": [
    {
      "id": "doc-writer",
      "title": "Doc Writer",
      "domains": ["docs"],
      "totalUses": 28,
      "successRate": 0.21
    },
    {
      "id": "api-builder",
      "title": "API Builder",
      "domains": ["api", "backend"],
      "totalUses": 14,
      "successRate": 0.86
    }
  ]
}
```

**Kaynak:** `src/mcp/resources/agents.ts`

---

## Tipik Kullanım Akışları

### Akış 1: İlk Kurulum

```
Kullanıcı: "Set up Deckent for my TypeScript project"
Claude:
  1. deckent_doctor()         → sağlık kontrolü
  2. deckent_analyze_project() → proje analizi
  3. deckent_init({ projectName: "my-app", mode: "performance" })
  4. deckent_sync()            → CLAUDE.md + AGENTS.md güncellenir
```

### Akış 2: Sprint Başlatma

```
Kullanıcı: "I want to add authentication and a user profile page"
Claude:
  1. deckent_set_directives({ content: "## Task 1: Auth..." })
  2. deckent_plan()           → görev listesini göster
  Kullanıcı onaylar
  3. deckent_start()          → { jobId: "sprint-..." }
  4. deckent_status()         → (periyodik kontrol)
```

### Akış 3: Sprint Takibi

```
Kullanıcı: "How's the sprint going?"
Claude:
  1. deckent_status()  → anlık durum
  2. deckent://dashboard resource → detaylı dashboard
```

### Akış 4: Retrospektif ve Öğrenme

```
Kullanıcı: "What did we learn from the last sprint?"
Claude:
  1. deckent_retro()      → son retrospektif
  2. deckent://memory     → öğrenilmiş desenler
  3. deckent_history({ last: 3 }) → son 3 sprint logu
```

### Akış 5: Sorun Giderme

```
Kullanıcı: "Deckent doesn't seem to work"
Claude:
  1. deckent_doctor()     → sağlık kontrolü
  2. deckent://config     → mevcut konfigürasyon
  3. deckent_sync()       → adapter dosyalarını düzelt
```

---

## Hata Durumları

| Durum | Hata | Çözüm |
|-------|------|-------|
| Config bulunamadı | `Config not found. Run deckent init first.` | `deckent_init()` çalıştırın |
| DECKENT.md yok | `DECKENT.md not found. Run deckent init first.` | `deckent_init()` çalıştırın |
| Dashboard parse hatası | `Cannot parse dashboard file.` | Sprint aktif değil veya `.dashboard` bozuk |
| Sprint başlatma hatası | `Sprint failed at phase X: <message>` | `deckent_doctor()` ile sağlık kontrolü yapın |

---

## Blueprint Referansları

| Bölüm | Konu |
|-------|------|
| §3 Native CLI & Installation | `deckent-mcp` binary kurulumu |
| §20 Claude Code Integration Guide | IDE entegrasyon adımları |
| §21 MCP Server Architecture | Tool ve resource tam tablosu |
| §15 Security & Permissions | Tool izin modeli |
| §16 Self-Test & Reporting | `deckent_doctor` detayları |
| §7 Sprint Lifecycle | `deckent_start` yaşam döngüsü |
| §6 Memory Architecture | `deckent://memory` resource formatı |
| §8 GO/NO-GO Protocol | `deckent_status` değerlendirme kriterleri |
