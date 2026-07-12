# ADR-G-036: Zero-Hardcode Model & Flow Values (Parametric-Only)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=ratchet-gate (`scripts/lint-no-model-literal.mjs` + `scripts/model-literal-baseline.json`; yeni literal CI-kırmızı, 85 mevcut site grandfathered) + canlı-validasyon (`getAllKnownModelIds()` — donmuş liste yasak) → tomorrow=baseline-erime (85→0) + provider/akış-değerlerine aynı desenin genişletilmesi
**Status:** accepted · **Date:** 2026-07-12 · **Source-authority:** Alperen (KESİN-KURAL direktifi, 2026-07-12)
**Crosswalk:** born-682/683/684/685 → MASTER-PLAN 565

> **Kural-cümlesi (verbatim niyet):** "Sistemde hardcode bir akış asla istemiyoruz — her şey
> sistematik ve parametrik olacak. Sonnet kullanmayan kullanıcı olursa sistem ayakta kalamazsa,
> sonnet model adı değişirse sistem ayakta kalamazsa patlarız. 0 hardcode."

---

## Context

deckent kod-yollarında model-adı (`sonnet`/`opus`/`haiku`/`gpt-*`) ve akış-değerleri string-literal
olarak yaşıyordu: envanter (2026-07-12) ~19 gerçek-ihlal — config `DEFAULT_MODES` preset'leri,
`tmux.ts` spawn-fallback'i, MCP/CLI komut default'ları, autonomous-planner çağrıları — artı
NL-planner'ın kalbindeki `callZeroConfigPlanner(desc, 'sonnet', …)` (born-682).

**Canlı-ispat (aynı gün):** Brain'in gpt-5.6-sol'a devri, `validateConfig`'in modül-yükleme anında
DONAN `ALL_MODELS` snapshot'ı tarafından reddedildi — registry modeli tanıyordu, validasyonun kendi
kopya-listesi tanımıyordu (fix: `a2736e71`). Sonnet kullanmayan bir kullanıcı ya da bir model-adı
değişikliği sistemi düşürebilirdi; milyonlarca ortam/kullanıcı hedefi (Yasa #2) ve model-agnostik
yaşam bununla bağdaşmaz.

---

## Decision (Today)

1. **Literal YASAK:** Kod-yollarında model-adı, provider-adı ve akış-değeri string-literal olarak
   yazılamaz. Literal yalnızca tek-kaynak SSOT'ta yaşar: `src/core/model-registry.ts`
   (BUILTIN + CODEX_PARITY + OLLAMA aileleri).
2. **Tek-kaynak çözümleme:** Default'lar ve seçimler resolver'lardan gelir —
   `resolveDefaultModel(config)` · `resolveBrainModel(config)` · `resolveBrainPlanningMode(config)`
   · `getAllKnownModelIds()` (validasyon-anında canlı registry-listesi; donmuş snapshot yasak).
3. **Mekanik enforcement:** `scripts/lint-no-model-literal.mjs` ratchet-gate
   (`lint-no-spawnsync` emsali 1:1): tespit-edilen literal-seti bile registry'den TÜRETİLİR
   (elle liste yok); mevcut 85 site `model-literal-baseline.json`'da grandfathered; **yeni literal
   CI'da kırmızı**; `tests/scripts/lint-no-model-literal.test.ts` live-baseline-in-sync regresyonu.
4. **Dürüst düşüş:** Config'te var-olmayan/yeniden-adlanan model → typed-hata + görünür fallback;
   sessiz çökme/sessiz-default yasak.

## Decision (Tomorrow)

- Grandfathered 85 site resolver'lara taşınır ve baseline sıfıra iner (öncelik: tmux-fallback,
  CLI/MCP komut-default'ları, autonomous-planner).
- Aynı desen provider-adları ve akış-değerlerine (ör. sabit yol/etiket/eşik literal'leri)
  genişletilir; `DEFAULT_MODES` preset-değerleri tier-bazlı registry-türevi olur
  (ör. "aktif-provider'ın standard-ga modeli").

## Consequences

- Model-adı değişikliği ya da yeni model = yalnızca registry-kaydı; tüketici kod değişmez.
- Sonnet'siz (yalnız codex/gemini/ollama) kurulumlar birinci-sınıf çalışır.
- Ratchet, ihlalleri görünür tutar: baseline-diff'i her PR'da review-yüzeyidir.

## Cross-ref & İz

- **Kararın izi:** born-682 (planner-literal ✅) · born-683 (program, dilim-1 ✅ sprint-431) ·
  born-684 (gate-bulgu görünürlüğü ✅) · born-685 (gate tireli-ad bölme, açık) · MASTER-PLAN 565.
- **İlgili ADR'ler:** ADR-G-006 (Routing & Selection) · ADR-G-008 (Provider Abstraction) ·
  ADR-G-001 (Layered Config) · ADR-G-019 (bu belgenin authoring-standardı).
- **SSOT-notu:** Bu dosya `.brain/memory.db`'deki `adr-g-036` kaydının insan-okur export'udur
  (ADR-G-035 DB-first kuralı) — kod asla bu .md'yi parse etmez.
