---
name: feedback_haiku_doc_only_no_code
description: "BAĞLAYICI KURAL (2026-06-12): haiku ASLA tsx/kod işine verilmez — YALNIZ dokümantasyon; DIRECTIVES yazarken ve FIX-reroute'ta uygula; routing-enforcement product-maddesi ROUTE-1 ailesine"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7d76d576-6e17-44f7-8213-5be8dd2ff7f4
---

**Kural (Alperen, 2026-06-12, sprint-283 sırasında):** "haiku asla tsx vs işlerine verilmemeli. sadece dokümantasyon işleri için kullanılmalı."

**Why:** Sprint-283'te 283-012/283-003 (tsx i18n-temizliği) haiku'ya verildi → ilk deneme FIX'e düştü; FIX-router üstüne doc-writer+haiku'ya re-route etti (i18n kelimesi doc kokuyor — misroute). Economy-tier model React/tsx/kod kalitesini taşıyamıyor.

**How to apply:**
1. **DIRECTIVES yazarken:** kod-dokunuşlu HER task (tsx/ts/css dahil — "i18n-temizliği" gibi kod-içi metin işleri DE kod işidir) min. sonnet; haiku yalnız saf-markdown/doc-write/changelog.
2. **FIX/reroute anında:** haiku'ya düşen kod-task'ı spawn-öncesi sonnet'e çevir (283-003-fix'te yapıldı: haiku+doc-writer → sonnet+frontend-designer).
3. **Ürün-tarafı (deckent):** routing-engine'e tier-guard — economy-tier yalnız `document-write`/`audit` TaskKind'lara route edilir, `code-development`'a YASAK (override açık kalır). ROUTE-1/ARC-E ailesine madde (sprint-283 kapanışında MASTER-PLAN'e işlendi-/işlenecek).
4. Genel katmanlama ([[project_fable5_subscription_window]]): fable=planlama+çok-zor, opus=zor, sonnet=normal+kod, **haiku=YALNIZ doc**.
