# Task Routing — Intent-Tabanlı Akıllı Görev Yönlendirme

> Deckent her görevi otomatik olarak en uygun agent'a, skill setine ve provider'a yönlendirir — elle müdahale gerekmez.

## Ne işe yarar?
- Her sprint görevi için agent, skill listesi ve provider (Claude / Codex / Gemini) otomatik seçilir.
- Görevin başlık, açıklama ve kapsam bilgisinden **TaskDNA** oluşturulur.
- Sonuç bir `RoutingDecision` nesnesidir: atanan agent, skill'ler, güven skoru ve karar gerekçesi.
- DIRECTIVES'te `Skills:` veya `Agent:` ile elle override yapılabilir; override semantik uyarı denetiminden geçer.
- Öğrenme bonusları (`LearningBonus`) geçmiş sprint sonuçlarından otomatik beslenir.

## Neden önemli?
- "Refactorer her şeyi çeker" problemini çözer: domain-match bonus (+3) ve user-surface bonus (+8) ile uzman agent'lar genel-amaçlı agent'ları geçer.
- Güven seviyesi (`high / medium / low / uncertain`) gözlemlenebilir — düşük güven loglanır.
- Override varsa semantik kontrol (Sprint 182) gereksiz atamaya karşı uyarı verir, plan bloke olmaz.

## Nasıl çalışır?

```
routeTaskV2()
  └─ L1: classifyIntent()      → TaskDNA (intent, domains, tags, size)
  └─ L2: evaluateActivation()  → agent + skill activation skorları
  └─ L3: selectBestAgent()     → domain-match bonus · user-surface bonus · learning bonus
  └─ L4: resolveComposition()  → skill bütçesi (effort-aware token allocation)
```

**Ajan Güven Seviyeleri:**
- `high` — aktivasyon skoru en yakın adaydan belirgin şekilde ayrışıyor.
- `medium` — yeterli skor farkı var ama yakın bir aday mevcut.
- `low` — fallback chain devreye girdi (eşleşen agent bulunamadı).
- `uncertain` — aday hiç yok, statik fallback kullanıldı.

**Intent Türleri** (kaynak: `src/core/intent-classifier.ts`):
`security · bugfix · refactor · documentation · performance · design · devops · config · migration · architecture · implementation`

## Komut / Örnek

```bash
# Routing kararını görüntülemek için plan çıktısına bak:
deckent plan --structured
# Çıktıda her görev için: "Agent: api-builder (confidence: high)" satırı görünür.

# Belirli bir görevi manuel tetiklemek:
deckent run <task-id>
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
- İlgili: ADR-028 · ADR-072 · ADR-075
- Modüller: `src/core/routing-engine.ts` · `src/core/intent-classifier.ts` · `src/core/activation-engine.ts`
