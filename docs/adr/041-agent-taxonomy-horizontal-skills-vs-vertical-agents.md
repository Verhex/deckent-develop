# ADR-041: Agent Taxonomy — Horizontal Skills vs Vertical Agents

**Status:** accepted

**Date:** 2026-04-21

**Sprint:** sprint-150

---

## Status
accepted (Sprint 150 — reconfirmed with Sprint 150 dogfood evidence)

## Context

Sprint 146-147 canlı kanıtları agent taxonomy problemini açığa çıkardı:

- **Sprint 145:** test-writer 14/27 (%52) — beklenmedik yüksek atama oranı
- **Sprint 146:** test-writer 9/17 (%53) — anomali devam ediyor
- **Sprint 147:** test-writer 22/22 (%100) — **kritik eşik aşıldı**, ADR gereksinimi tetiklendi

AgentRoutingHealth detector (Sprint 147 T-147-003) %95 anomaly threshold'u aşıldığını bildirdi. `test-writer` agent, "test" keyword'ü içeren her task'a (scope=tests/ dahil) atanıyordu. Bu durum şu sorunlara yol açtı:

1. **Yanlış taxonomik sınıflandırma:** "Test yazmak" bir yatay beceridir (her agent yapabilir), dikey uzmanlık alanı değil.
2. **Routing dağılımı bozukluğu:** Tek agent %100 atamasıyla anomaly detector anlamsız hale geldi.
3. **Beta GA UX problemi:** Kullanıcılar "neden her task test-writer'a gidiyor?" sorusunu soruyor.
4. **Intent classifier yanlışlığı:** 'testing' primary intent olarak tanımlanması her test/ scope task'ı yanlış sınıflandırıyordu.

Sprint 148 Block A (T-148-001..T-148-005) reform paketini hayata geçirdi:
- test-writer agent arşivlendi (T-148-001)
- testing-expert skill auto-activation eklendi (T-148-002)
- Intent classifier 'testing' primary intent kaldırıldı, 'test-coverage' tag sistemi eklendi (T-148-003)
- Router V2 agent fallback chain güncellendi — test-writer yok (T-148-004)
- 15 agent PROMPT.md rubric spec temizlendi (T-148-005)

## Decision

Agent taxonomy şu şekilde reorganize edildi:

**Agent = Dikey Uzmanlık** — belirli bir domain'de derin bilgi:
- `architect` — sistem tasarımı, modül yönetimi
- `security-auditor` — güvenlik açıkları, OWASP
- `frontend-designer` — UI/UX, component tasarımı
- `doc-writer` — dokümantasyon, README, CHANGELOG
- `bug-fixer` — hata ayıklama, regression
- vb.

