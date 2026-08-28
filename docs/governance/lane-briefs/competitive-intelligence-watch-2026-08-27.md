# [ADMITTED — MASTER 6181] Competitive Intelligence Watch — taslak direktifler
> Owner-admission 2026-08-27 (soru-cevap: "ADMIT — backlog'a al") → MASTER satır 6181
> COMPETITIVE-INTELLIGENCE-WATCH-001. follow-up-works kopyası silinme-tetiği gereği bu
> lane-brief'e taşındı (2026-08-28). Tüketim-tetiği: 6181 execution açılıp DIRECTIVES
> yazıldığında bu dosya SİLİNİR; kalıcı kayıt MASTER satır-kanıtıdır.
> Köken: 2026-08-26 hatalı-scope codex session'ının yazdığı DIRECTIVES (sprint-685 fenced-ABORTED, sıfır kod-etkisi) + ana-şeridin 4 küçük düzeltmesi (Test-satırları + landing-notu). Fikir ürün-değeri taşıyor; admission'sız işe dönüşmez (KANUN 4).

# DIRECTIVES — Deckent Competitive Intelligence Watch

## Goal: Current code truthunu kanıt-bağlı bir baseline'a dönüştüren; resmi kaynaklardan material signal toplayan; Memory V2 üzerinde tarihsel dedup yapan; Deckent'e göre adversarial karşılaştırma ve significance gate uygulayan; yalnız pozisyon gerçekten değiştiğinde Türkçe alarm üreten; mevcut scheduled-flow, Goal-v2 MissionScheduler, capability broker, authority, evidence ve connector notification zincirleri üzerinden Europe/Istanbul saat diliminde günlük çalışan production-grade Competitive Intelligence Watch'ı uçtan uca kapat.

---

## Task 1: Current-truth baseline ve karşılaştırma kernel'i
- Effort: high
- Skills: typescript-expert, solution-architect
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/baseline.test.ts tests/intelligence/comparison.test.ts tests/intelligence/historical-events.test.ts
- Files: src/intelligence/types.ts, src/intelligence/baseline-catalog.ts, src/intelligence/baseline.ts, src/intelligence/competitor-universe.ts, src/intelligence/terminology.ts, src/intelligence/comparison.ts, src/intelligence/significance-gate.ts, src/intelligence/alarm-prompt.ts, tests/intelligence/baseline.test.ts, tests/intelligence/comparison.test.ts, tests/intelligence/historical-events.test.ts
- Scope: src/intelligence/, tests/intelligence/

### Description
Current main kaynaklarını authority kabul eden compact baseline üreticisini kur. Baseline; Goal→Mission→Flow→Run→WorkItem→Attempt→Operation, Brain, worker self-assessment, Auditor, Nervous, ApprovalBroker/HITL, normative verdicts, dependency dispatch, collision control, FIX/retry/recovery, checkpoints, settlement, evidence/receipts, XVerify/cross-provider verification, routing/provider authority, budgets/landing, backends/isolation, MCP/API/CLI/Terminal/Desktop, connectors/process/autonomous/memory/agents/skills/capability authority/reactive/notification alanlarının her birini LIVE_PROVEN/LIVE_PARTIAL/WIRED_UNPROVEN/DORMANT_DEFAULT_OFF/ROADMAP/HOLD/DEAD_LEGACY olarak sınıflandırmalı; exact current repo evidence ref'leri ve kaynak digesti taşımalı. HEAD tek başına yetmez: relevant file content digests değişince invalidation olmalı. Deckent kategorisi koddan türetilmeli. Tam competitor universe, açık-yeni-entrant seam'i, competitor terimlerini Deckent primitive'lerine çeviren mapping, beş relative classification, sekiz gap dimension ve material-signal gate deterministic/type-safe olmalı. Alarm/analyzer prompt'u İNGİLİZCE olmalı; fake skor göstermemeli. Historical fixtures DAG catch-up'ın çoğunlukla suppress edildiğini, distribution/enterprise economics/new protocol sinyallerinin doğru dimension ve implication ile ayrıldığını kanıtlamalı.

**Test:** baseline digest invalidation, status/evidence completeness, exact classification vocabulary, gap-dimension separation, six historical acceptance scenarios.

---

## Task 2: Source retrieval, Memory V2 dedup, durable notification ve watch service
- Effort: high
- Skills: typescript-expert, security-specialist
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/source-retrieval.test.ts tests/intelligence/event-history.test.ts tests/intelligence/watch-service.test.ts tests/connectors/notification-delivery.test.ts
- Files: src/intelligence/source-retrieval.ts, src/intelligence/event-history.ts, src/intelligence/alert-formatter.ts, src/intelligence/watch-service.ts, src/intelligence/capability.ts, src/intelligence/index.ts, src/core/capability-runtime.ts, src/connectors/notification-delivery.ts, tests/intelligence/source-retrieval.test.ts, tests/intelligence/event-history.test.ts, tests/intelligence/watch-service.test.ts, tests/connectors/notification-delivery.test.ts
- Scope: src/intelligence/, src/core/, src/connectors/, tests/intelligence/, tests/connectors/

