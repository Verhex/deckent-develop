# Sprint 171 — Self-Audit Mega-Sprint — Design Spec

**Tarih:** 2026-05-15
**Durum:** Brainstorming çıktısı — Alperen onaylı (Bölüm 1-4)
**Predecessor:** Sprint 170 GO_WITH_TECH_DEBT (`5ffbf3e`), bootstrap fix `5436497` (runtime aktif: `npm run build` + MCP restart yapıldı 2026-05-15)
**Successor:** Sprint 172 OSS GA (bu audit'in bulgu defteri + doc-reorg planı + AEGIS manifestosu girdisi)
**Methodology referans:** AEGIS (ADR-061, proposed) — self-audit, AEGIS'in ADVERSE+REVIEW fazlarının dogfood'u

---

## 1. Amaç

Bootstrap fix runtime'da aktifken deckent'in kendini **tam-kapsamlı** denetlemesi. İki paralel hedef:

1. **Meta-dogfood ispatı:** Spurious NO_GO 2-katmanlı RC fix'i (Sprint 169 P0-1 schema gate + P0-2 protocol allowlist) production'da çalışıyor — 29 task, çeşitli agent, 0 cascade.
2. **OSS GA bulgu defteri:** Kod + doküman + DB'nin doğruluk/gereklilik/içerik/referans denetimi; Sprint 172 public flip öncesi prioritized backlog + kusursuz doküman yapısı temeli.

Kullanıcı direktifi: "1 virgül bile deckent totalde görmemiş olmamalı" — her src/tests/scripts dosyası tam 1 modül-task'a ait, coverage-map ile mekanik ispat.

## 2. Kapsam Kararları (Brainstorming Q&A — kilitli)

| # | Karar | Değer |
|---|---|---|
| Q1 | Sprint yapısı | Tek mega-sprint 171 |
| Q2 | Çıktı path | `docs/audits/sprint-171/<name>.md` (kod-gerçeği revize — bkz §4) |
| Q3 | Doc audit derinliği | Tier'lı: aktif tam / sprint-log+autogen DB-sync / archive özet |
| Q4 | Code granülarite | Hibrit: modül-derin (14) + concern-cross-cutting (8) + coverage-map |
| Q5 | Badge taksonomi | 8-badge: core/necessary/guide/reference/info/internal/archive/deprecated |
| Q6 | Paralel cap | 8, Claude-only (OPENAI/GOOGLE key yok) |
| Q7 | Başarı tanımı | Dual-gate: orchestration-health + içerik-kalite eşiği |
| — | Çıktı dili | **Türkçe, insan-okur — her task'a explicit Türkçe-çıktı prompt direktifi (ATLANMAZ)** |

## 3. Audit-Only Invariant (her task ZORUNLU)

Kod gerçeğine dayalı (`src/orchestra/rubric-registry.ts` `isAuditTask` + `coverageOptional`):

- `scope.filesWrite` = **tam 1 dosya**: `docs/audits/sprint-171/<name>.md`
- `scope.directories` = `["docs/audits/sprint-171/"]` — **src/tests/lib YASAK** (`SOURCE_CODE_PREFIXES` → `isAuditTask=false` → spurious NO_GO)
- `scope.filesRead` = **broad** (tüm repo) — `isAuditTask`'ı etkilemez, sadece `scope.directories` etkiler
- Sonuç: `detectTaskType → 'audit'` → `coverageOptional=true` **her agent için** → tasarım garantisiyle **0 spurious NO_GO** (P0-1 agent-allowlist'ine düşmez; `coverageOptional` satır 214: `detectTaskType(task) !== 'code-development'` → erken `true`)
- Kod/test modify **YASAK**, TDD **YOK**, fix worker spawn **YOK** (NO_GO'da bile — audit bulgusu worker-fixable değil)
- **Çıktı dili Türkçe, insan-okur, `file:line` kanıt zorunlu** — her task prompt'unda explicit direktif (atlanmaz; kullanıcı reinforced 2026-05-15)

## 4. Kritik Kod-Gerçeği Bulgusu (Q2 revizyon gerekçesi)

`isAuditTask(task)` üç şart (üçü de geçmeli):
1. `scope.filesWrite.length === 1`
2. `filesWrite[0]` `docs/audits/` ile başlar + `.md` biter
3. `scope.directories`'de hiç `src/`|`tests/`|`lib/` prefix yok

`.audit/self/` seçimi (Q2 ilk cevap) şart-2'yi ihlal ediyordu → `code-development` sınıflama → `coverageOptional` agent-allowlist'e düşer → data-engineer/ci-guardian/performance-analyzer/refactorer allowlist'te YOK → kitlesel spurious NO_GO. **Bu sprint'in ispatlamak istediği hedefi baltalıyordu.** Q2 `docs/audits/sprint-171/` olarak revize edildi — hem 0-spurious garantisi hem "/docs altına toplama" vizyonuyla hizalı. (Not: `isAuditTask`'ın hardcoded `docs/audits/` konvansiyonu ile kullanıcı zihin modeli `.audit/self/` uyumsuzluğu, 171-016 ADR-compliance audit'inin bir bulgusu olarak da kaydedilir.)

## 5. Task Taksonomisi (29 task)

**A. Modül-Derin (14)** — her task kendi dizinindeki HER dosyayı char-level okur, Kapsam Haritası zorunlu:

| ID | Kapsam | Agent | Skill |
|---|---|---|---|
| 171-001 | orchestra/ lifecycle (sprint-controller, brain, planner, task-builder, result-evaluator, result-collector, sprint-reporter, sprint-utils, decision-steps/) | architect | system-architect |
| 171-002 | orchestra/ routing+eval (task-router, outcome-tracker, quality-assessor, mid-sprint-adapter, rule-evolver, debt-manager, rubric-registry) | architect | typescript-expert |
| 171-003 | orchestra/ infra (tmux, spawn-backend, spawn-backend-docker, temp-skill-generator, promotion-pipeline, doc-updaters/, managed-docs/, event-stream, file-lock) | devops-engineer | docker-expert |
| 171-004 | core/ types+config (types.ts, *-types.ts, config.ts, model-registry, mode-presets, condition-evaluator, manifest-migrator) | architect | typescript-expert |
| 171-005 | core/ memory (memory-store, memory-query, memory-normalize, memory-types, memory-export, memory-import) | data-engineer | database-migration |
| 171-006 | core/ pools+routing (agent-pool, skill-pool, skill-registry, provider, routing-*, intent-classifier, activation-engine, builtins/, marketplace/, rule-templates/, notify-adapters/, notification-providers/) | architect | typescript-expert |
| 171-007 | agents/ (worker, adaptive-agent + tüm 20 modül) | architect | typescript-expert |
| 171-008 | nervous/ (observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, runtime-scope-check, history, detectors/) | architect | system-architect |
| 171-009 | monitor/ + connectors/ (auditor, dashboard-manager, sprint-state, discord/telegram/whatsapp/incoming-router) | architect | typescript-expert |
| 171-010 | providers/ + api/ (claude/codex/gemini adapter, HTTP server, SSE, rate-limit) | api-builder | api-builder |
| 171-011 | mcp/ (server, 27 tool, 8 resource, helpers/) | api-builder | api-builder |
| 171-012 | cli/ (55+ komut, helpers, entry) | architect | typescript-expert |
| 171-013 | dashboard/ (React+Vite+Tailwind, src/, analytics/, api/) | frontend-designer | react-specialist |
| 171-014 | extensions/vscode/ + scripts/ (45 script) | devops-engineer | devops-engineer |

**B. Concern Cross-Cutting (8)** — tüm kod tabanını enine keser:

| ID | Kapsam | Agent | Skill |
|---|---|---|---|
| 171-015 | Dead code: unused export, unreachable, ESM `.js` uzantı (Node16), import cycle/depth | refactorer | code-simplifier |
| 171-016 | ADR compliance: 46 ADR vs kod gerçeği (her biri enforced mı?) + doc-vs-reality drift (dependency_pipeline_enabled vs.) | architect | system-architect |
| 171-017 | Security: OWASP top 10, command injection, path traversal, spawnSync (ADR-006), secret leakage, .deck | security-auditor | security-specialist |
| 171-018 | Performance: sync I/O hot path, memory leak, async pattern, N+1 | performance-analyzer | performance-optimizer |
| 171-019 | Type safety: any/unknown, unsafe assertion, missing return type, strict ihlali | architect | typescript-expert |
| 171-020 | Error handling: yutulan hata, boundary try/catch eksiği, fail-safe/fallback pattern | architect | typescript-expert |
| 171-021 | Test integrity: 807 test gerçek coverage, flaky, mock drift, skipped, vitest baseline, dashboard test | ci-guardian | ci-testing |
| 171-022 | Memory V2 DB integrity: schema, FTS5 index, relations FK, decay, dual-layer normalize, entry_history, DB-vs-export drift | data-engineer | database-migration |

**C. Doc Audit Tier'lı (5):**

| ID | Kapsam | Agent | Skill |
|---|---|---|---|
| 171-023 | Root aktif 21 .md (README/VISION/ROADMAP/BLUEPRINT/BETA-TRACKER/COMPETITIVE/CHANGELOG/CONTRIBUTING/SECURITY/CODE_OF_CONDUCT/AGENTS/...) — doğruluk+gereklilik+içerik+referans + 8-badge | doc-writer | documentation-writer |
| 171-024 | docs/ ağacı 40 dosya (adr/architecture/guide/reference/vision/governance/) + Sprint 172 reorg yapı önerisi | doc-writer | documentation-writer |
| 171-025 | Config/contract/rules: .claude/.gemini/.cursor/rules/ (9), api-surface.md, CLAUDE.md, DECKENT.md, IDENTITY.md, BOOT.md — kod gerçeğiyle doğruluk denetimi | architecture-planner | system-architect |
| 171-026 | DB-sync check: .brain/sprints/*.md (33) + exports/*.md + DEBT/MEMORY/RETRO/PATTERNS vs memory.db — içerik audit DEĞİL, sync diff | data-engineer | database-migration |
| 171-027 | Archive özet: .brain/archive/, .deckent/archive/, .audit/sprint-167/169/, examples/, deckent-hub/, .test/ — dizin-bazlı ne/nekadar/sil-taşı-kal + 8-badge | doc-writer | documentation-writer |

**D. DB Karar/Referans Integrity (1):**

| ID | Kapsam | Agent | Skill |
|---|---|---|---|
| 171-028 | memory.db her entry (ADR/memory/sprint/debt/pattern/retro/identity), relations graph tamlığı, entry_history audit trail, kırık [[ref]], orphan, decay doğruluğu, ADR DB↔FS çift yön (Sprint 169 H1) | data-engineer | database-migration |

**E. Synthesis (1, manuel dispatch — Wave 5):**

| ID | Kapsam | Agent | Skill |
|---|---|---|---|
| 171-029 | 28 raporu konsolide: severity-sıralı backlog + OSS-GA (Sprint 172) blocker + AEGIS (ADR-061) hizalama + Sprint 172 doc-reorg planı (badge→/docs yapı) + coverage-map doğrulama | architect | system-architect |

**Model:** Hepsi `opus` (`feedback_model_selection_deckent` — Deckent kod=opus, audit derin analiz). **Effort:** modül+concern+doc `normal`, 171-028 `high`, 171-029 `high`.

## 6. Wave Yapısı

`dependency_pipeline_enabled: false` (config gerçeği — bu bir 171-016 bulgusu). Synthesis auto-unblock olmaz → Brain manuel wave dispatch (ADR-047, Sprint 164-168 kanıtlı). Config mutasyonu YOK.

| Wave | Task'lar | Adet |
|---|---|---|
| Wave 1 | 171-001..008 | 8 |
| Wave 2 | 171-009..014 + 171-015 + 171-016 | 8 |
| Wave 3 | 171-017..022 + 171-023 + 171-024 | 8 |
| Wave 4 | 171-025 + 171-026 + 171-027 + 171-028 | 4 |
| Wave 5 | 171-029 synthesis (Wave 4 tüm DONE sonrası manuel) | 1 |

Tahmini süre: 5 wave × ~20-30 dk = **2-3 saat**. Her wave sonrası Auditor `git diff --stat` — sadece `docs/audits/sprint-171/` değişmeli, başka path = boundary ihlal alarmı.

## 7. Coverage-Map Mekanizması

Her modül-derin task (171-001..014) raporunda zorunlu bölüm:

```markdown
## Kapsam Haritası (Files Covered)
| Dosya | LoC | Okundu | Not |
|---|---|---|---|
| src/orchestra/brain.ts | 209 | ✓ | re-export layer |
```

171-029 synthesis:
1. 14 modül raporunun Kapsam Haritası union'ı
2. `find src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' \)` gerçeğiyle diff
3. Herhangi bir dosya hiçbir raporda yoksa → **CRITICAL coverage-gap**
4. SYNTHESIS.md "Coverage Doğrulama" tablosu: toplam / kapsanan / boşta

Modül sınırları öyle çizildi ki her src/tests/scripts dosyası **tam 1 modül-task'a ait** — collision yok, gap yok. Bu, "her karakter görüldü" iddiasını ölçülebilir kanıta çevirir.

## 8. Çıktı Şeması (her rapor zorunlu)

```markdown
# <Task Adı> — Audit Raporu (Sprint 171)
## Bulgular (Findings)        ← numaralı, her biri file:line kanıtlı
## Severity                   ← CRITICAL / HIGH / MEDIUM / LOW tablo
## Kanıt (Evidence)           ← file:line + kod/komut alıntısı
## Öneriler (Recommendations) ← aksiyonable, Sprint 172+ backlog uyumlu
## Kapsam Haritası            ← SADECE modül-derin task'larda zorunlu
```

**Dil:** Tüm bölümler **Türkçe**, insan-okur, teknik terim/identifier orijinal. Boş/yüzeysel rapor (4 bölümden biri eksik/kanıtsız) = task NO_GO (içerik kalite kapısı, Q7 Kapı 2).

## 9. Dual-Gate GO/NO_GO (Q7)

**Kapı 1 — Orchestration Health (sprint geneli):**
- 29/29 task `.result` yazdı
- 0 cascade, 0 spurious NO_GO, 0 fix worker spawn
- Auditor boundary ihlali = 0 (sadece `docs/audits/sprint-171/`)
- Asıl ispat: bootstrap fix runtime aktif. Spurious NO_GO çıkarsa → fix runtime'da DEĞİL → `npm run build`+MCP restart sırası gözden geçir.

**Kapı 2 — İçerik Kalite (task bazlı):**
- Her rapor 4 zorunlu bölüm + ≥1 `file:line` kanıt + Türkçe
- Modül task'larda Kapsam Haritası + coverage-gap = 0
- Eşiği geçmeyen task = task NO_GO (sprint orchestration'ı bozmaz, synthesis'te raporlanır)

**Sprint verdict:**
- **GO:** Kapı 1 tam + ≥27/29 task Kapı 2 + coverage-gap 0
- **GO_WITH_TECH_DEBT:** Kapı 1 tam + 24-26 task Kapı 2 (≤5 yüzeysel, re-audit backlog)
- **NO_GO:** Kapı 1 ihlali (cascade/spurious/boundary) — bootstrap fix regresyon sinyali

**Kritik bulguların doğası:** Audit task'ın CRITICAL bulgu raporlaması = başarılı audit, NO_GO DEĞİL. NO_GO sadece orchestration arızası.

## 10. Sprint Sonu

- Tüm 29 rapor + SYNTHESIS.md `docs/audits/sprint-171/` altında
- Memory'ye insert: `sprint-log-171`, `retro-sprint-171`, `mem-sprint-171` (DB-first, `feedback_db_silmek_yasak` — sadece insert/upsert)
- `deckent memory export` → .md snapshot
- Commit (Alperen onayıyla; build/publish Alperen kararı — `feedback_build_requires_user_approval`)
- Sprint 172 OSS GA girdisi hazır: prioritized backlog + doc-reorg planı + AEGIS manifestosu beslemesi

## 11. Kural Hatırlatmaları (Memory)

- `feedback_sprint_kill_always_ask_user`: sprint kill %100 Alperen onayı
- `feedback_build_requires_user_approval`: build/publish son doğrulama Alperen
- `feedback_db_silmek_yasak`: memory.db ASLA silinmez, sadece upsert/UPDATE
- `feedback_no_minimum_no_mvp_deckent`: minimum/MVP önerme YASAK — full god-level scope
- `feedback_mode_agnostic_deckent`: metodolojik öneriler mode-agnostic dilde (synthesis AEGIS terminolojisi)

## 12. Açık Riskler

1. **Bootstrap fix regresyon:** Module hot-reload yok — `npm run build`+MCP restart yapıldı (2026-05-15), runtime aktif varsayımı. Wave 1'de spurious NO_GO = erken sinyal, sprint durdurulup sıra gözden geçirilir.
2. **Manuel synthesis dispatch:** `dependency_pipeline_enabled: false` → Wave 5 Brain manuel (ADR-047). Wave 4 tüm DONE doğrulanmadan dispatch edilmez.
3. **Coverage-map disiplini:** Modül task'lar Kapsam Haritası'nı eksik doldurursa synthesis false coverage-gap üretir — task prompt'unda bölüm zorunluluğu explicit.
4. **24 orphan .worker-*.sh / .tasks temizliği:** Sprint 170 sonrası `.tasks/` temiz (0 dosya) — spawn surface temiz, ön-koşul karşılandı.
