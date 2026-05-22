# CLI / MCP Parity Gap Report

**Tarih:** 2026-04-17 (Sprint 144 pre-flight)
**Kapsam:** ADR-022-v2 "CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar" direktifi ihlali envanteri.

## Özet

- **CLI komut sayısı:** 42 (`src/cli/commands/*.ts`)
- **CLI registrasyon sayısı:** 38 (`src/cli/index.ts`)
- **MCP tool sayısı:** 22 (`src/mcp/tools/*.ts`, `server.registerTool` call'ları)
- **Parity eksikliği:** **~18 CLI komut MCP'de yok**

## Parity Matrisi

### ✅ Tam Parity (22)

| CLI | MCP Tool |
|---|---|
| `deckent init` | `deckent_init` |
| `deckent set-directives` | `deckent_set_directives` |
| `deckent plan` | `deckent_plan` |
| `deckent start` | `deckent_start` |
| `deckent status` | `deckent_status` |
| `deckent review` | `deckent_review` |
| `deckent retro` | `deckent_retro` |
| `deckent history` | `deckent_history` |
| `deckent doctor` | `deckent_doctor` |
| `deckent analyze` | `deckent_analyze_project` |
| `deckent sync` | `deckent_sync` |
| `deckent config` | `deckent_config` |
| `deckent run` | `deckent_run` |
| `deckent kill` | `deckent_kill` |
| `deckent cleanup` | `deckent_cleanup` |
| `deckent help` (commander) | `deckent_help` |
| `deckent agent` | `deckent_agent_list` |
| `deckent skill` | `deckent_skill_list` |
| `deckent checkpoint` | `deckent_checkpoint` |
| `deckent docs` | `deckent_docs` |
| `deckent explain` | `deckent_explain` |
| `deckent recall` | `deckent_memory_query` |

### ❌ Parity Eksik — CLI'da Var, MCP'de Yok (18)

| # | CLI Komut | Dosya | Öncelik | MCP'de Neden Gerekli |
|---|---|---|---|---|
| 1 | `deckent remember` | remember.ts | HIGH | Memory V2 write operasyonu — okuma (memory_query) var, yazma yok |
| 2 | `deckent memory rebuild/export/stats` | memory.ts | HIGH | Memory V2 maintenance, DB-first mimaride kritik |
| 3 | `deckent cost` | cost.ts | HIGH | Sprint 141 cost management — subs mode threshold sorgulama MCP'den yapılamıyor |
| 4 | `deckent resume` | resume.ts | HIGH | Sprint 138 T-009 long-running resume — MCP'den tetiklenemiyor |
| 5 | `deckent finalize` | finalize.ts | HIGH | Manuel sprint finalize (Seçenek C) — MCP'den tetiklenemiyor |
| 6 | `deckent archive-debt` | archive-debt.ts | NORMAL | Debt DB resolve workflow |
| 7 | `deckent dashboard` | dashboard.ts | NORMAL | Dashboard yönetim — `deckent://dashboard` resource var ama `dashboard start/stop` yok |
| 8 | `deckent onboard` | onboard.ts | NORMAL | First-time user flow |
| 9 | `deckent upgrade` | upgrade.ts | NORMAL | Version migration |
| 10 | `deckent plugin` | plugin.ts | NORMAL | Plugin yönetim |
| 11 | `deckent attach` | attach.ts | LOW | tmux worker attach (terminal-spesifik, MCP karşılığı zor) |
| 12 | `deckent spawn` | spawn.ts | LOW | Tek task spawn (run ile çakışıyor olabilir) |
| 13 | `deckent watch` | watch.ts | LOW | File watcher (interactive, MCP karşılığı zor) |
| 14 | `deckent serve` | serve.ts | LOW | HTTP API server başlatma |
| 15 | `deckent web` | web.ts | LOW | Web dashboard başlatma |
| 16 | `deckent test-run` | test-run.ts | LOW | Test harness |
| 17 | `deckent skill-marketplace` | skill-marketplace.ts | LOW | Skill marketplace (deneysel) |
| 18 | `deckent quick-start` | quick-start.ts | LOW | Onboard kısayolu (interactive) |

### İç Komutlar (MCP karşılığı beklenmiyor)

| Komut | Dosya | Sebep |
|---|---|---|
| `deckent heartbeat` | heartbeat.ts | Worker-internal, user'a direkt açık değil |
| `deckent output` | output.ts | Worker helper |

## Önerilen Aksiyon Planı — Sprint 145'e Taşıma

**Sprint 145 Debt Listesi — MCP Parity Completion:**

1. **P0 (HIGH × 5):** `remember`, `memory`, `cost`, `resume`, `finalize` — bunlar Memory V2 + sprint lifecycle core operasyonları, MCP'den erişilmezse Claude Code/Cursor ortamlarında iş akışı eksik kalıyor.
2. **P1 (NORMAL × 5):** `archive-debt`, `dashboard`, `onboard`, `upgrade`, `plugin`.
3. **P2 (LOW × 8):** İnteractive/terminal-spesifik komutlar — MCP karşılığı tasarım değişikliği gerektirebilir, düşük öncelik.

## Kanıt Komutları

```bash
# CLI komut dosya sayısı
ls src/cli/commands/*.ts | wc -l  # → 42

# CLI registrasyon sayısı
grep -c "register.*program" src/cli/index.ts  # → 38

# MCP tool registrasyon sayısı
grep -r "server.registerTool" src/mcp/tools/ | wc -l  # → 22

# Parity gap hesabı
# 38 registrasyon - 22 MCP tool = 16 parity eksikliği
# (Ayrıca "memory" ve "help" CLI'da da var ama MCP'de farklı isimde)
```

## Sprint 144 İle İlgisi

Bu parity eksikliği **Sprint 144 DIRECTIVES kapsamında değil**. Sprint 144 God Split + Cycle 2 + Perf + Operasyonel HIGH + Debt Liquidation'a odaklanıyor.

**Sprint 145 retro'ya giriş:** Bu rapor Sprint 145 pre-flight'ta debt listesi olarak tekrar okunacak.

---

**Ref:** ADR-022-v2, MEMORY.md → `project_adr022_cli_mcp_parity.md`
**Oluşturan:** Koordinatör (Sprint 144 pre-flight audit, 2026-04-17)

---

## 🐛 Sprint 144 Pre-flight'ta Tespit Edilen CANLI CLI BUG (2026-04-17)

**Bulgu:** `src/cli/commands/resume.ts` içinde `registerResume(program)` export fonksiyonu mevcut ama `src/cli/index.ts`'e **ne import edilmiş ne de çağrılmış**. `deckent resume <sprintId>` komutu CLI'da çalışmıyor.

**Kanıt:**
```bash
grep "registerResume" src/cli/index.ts  # → 0 sonuç
grep "import.*resume" src/cli/index.ts  # → 0 sonuç
node dist/cli/entry.js resume --help    # → top-level help dönüyor (resume komutu tanınmıyor)
```

**Etki:** Sprint 138 T-009 Long-Running Resume Capability MVP runtime wire eksik. Uzun süren sprint'lerde checkpoint-based resume **canlı değil** (fonksiyon yazıldı ama commander'a register edilmedi).

