---
name: feedback_dual_perspective_dogfood_product
description: Her işte 2 bakış açısı ZORUNLU — deckent dogfood + deckent product (user/enterprise deneyimi); asla sadece deckent-iç-ihtiyacı için düşünme
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7d76d576-6e17-44f7-8213-5be8dd2ff7f4
---

**⚖️ DEĞİŞTİRİLEMEZ YASA #1** (CLAUDE.md 🔒 bölümüne terfi, Alperen 2026-06-24): değiştirilemez, teklif edilemez, ihlal edilemez; model/oturum/ortam bağımsız; tekrar hatırlatılması gerekmez — uygulamak Claude'un (Anthropic) sorumluluğu. **User tarafı = solo/basic kullanıcıdan dünyanın en büyük şirketlerine kadar tüm ölçek ve scope** (milyonlarca user + milyonlarca proje). Bkz. [[feedback_millions_environments_scale]] (Yasa #2), [[feedback_no_minimum_no_mvp_deckent]] (Yasa #3).

deckent geliştirilirken HER ZAMAN iki bakış açısı birlikte tutulmalı (Alperen 2026-06-11, bağlayıcı):
1. **deckent dogfooding** — deckent kendi sprint'lerini koşar, kendi kodunu geliştirir (iç orkestrasyon kalitesi).
2. **deckent product** — son-kullanıcı (user) + enterprise kişilerin DENEYİMİ ve İŞLEVSELLİĞİ. Chat + Dashboard dahil, kusursuz ürün deneyimi.

**Why:** deckent milyonlarca kullanıcıya hitap eden, develop→product repo'ya taşınacak bir ÜRÜN. İşleri yalnız "deckent kendi işine yarasın" diye (dogfood-iç-plumbing) düşünmek ihlaldir — her task'ın net bir user/enterprise deneyim faydası da olmalı.

**How to apply:** Her sprint/task planlarken sor: "(a) Bu deckent'in kendi orkestrasyonunu iyileştiriyor mu? (b) Bu user/enterprise için ürün deneyimini/işlevselliğini iyileştiriyor mu?" İkisinden en az biri net olmalı; salt-iç-plumbing task'lar product-değer lensiyle gözden geçirilmeli. "Wired" ≠ "user-working" — serve/chat/dashboard'ı gerçekten dene ([[feedback_wiring_pct_vs_user_working]]). İlgili: [[project_deckent_runtime_ecosystem]] (3-yüz), [[feedback_no_minimum_no_mvp_deckent]] (god-level).
