# Sprint 166 Design Spec — Brain Self-Update + Data Integrity Closure

**Date:** 2026-05-13
**Status:** APPROVED (Alperen onayı: wave plan + deckent_start otomatik mode)
**Author:** Koordinatör (4 paralel forensic agent + brainstorming/systematic-debugging skill çift kullanımı)

---

## 1. Goal

Sprint 164-165 boyunca canlı reproduce olan 4 mimari kök sebebi (Bug M, N, S, Y2) kalıcı çözmek + 12 data correction'ı kapatmak. Brain post-sprint hooks **artık dosyaları gerçekten güncelliyor**, ADR'ler memory.db'ye akıyor, provider rules ADR-046+ ile evolve ediyor, doc sync agent'ları ground-truth verification yapıyor. Sprint 167+ "gerçek kontrol" hattına açılan kapı (open source GA prep).

## 2. Context

Sprint 154'ten beri (12 sprint) Brain'in self-update mekanizması yarım çalışıyor. 4 paralel forensic agent (Memory V2 + Root .md + Provider Adapter + PostFinalizeHooks codepath) ile derinlemesine audit yapıldı, kanıt-bazlı 4 architectural root cause + 16 bug tespit edildi.

**Ground truth (kod kanıtlı):**
- Sprint: 165 (config.json `last_sprint_id`)
- Agents: **15** (`src/core/builtins/agents/` 15 dizin, test-writer YOK)
- Skills: 21
- MCP tools: 27 (`src/mcp/tools/` 28 dosya - 1 index = 27 register)
- CLI: 56 (`src/cli/commands/` dosya)
- ADR: 43 memory.db (043/044/045 YOK)
- spawn_backend: docker
- Version: 1.0.0-beta.1

## 3. Root Cause Hierarchy (Phase 1 — systematic-debugging)

### 3.1 Bug M — adrInsert hook YOK
**Yer:** `src/orchestra/sprint-finalizer.ts:1185` runPostFinalizeHooks zinciri
**Tanım:** Worker `docs/adr/045.md` yazıyor → memory.db'ye INSERT eden HİÇBİR runtime hook YOK. Tek var olan `parseDecisionsMd` (`src/core/memory-import.ts:54`) yalnız manuel `deckent memory rebuild` ile tetikleniyor.
**Etki:** ADR-043 (Sprint 163), ADR-044 (Sprint 163), ADR-045 (Sprint 164) 23 gün önce kayboldu. ADR-036 governance bypass edildi (kendi kuralı ihlal).

