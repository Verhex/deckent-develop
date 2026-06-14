# Task Routing — Intent-Tabanlı Akıllı Görev Yönlendirme

> Deckent her görevi otomatik olarak en uygun agent'a, skill setine ve provider'a yönlendirir — elle müdahale gerekmez.

## Ne işe yarar?
- Her sprint görevi için agent, skill listesi ve provider (Claude / Codex / Gemini) otomatik seçilir.
- Görevin başlık, açıklama ve kapsam bilgisinden **TaskDNA** oluşturulur.
- Sonuç bir `RoutingDecision` nesnesidir: atanan agent, skill'ler, güven skoru ve karar gerekçesi.
- DIRECTIVES'te `Skills:` veya `Agent:` ile elle override yapılabilir; override semantik uyarı denetiminden geçer.
- Öğrenme bonusları (`LearningBonus`) geçmiş sprint sonuçlarından otomatik beslenir.

## Neden önemli?
- **"Refactorer her şeyi çeker" problemi çözüldü:** domain-match bonus (`+3`) ve user-surface bonus (`+8`) ile uzman agent'lar genel-amaçlı agent'ları geçer.
  - Domain-match: görevin intent'i (security, devops, design, documentation) veya kapsam yolundan (`src/api/` → api-builder) çıkarılan domain adı ilgili agent'ı boost eder.
  - User-surface: CLI / dashboard / API / e2e yüzey görevleri surface-owner agent'ına (`api-builder`, `frontend-designer`, `ci-guardian`) +8 bonus alır — refactorer'ın impl@7 skoru bu bonusu geçemez.
- Güven seviyesi (`high / medium / low / uncertain`) gözlemlenebilir — düşük güven loglanır.
- Override varsa semantik kontrol (Sprint 182) gereksiz atamaya karşı uyarı verir, plan bloke olmaz.
- Skill bütçesi `effort`-bazlı token tahsisatıyla yönetilir — `high` effort daha fazla skill sığdırır.

## Nasıl çalışır?

```
routeTaskV2()
  └─ L1: classifyIntent()      → TaskDNA (intent, domains, tags, size)
  └─ L2: evaluateActivation()  → agent + skill activation skorları
  └─ L3: selectBestAgent()     → domain-match bonus (+3) · user-surface bonus (+8) · learning bonus
  └─ L4: resolveComposition()  → skill bütçesi (effort-aware token allocation)
```

**Ajan Güven Seviyeleri** (kaynak: `src/core/routing-types.ts`):
- `high` — aktivasyon skoru en yakın adaydan belirgin şekilde ayrışıyor.
- `medium` — yeterli skor farkı var ama yakın bir aday mevcut.
- `low` — fallback chain devreye girdi (eşleşen agent bulunamadı).
- `uncertain` — aday hiç yok, statik fallback kullanıldı.

**Intent Türleri** (kaynak: `src/core/intent-classifier.ts`, `AGENT_FALLBACK_CHAIN` — 12 tür):
`security · bugfix · refactor · documentation · performance · design · devops · config · migration · architecture · implementation · unknown`

**Fallback Chain:** Hiçbir agent aktivasyon eşiğini geçemezse her intent türü için sabit sıra devreye girer. Örn: `security → security-auditor → (ultimate: architect)`. `activeAgentIds` seti verilmişse dinamik, verilmemişse statik fallback seçilir.

## Komut / Örnek

```bash
# Routing kararını görüntülemek için plan çıktısına bak:
deckent plan --structured
# Çıktıda her görev için: "Agent: api-builder (confidence: high)" satırı görünür.

# Belirli bir görevi manuel tetiklemek (planlı task'ı spawn et):
deckent spawn <taskId>
# Sonuç dosyasında assignedAgent + assignedSkills alanlarını doğrula.
```

DIRECTIVES override örneği:
```markdown
## Task 1: API Endpoint
- Skills: api-builder, typescript-expert
- Agent: api-builder   # zorla override
```

## Durum
- Olgunluk: ✅ canlı — yüksek import sayısı, sprint-190+ aktif
- İlgili: ADR-028 · ADR-072 · ADR-075 · ADR-079 (user-surface bonus)
- Modüller: `src/core/routing-engine.ts` · `src/core/intent-classifier.ts` · `src/core/activation-engine.ts` · `src/core/skill-selector.ts`
