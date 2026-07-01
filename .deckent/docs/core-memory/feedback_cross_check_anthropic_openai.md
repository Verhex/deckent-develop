---
name: feedback_cross_check_anthropic_openai
description: "YENİ BAĞLAYICI KURAL (Alperen 2026-06-12): Anthropic modellerinin işini OpenAI, OpenAI'nin işini Anthropic DENETLER (karşılıklı cross-check). Bir süre işleri/sprint'leri TASK MODUNDA cross-check ile yürüteceğiz — brain-eval tek başına yetmez. XVER-1 altyapısı (cross-verify-runner.ts) var ama default-off; aktifleştir + task-moduna wire."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7d76d576-6e17-44f7-8213-5be8dd2ff7f4
---

**Kural (Alperen, 2026-06-12):** "Anthropic modellerinin işlerini openai, openai işlerini anthropic modellerine denetleteceğiz. sprintlerde zaten brain var ama bir süre işleri sprintleri cross check yaparak task modunda yürüteceğiz."

**Why:** 10 günlük "fix→regresyon→re-fix" döngüsü + tek-provider (Anthropic) körlüğü. Aynı-aile model kendi kör-noktasını denetleyemiyor; çapraz-provider denetim bağımsız-perspektif sağlar. [[project_deckent_native_terminal_agent]] gibi kök-sebeplerin daha erken yakalanması hedef.

**How to apply:**
1. **Task-modu cross-check:** `runTaskMode` (task-mode-runner.ts:93) işlerinde, üreten-provider Anthropic ise denetleyen OpenAI (codex), üreten OpenAI ise denetleyen Anthropic. Karşılıklı, otomatik.
2. **Altyapı var:** `src/orchestra/cross-verify-runner.ts` (XVER-1, ADR-074/Sprint 276) — ama config `cross_verify` default-off + advisory. Aktifleştir, task-moduna gerçek-wire et (sadece sprint-eval değil).
3. **Bir SÜRE bağlayıcı** (kalıcı değil — "bir süre"): mevcut güven-krizini kırana kadar işler cross-check'li task-modunda; sonra Alperen yeniden değerlendirir.
4. CC (ben) işlerimde de bu ilkeyi taşırım: kritik kararlarda/fix'lerde çapraz-perspektif (gerekirse codex/gemini'ye denetlet) — özellikle "çözüldü" demeden önce.
5. Subscription-aware maliyet ($0 OAuth fleet'lerde, [[sprint_254_followup_fixes]] F1-CB); ikinci-provider yoksa dürüst-skip (sessiz-geçme YASAK).

İlgili: [[feedback_trust_brain_eval_not_worker]] (brain-eval ipucu, disk-verify ground-truth) — cross-check bunun çapraz-provider katmanı.