### 3.2 Bug N — ruleRegen callback finalize'den geçirilmiyor
**Yer:** `sprint-finalizer.ts:1185` runPostFinalizeHooks() çağrısında `onRuleRegen` parametresi YOK
**Tanım:** `identity-generator.ts:343-353` ruleRegen hook tanımlı ama "OPSİYONEL callback" boş kalıyor.
**Etki:** `.claude/`, `.codex/`, `.gemini/` rules/*.md dosyaları 13 sprint stale. ADR-042 (proposed) + 043/044/045 hiç inject edilmemiş.

### 3.3 Bug S — managed-doc-runner cache invalidation
**Yer:** `src/orchestra/managed-docs/doc-cache.ts` cache key = fileHash + entryHash
**Tanım:** Cache key sprint.id veya sprint metrics hash içermiyor → her sprint sonu `cached_no_change` ile SKIP.
**Etki:** CLAUDE.md Sprint 154'ten beri "sprint-153" değerinde DONMUŞ. Brain hook çalışıyor ✓ ama dosyayı güncellemiyor ✗.

### 3.4 Bug Y2 — Doc sync agent ground-truth verification eksik
**Yer:** Agent dispatch prompt'ları (Sprint 164 doc-update agent'ları)
**Tanım:** Sprint 164'te ben agent'lara "16 agent" inject ettim, agent'lar prompt'a güvendi, gerçek `src/core/builtins/agents/` 15 dizin. AGENTS.md doğru, diğer 5 dosya yanlış.
**Etki:** Sprint 164 commit `a4f3be4` yanlış bilgi yaydı. 5 anchor .md'de "16 agent + test-writer" hatası.

## 4. 16 Bug Final Inventory

| ID | Tanım | Sev | Aksiyon (özet) |
|---|---|---|---|
| **M** | ADR-043/044/045 memory.db'de YOK | **P0** | adr-file-sync.ts yeni + Step 4 wire |
| **N** | ruleRegen callback çağrılmıyor | **P0** | sprint-finalizer.ts:1185 wire |
| **S** | doc-cache.ts cache key sprint.id içermiyor | **P0** | cache key extension |
| **Y2** | Doc sync ground-truth eksik | **P0** | Agent verification protokolü |
| R | AGENTS.md docs.json'da yok | P1 | docs.json kayıt |
| T | identityRegen yanlış hedef | P1 | managed-docs devret |
| O | brain.md AUTO+CUSTOM duplicate | P1 | sync code refactor |
| P | TOOLS/BOOT/WORKER-GUIDE ölü | P1 | auto-content generators |
| U | sprint type='sprint' 140+ kırılmış | P1 | retro-writer forensic |
| Q | Provider parity drift | P2 | multi-provider pipeline |
| K | verify-ran atomic write | P2 | .tmp + rename |
| L | Doc test sprint count | P2 | 3 stale test güncel |
| V | 100 debt sprint_id=NULL | P2 | parseDebtMd populate |
| W | Pattern emitter yok | P2 | auditor runtime wire |
| X | summary.md "Active Debt" filter | P2 | export filter |
| C | .brain/DECISIONS.md broken ref | P2 | DECKENT.md L49 fix |

## 5. Architecture — 3-Wave Plan

### Wave 1: Architectural Hook Fixes (3 paralel, ~165 LoC)

1. **166-T1 (Bug M):** adr-file-sync.ts yeni dosya + identity-generator Step 4 wire + memory.ts rebuild secondary source. MADR v3 başlık regex adr-validator.mjs'den taşı. 5 test.
2. **166-T2 (Bug N+O):** ruleRegen callback finalize wire + AUTO/CUSTOM block design fix. CUSTOM AUTO kopyası olmayacak, sprint-özel ekleme için boş template. 4 test.
3. **166-T3 (Bug S):** doc-cache.ts cache key extension (sprint.id hash). 4 test.

### Wave 2: Data Integrity + Manuel Corrections (4 paralel, ~150 LoC)

4. **166-T4 (Bug Y2):** Doc sync ground-truth verification — agent prompt'larına gerçek dosya count check zorunlu (src/core/builtins/agents/ wc -l, src/cli/commands/ wc -l, vs.). Iddia ≠ gerçek olursa NO_GO. 3 test.
5. **166-T5 (Bug R+T):** AGENTS.md `docs.json`'a kayıt + identityRegen managed-docs zincirine devret + 15 agent correction (5 dosya: CLAUDE.md, DECKENT.md, README.md, README-TR.md, IDENTITY.md). 2 test.
6. **166-T6 (Bug U+V):** Sprint type='sprint' insert Sprint 140+ kırık forensic + fix. 8 sprint memory backfill (134, 140, 152, 157, 158, 159, 160, 161, 165). 100 debt sprint_id=NULL populate. 4 test.
7. **166-T7 (Bug C+X):** DECKENT.md `.brain/DECISIONS.md` broken ref fix + summary.md "Active Debt" filter (status!=resolved) + Sprint 165 wire activation flip prep (Sprint 167 hazırlık). 3 test.

### Wave 3: Living Docs + Cleanup (3 paralel, ~175 LoC)

8. **166-T8 (Bug P):** TOOLS/BOOT/WORKER-GUIDE.md `docs.json` kayıtları + auto-content generators (27 MCP, 56 CLI, Bug X/Y/RBAC/honest-gate anti-pattern listesi). 4 test.
9. **166-T9 (Bug Q+W):** Provider parity (.codex/.gemini frontmatter sync + Cursor adapter scaffold) + Auditor pattern emitter runtime wire (store.insert({type:'pattern'})). 3 test.
10. **166-T10 (Bug K+L):** verify-ran atomic write + 3 doc test sprint count update. 2 test.

**Toplam:** 10 task, ~490 LoC, 34 test.

## 6. Anchor Rules (Sprint 164/165 derslerinin ışığında)

1. **Ground-truth verification (Y2 dersi):** Tüm doc sync agent'ları gerçek dosya count'unu task öncesi doğrular. Bash `ls | wc -l` ile.
2. **`npm run build` YASAK** worker'larda — sadece Alperen onayı (dist/ rebuild post-sprint)
3. **Brain finalize observability izleme:** Sprint 166 sırasında Alperen `.deckent/sprint-166-events.jsonl` + `ERRORS.md` canlı izler, hook fail olursa müdahale eder
4. **Sprint 165 wire korunur:** respawnEligibleTasks 13 grep match + honest-result gate + processQueue idempotency — Sprint 166 silmez
5. **Multi-provider sync (Q dersi):** Hook eklerken `.claude/`, `.codex/`, `.gemini/`, `.cursor/` TÜM provider'lara yansır
6. **Test skip discipline:** verify-ran marker olmayan task NO_GO
7. **Idempotency:** Tüm yeni hook'lar idempotent (çift çağrı → tek sonuç)

## 7. GO/NO_GO Criteria

- ✅ **10/10 task DONE** veya 8/10 + 2 GO_WITH_TECH_DEBT
- ✅ `tsc --noEmit` PASS
- ✅ `npx vitest run` **delta 0 fail** (Sprint 165 GO_WITH_TECH_DEBT closure)
- ✅ 34 yeni test PASS, 0 regression
- ✅ Bug M kanıtı: memory.db'de ADR-043/044/045 var
- ✅ Bug N kanıtı: `.claude/rules/brain.md` Active ADR Constraints ADR-043+ içerir
- ✅ Bug S kanıtı: `grep "sprint-166" CLAUDE.md` 1+ match
- ✅ Bug Y2 kanıtı: 5 root .md "15 agents" + test-writer YOK

## 8. Sprint 167+ Hazırlık

- **Sprint 167:** `dependency_pipeline_enabled` canlı flip (Sprint 164 wire activation) + minimal multi-wave smoke
- **Sprint 168:** Open Source GA — public repo flip (`VerhexIO/deckent-dev` → `VerhexIO/deckent` public) + npm publish v1.0.0-beta.2 + Show HN launch
- **Sprint 169+:** Community feedback, messaging trio canlı, DeckentHub 50 skill

## 9. Risk Matrix

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| Wave 1 hook fix Brain runtime'ı bozar | Orta | Yüksek | tsc/vitest pre-check, fix_phase güvenlik ağı |
| Bug Y2 verification protokol agent prompt regression | Düşük | Orta | Ground-truth check + Brain self-audit gate |
| Sprint 166 OOM (Sprint 165 Bug G replay) | Düşük | Orta | maxWorkers=6 (Sprint 165'ten alınan ders) |
| 16 bug çok geniş scope, focus kaybı | Orta | Düşük | Wave-based prioritization + GO_WITH_TECH_DEBT kabul edilebilir |
| Brain finalize hook'lar Sprint 166 sırasında kırık (kendi kendini bozma) | Orta | Yüksek | Manual fallback ready, deckent_run/spawn auto-approve devreye girer |

## 10. Self-Review

✅ **Placeholder scan:** Hiç TBD/TODO yok, somut file:line referansları + kanıt komutları.
✅ **Internal consistency:** 4 root cause ↔ 10 task ↔ 16 bug haritası tutarlı.
✅ **Scope check:** Tek sprint için ağır ama dokumantasyon-heavy + Brain observability ile güvenli.
✅ **Ambiguity check:** Her bug'a unique aksiyon + file referansı. "Sprint 167 hazırlık" net bir vaad değil — Sprint 166 retro'da onaylanır.

## Cross-References

- Sprint 165 final state: `docs/release/sprint-165-final-state.md`
- ADR-036 ADR Governance (memory.db'de): `npx deckent recall "adr-036"`
- Sprint 161/164 forensic: `.brain/archive/sprint-{161,164,165}-tasks/`
- Sprint 165 DIRECTIVES (archive): `.brain/archive/DIRECTIVES-sprint-165.md`