**Sprint 145 debt:**
- **P0:** `src/cli/index.ts`'e `import { registerResume } from './commands/resume.js';` + `registerResume(program);` ekle (2 satır fix).
- **P0:** Bu tarz unregistered command regresyonlarını yakalamak için **CLI registration test harness** (tüm `src/cli/commands/*.ts` dosyaları `registerXxx` export ediyor mu + `index.ts`'te register ediliyor mu doğrula).

**Kayıt zamanı:** Sprint 144 canlı çalışırken (koordinatör CLI smoke test sırasında), 2026-04-17 12:43 UTC.

---

## 🐛 Sprint 144 T-144-002 Kısmi Tamamlama — Sprint 145 Debt (2026-04-17 12:46 UTC)

**Bulgu:** T-144-002 (doctor.ts split) `selfAssessment: DONE` + `scope_compliance: 100` kazandı ama **DIRECTIVES'in ikinci hedefi tam değildi**. Worker raporunda dürüstçe açıkladı:

> "DEBT.md V1 parse → DB migration bu scope'ta yapılmadı çünkü `countDebtItems`/`countOpenDebtItems` 7+ dosyadan import ediliyor ve onları değiştirmek scope dışı regresyon riski taşıyor."

**Sebep:** DIRECTIVES'te "DEBT.md V1 parse kaldırılır → `store.getByType('debt')`" hedefi doctor.ts dosyasında gerçek olarak yoktu (pattern başka yerlerden gelen helper'da). Worker scope disiplini doğru uyguladı, hedef tam değildi.

**Sprint 145 debt:**
- **P1:** "Memory V2 DEBT.md V1 parse countDebtItems helper migration" task'ı (7+ call-site + helper'ı DB-first `store.getByType('debt')` ile değiştir). Tahmini effort normal.
- **P2:** DIRECTIVES yazımında kanıt komutlarının **literal grep yerine functional assertion** olması prensibi (örn. "`countDebtItems` helper function artık `store.getByType('debt')` kullanıyor" test'i).

**Kanıt:** T-144-002 result'ında `notes` alanı + worker honest assessment v2 pattern'i canlı.
