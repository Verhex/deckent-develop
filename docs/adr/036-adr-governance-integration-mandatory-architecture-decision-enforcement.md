# ADR-036: ADR Governance Integration — Mandatory Architecture Decision Enforcement

**Status:** accepted

**Date:** 2026-04-14

**Sprint:** 138

---

**Context:**

Deckent 135+ sprint boyunca `.brain/DECISIONS.md` dosyasında mimari kararları (ADR) kayıt altına aldı. Ancak bu ADR'ler yalnızca bilgilendirme amaçlıydı — brain veya worker'lar tarafından aktif olarak okunmuyor, uyumluluk kontrol edilmiyordu. Açık kaynak repoya geçişle birlikte kullanıcılar kendi `.brain/DECISIONS.md` dosyalarını yazıp Deckent'tan enforce ettirmeyi bekleyecek.

Sorunlar:
1. ADR format standardize değildi — bazı ADR'lerde Status alanı vardı, bazılarında yoktu
2. Worker prompt'larında ADR bilgisi yoktu — worker'lar mimari kısıtlamalardan habersiz çalışıyordu
3. ADR yaşam döngüsü (accepted → deprecated → superseded) takip edilemiyordu
4. ADR governance CI pipeline'a entegre değildi — format hataları build'de yakalanmıyordu

**Decision:**

ADR governance'ı kullanıcı-facing ürün özelliğine dönüştürmek. 5 bileşen:

1. **MADR v3 Hibrit Format:** Tüm ADR'lere zorunlu `**Status:**` alanı eklendi. Geçerli değerler: accepted, deprecated, superseded, proposed, rejected. Parantezli açıklama desteklenir (örn. `accepted (Sprint 131)`).

2. **Mandatory Read Wiring:** DECKENT.md'ye `@.brain/DECISIONS.md` referansı eklendi. brain.md ve worker-default.md kurallarına ADR compliance zorunluluğu eklendi.

3. **Worker Prompt ADR Injection:** `buildWorkerPrompt()` fonksiyonu `.brain/DECISIONS.md` içeriğini worker prompt'una enjekte eder. Worker'lar mimari kısıtlamaları bilir, ihlal durumunda NO_GO + ADR amendment proposal yazar.

4. **Validator Script:** `scripts/adr-validator.mjs` — format doğrulama, status enum kontrolü, duplicate ID tespiti. `npm run lint:adr` ile CI'da çalıştırılır.

5. **ADR/SDL Naming Split:** `.brain/DECISIONS.md` = ADR (kalıcı mimari kararlar), `.deckent/decisions/*.json` = SDL (sprint taktik kararları).

**Consequences (+):**
- Worker'lar her sprint'te mimari kısıtlamaları bilir — bilinçsiz ihlaller azalır
- `npm run lint:adr` CI pipeline'da format tutarlılığını garanti eder
- Kullanıcılar kendi projelerinde ADR governance'ı kurabilir
- MADR v3 standardıyla uyumlu format — topluluk alışkanlıklarıyla uyum

**Consequences (-):**
- Worker prompt boyutu ADR injection ile büyür (~3000 char ek)
- Validator basit regex-based — karmaşık markdown edge case'leri gözden kaçabilir
- ADR enforcement runtime'da değil, compile-time'da — aktif kod analizi yok

**References:**
- Sprint 138 Task 138-001 implementasyonu
- `scripts/adr-validator.mjs` — validator script
- `src/orchestra/task-builder.ts:loadADRContent()` — prompt injection
- ADR-013: DECKENT.md Adapter Pattern — mandatory read wiring pattern
- MADR v3: https://adr.github.io/madr/

> **Note (verified / Memory V2 reconciliation):** Confirmed in code — `scripts/adr-validator.mjs` + `npm run lint:adr` (format/status-enum/duplicate-ID) and the MADR v3 mandatory `**Status:**` enum are real; the "enforcement is compile-time, not runtime" caveat is accurate (consistent with ADR-037 V1.0). **However, the ADR store evolved (Memory V2, DB-first):** `.brain/DECISIONS.md` is **no longer a live hand-maintained file**. ADRs live in `.brain/memory.db` (`type='adr'`), synced from `docs/adr/*.md` via ADR-046 (`syncAdrFilesToDb`) and exported to `.brain/exports/decisions.md`. Worker-prompt ADR injection is DB-based (`src/orchestra/adr-selector.ts`), not a raw `.brain/DECISIONS.md` read; the brain/worker/auditor rules now state "Query ADRs via MemoryStore — never parse .md files". Read every `.brain/DECISIONS.md` mention above as **shorthand for the ADR governance store** (DB + `docs/adr/` + `exports/decisions.md`) — consistent with ADR-009, `docs/architecture/memory-system.md`, and `CLAUDE.md`. Behavior unchanged; documentation alignment only.

---