**Skill = Yatay Beceri** — herhangi bir agent tarafından kullanılabilir:
- `testing-expert` — test yazımı, vitest, coverage (scope tests/** veya *.test.ts ile auto-activate)
- `typescript-expert` — TypeScript tip sistemi
- `documentation-writer` — Markdown, JSDoc
- vb.

**Test, yatay beceridir** — architect da test yazar, bug-fixer da. test-writer agent'ı gereksizdir.

### Routing Kuralları

1. Intent classifier: 'testing' artık primary intent değil. Scope tests/** → 'test-coverage' tag eklenir.
2. selectSkills(): scope tests/** veya filesWrite *.test.ts içeriyorsa testing-expert otomatik eklenir.
3. selectAgent(): task primary intent'e göre seçilir (core-dev → architect, bug-fix → bug-fixer, vb.)
4. AgentRoutingHealth: threshold %40 — hiçbir agent %40'ı aşmamalı.

## Consequences

**(+) Routing dağılımı dengelendi** — Sprint 148 hedef: hiçbir agent %43'ü aşmamalı (architect borderline kabul edilebilir — multi-block varlığı nedeniyle).

**(+) AgentRoutingHealth detector anlamlı** — Artık gerçek anomalileri yakalayabilir, false %100 görüntüsü ortadan kalktı.

**(+) Beta GA UX temizlendi** — Kullanıcılar routing kararlarını anlayabiliyor; "test-writer neden her yerde?" sorusu sorulmaz.

**(+) Skill ekonomisi** — testing-expert birden fazla agent ile çalışabilir. Tek-agent monopolisi yerine skill reuse.

**(-) Sprint 147 test-writer stats arşivlendi** — Tarihsel performans verileri kaybedilmedi, arşivlendi (`.deckent/agents/archive/test-writer-removed-sprint-148/`).

**(-) Breaking change** — Özel (custom) `test-writer` agent tanımlayan kullanıcı projeleri migration adapter gerektirebilir.

## Dogfood Kanıtları (Sprint 149 + Sprint 150 Acceptance)

- **Sprint 148 Test-Writer Atama:** Sprint 148 reform sonrası 27 task arasında test-writer = 0 atama (baseline %95'ten %0'a)
- **Sprint 149 Gate 6:** `grep test-writer .tasks/*.json | wc -l` = 0 — enforcement canlı
- **AgentRoutingHealth:** Sprint 148 anomaly algısı = 0 false positive (detector artık anlamlı)
- **ADR-037 RBAC:** test-writer authority matrix'ten çıkarıldı (Sprint 149 T-149-025 doğrusu)
- **Sprint 150 Gate 6:** Sprint 150 38 task arasında test-writer assigned = 0 — taxonomy reform kalıcı
- **Sprint 150 AgentRoutingHealth:** Anomaly threshold %40 altında — routing dağılımı dengeli

## Implementation Status

- **Sprint 148 T-148-001:** test-writer archive ✅
- **Sprint 148 T-148-002:** testing-expert auto-activation ✅
- **Sprint 148 T-148-003:** Intent classifier refactor ✅
- **Sprint 148 T-148-004:** Router V2 fallback chain ✅
- **Sprint 148 T-148-005:** Agent PROMPT.md cleanup ✅
- **Sprint 149 T-149-025:** ADR ACCEPT + evidence recorded ✅
- **Sprint 150 T-150-025:** ADR-041 reconfirmed with Sprint 150 dogfood — test-writer=0 in 38-task sprint ✅

## References

- Sprint 146 T-146-005: string; corruption — test-writer agent.json bozulması
- Sprint 147 T-147-003: AgentRoutingHealth detector — %95 anomaly detection
- Sprint 148 T-148-001..005: Reform implementation package
- ADR-037: Brain-Auditor-Worker Authority Matrix RBAC V1.0
- ADR-040: Nervous System Architecture — AgentRoutingHealth detector integration

> **Note (verified vs code, Sprint 172):** Confirmed accurate — `.deckent/agents/` holds **15 built-in agents** (excluding temp/archive); `test-writer` is removed and archived under `.deckent/agents/archive/test-writer-removed-sprint-148/`. The Agent=vertical / Skill=horizontal taxonomy is consistent with `docs/architecture/agents.md` and `docs/architecture/agent-skill-architecture.md`. This decision was further **re-reconfirmed in Sprint 166** (per `DECKENT.md`) — still in force. Behavior unchanged; documentation alignment only.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (taksonomi ürün-kanunudur — kullanıcı agent/skill yüzeylerini görür; custom-agent breaking-change etkisi de user-facing).

**Re-verified:** 15 built-in agent + test-writer yok + arşiv duruyor ✓ · testing-expert auto-activation (`'test-coverage'` tag → +2, `routing-engine.ts:887`) ✓ · `ANOMALY_THRESHOLD_RATE = 0.40` (`detectors/agent-routing.ts:23`) ✓ · routing'de test-writer izi yok ✓.

**Dağılım-hedefi gerçekliği:** Taksonomi kararı (vertical/horizontal, test=yatay-beceri) sağlam ve kalıcı-enforce'lu. Ancak Consequences'taki "routing dağılımı dengelendi" hedefi pratikte **kronik nüksetti** — test-writer monopolünün yerini dönem dönem **refactorer-ağırlığı** aldı (örn. Sprint 211: 12/16 task; bkz. memory `feedback_agent_routing_imbalance`). Mitigasyonlar: **ADR-072** (Agent Routing Balance — multi-signal scoring) + **ADR-075** (skill→agent affinity). %40 threshold'u **detector-izlemeli advisory'dir** (AgentRoutingHealth uyarır), hard-enforce değildir — dağılım dengesi sürekli-izlenen bir hedef olarak kalır. md+db senkron (Alperen ADR-review).