### Description
Official repo/release/docs/announcement/benchmark önceliğini typed source-quality contractına çevir. Node built-ins ve injected fetch ile bounded timeout/retry, conditional retrieval state, GitHub release/JSON feed/Atom ve güvenli HTML metadata extraction sağla; partial source failure bütün run'ı düşürmesin ama implementation reality ve evidence yetersizse typed HOLD/suppress olsun. Competitor event geçmişini yeni DB açmadan canonical `.brain/memory.db` MemoryStore custom type + deterministic fingerprint ile sakla; competitor, eventType, fingerprint, source, publication/detection/report dates, affected capability, previous classification, confidence alanlarını zorunlu kıl. Aynı olayın mirror/rewrite'ını dedupe et, material evolution'ı yeni fingerprint olarak geçir. Türkçe compact alert formatter required bölümleri ve exact baseline code refs'i taşısın. Alert önce stable-id durable owner-notification outbox'a append edilsin, sonra history reportedDate güncellensin; crash/replay duplicate delivery id'sini dedupe etsin. Dry-run kesinlikle event history/notification/source cursor mutate etmesin. Watch'ı mevcut CapabilityRegistry'ye audited `competitive-intelligence.watch` handler'ı olarak ekle; network authority beyanı ve bounded evidence receipts taşısın.

**Test:** official-source preference, transient retry/timeout, malformed feed, partial HOLD, fingerprint dedup, material evolution, crash-safe stable notification id, dry-run no mutation, Turkish alert schema.

---

## Task 3: Goal-v2 daily wiring, timezone, CLI, docs ve gerçek-binary closure
- Effort: high
- Skills: typescript-expert, documentation-writer
- Dependencies: Task 2
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/scheduled-flow-timezone.test.ts tests/orchestra/autonomous/scheduled-flow-mission-ingest.test.ts tests/orchestra/autonomous/mission-capability-production-wire.test.ts tests/cli/intelligence-command.test.ts
- Files: src/core/scheduled-flow.ts, src/core/flow-scheduler.ts, src/core/flow-registry.ts, src/orchestra/autonomous/backlog-trigger.ts, src/orchestra/autonomous/mission-store/scheduled-flow-mission-ingest.ts, src/orchestra/autonomous/mission-store/mission-kind-admission.ts, src/orchestra/autonomous/mission-store/mission-scheduler.ts, src/orchestra/autonomous/mission-store/mission-engine-wire.ts, src/cli/commands/autonomous.ts, src/cli/commands/intelligence.ts, src/cli/index.ts, src/core/cli-command-contract.ts, src/cli/helpers/messages.ts, src/cli/helpers/message-catalog/cli-run.ts, docs/en/features/competitive-intelligence-watch.md, docs/tr/features/competitive-intelligence-watch.md, README.md, tests/core/scheduled-flow-timezone.test.ts, tests/orchestra/autonomous/scheduled-flow-mission-ingest.test.ts, tests/orchestra/autonomous/mission-capability-production-wire.test.ts, tests/cli/intelligence-command.test.ts, tests/cli/intelligence-binary.test.ts
- Scope: src/core/, src/orchestra/autonomous/, src/cli/, docs/en/features/, docs/tr/features/, tests/core/, tests/orchestra/autonomous/, tests/cli/, README.md

### Description
Yeni daemon/scheduler/queue kurmadan canonical ScheduledFlow/FlowRegistry/FlowScheduler ve Goal-v2 MissionStore/MissionScheduler zincirini kapat. ScheduledFlow'a backward-compatible IANA timezone, typed capability target/policy ve durable dispatch cursor ekle; `nextRun` DST dahil Europe/Istanbul yerel cron semantiğini desteklesin, default UTC korunmalı. Goal-v2 her scheduler iteration öncesi due flow'ları deterministic mission/work-item id ile idempotent ingest etsin; mission insert ile cursor persist arasındaki crash replay duplicate side effect üretmesin. Production v2 registry capability kind'ını yalnız audited live broker gerçekten bound olduğunda admit etsin; claim fence/engine lease/approval/audit/settlement/delivery zinciri korunmalı. CLI top-level `deckent intelligence watch run [--dry-run] [--input <fixture>]`, `schedule`, `status/history` yüzeylerini i18n catalog ve command contract ile ekle. Default schedule günlük 09:00 Europe/Istanbul, idempotent ve restart sonrası catch-up yapmalı. Manual run aynı watch service/capability path'ini çağırmalı. Docs EN/TR dürüst current truth, operator commands, failure/recovery, provider-enrichment HOLD ve notification prerequisites yazmalı. Targeted tests üret; GERÇEK-BİNARY dry-run/schedule/status kanıtı landing-host işidir (sprint build almaz — dist'e dokunan koşuyu deneme, tests/cli/intelligence-binary.test.ts'i landing-sonrası koşulacak şekilde işaretle/skip-gerekçele).

**Test:** timezone/DST, restart catch-up, crash-window replay, capability admission fence, approval-before-claim, settlement/outbox, CLI i18n/help, dry-run and manual run-now real binary.
