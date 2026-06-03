# Agent/Skill Evolution Pipeline — Kendini Geliştiren Otomasyon

> Deckent, her sprint sonunda kötü performans gösteren agent'ları otomatik tanır, prompt'larını uyarlar ve yeni sürümü test ederek kalıcıya terfi ettirir.

## Ne işe yarar?

- **Promotion/Demotion** — geçici (temp) agent veya skill ≥8 task, ≥%85 başarı, ≥3 sprint sonra kalıcı havuza terfi; düşük performansı olanlar düşürülür.
- **Adaptive Agent** — `adaptAgentRuntime()` düşük başarılı agent'ın zayıf noktalarını (yüksek NO_GO, düşük coverage) tespit edip prompt diff önerir; onay gerektiren veya otomatik uygulanan modda çalışır.
- **Rule Evolver** — sprint geçmişinden aktivasyon kuralları üretir: güven ≥%85 → otomatik uygulanır, ≥%65 → öneri olarak işaretlenir.
- **Identity Mutation** — başarı oranı <%70 olan agent için `variantId` ile yeni prompt varyantı oluşturulur; `requiresApproval: true` ile insan onayına sunar (F5-008).
- **Cross-Sprint Trend Analizi** — `deckent evolve report` ile agent/skill'lerin sprint-bazlı başarı eğrisi izlenir.

## Neden önemli?

- **Kapalı döngü iyileştirme** — agent'lar sprint verisine dayanarak prompt'larını kendi kendine günceller; manuel prompt mühendisliği ihtiyacı azalır.
- **Soy takibi (Genealogy)** — `AgentGenealogy` sınıfı her agent varyantının atasını, neden oluşturulduğunu ve başarı seyrini kaydeder.
- **Emeklilik (Retirement)** — `AgentRetirement` N sprint boyunca kullanılmayan agent'ı pasife alır; havuz şişmesini önler.

## Nasıl çalışır?

1. **Sprint sonu tetikleyici** — `sprint-controller.ts` RETRO fazında `PromotionPipeline.evaluate()` çağırır.
2. **Promotion değerlendirmesi** — temp agent/skill için `minTasks=8`, `minSuccessRate=0.85`, `minSprints=3` kriterlerine bakılır; tümü sağlanırsa `.deckent/agents/<id>/agent.json` kalıcıya kopyalanır.
3. **Demotion** — `maxFailRate=0.50`, `minTasks=5` veya `unusedSprints=5` aşılırsa agent pasife alınır.
4. **Adaptive prompt** — `adaptAgentRuntime()` son 3 sprint sonucunu inceler; `IMPROVEMENT_THRESHOLD=%70` altındaysa `PromptDiff` üretir.
5. **Rule learning** — `RuleEvolver` outcome tracker'dan varlık bazlı başarı oranları çeker; yüksek-başarı varlıklar için aktivasyon kuralı, düşük-başarı varlıklar için exclusion kuralı önerir.

```
Sprint Sonu
   ↓
PromotionPipeline.evaluate()
   ├── temp agent listele
   ├── criteria kontrol → PROMOTE / DEMOTE / WAIT
   └── identityMutationLoop() → requiresApproval → öneri veya otomatik uygula
         ↓
      RuleEvolver.generate()
         ├── conf ≥ 0.85 → auto-applied
         └── conf ≥ 0.65 → suggested
```

## Komut / Örnek

```bash
# Cross-sprint trend raporu
deckent evolve report
# Örnek çıktı:
# Evolution Report — 10 sprints analyzed
#
# NO_GO trend: → stable
#
# Agent Trends:
#   ↑ api-builder           72% → 91%
#   → doc-writer            88% → 86%
#   ↓ code-reviewer         80% → 65%

# Son 5 sprint analizi
deckent evolve report --sprints 5

# JSON çıktısı (CI/script entegrasyonu)
deckent evolve report --json

# Agent listesi (kalıcı + temp, başarı oranlarıyla)
deckent agent list
```

> **Dürüstlük notu:** `promotion-pipeline` manifest'te **lightly_used** (aktif kullanımda ama yüksek frekanslı değil). Promotion otomatik çalışır ancak temp agent oluşturulması belirli bir koşula bağlı olduğundan her sprint tetiklenmez. Scale/A-B testing (çok varyantlı paralel karşılaştırma) ise henüz implement edilmemiş → **🔜 roadmap**.

## Durum

- Olgunluk: ✅ canlı — `PromotionPipeline`, `RuleEvolver`, `adaptAgentRuntime()` sprint sonu RETRO fazında çağrılır
- 🔜 roadmap — A/B varyant karşılaştırması (paralel varyant çalıştırma + istatistiksel significance testi)
- 🔜 roadmap — Scale pipeline (1000+ sprint geçmişiyle meta-öğrenme)
- İlgili: ADR-075 (F5 Evolution Runtime Wiring) · ADR-041 (Agent Taxonomy)
- Modül: `src/orchestra/promotion-pipeline.ts` · `src/agents/adaptive-agent.ts` · `src/orchestra/rule-evolver.ts` · `src/orchestra/temp-skill-generator.ts`
- Manifest: `promotion-pipeline` → lightly_used
