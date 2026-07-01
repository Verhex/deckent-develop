---
name: feedback_dont_relitigate_decided_architecture
description: Verili mimari kararı (özellikle accepted ADR-G/anayasa) yeni-fikir gibi geri açma; ölçek gerekçesiyle MVP-hedge önerme. Öneri öncesi ADR + memory tara.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3ece1803-d6f1-4c30-8b0e-f14035d81d88
---

Alperen (2026-07-01): Paperclip↔Deckent karşılaştırmasında persistence için "SQLite vs Postgres — çözmen gereken çatal" + "SQLite default kalsın, opsiyonel Postgres backend" önerdim. Alperen düzeltti: *"zaten SQLite yerine vektör/Postgre süreçlerini zamanında seninle konuşmuştum, ölçeğimizi hep belirttim; bugün Postgres daha iyi diyorsun — olmadı Claude."*

**Hata (iki katman):** (1) `adr-g-035` (accepted, Global-Constitution) **"better-sqlite evrim, vector-DB'ye göç YOK"** kararını okumadan/hatırlamadan geri açtım — verili bir anayasa-kararını "açık çatal" diye sundum. (2) "default X kalsın + opsiyonel Y" = yarım-çözüm/**MVP-hedge** → Yasa #3 (MVP ASLA) ihlali.

**Why:** Alperen ölçeği (solo→en büyük enterprise, milyon-scale) her zaman net verdi ve mimari kararları birlikte ADR'ye çaktık. Verili kararı yeniden-tartışmak hem zaman kaybı hem güven zedeleyici; hedge-öneri god-level çıtasına aykırı.

**How to apply:**
- Bir mimari/DB/persistence/ölçek önerisi yapmadan ÖNCE: ilgili **accepted ADR'leri** (özellikle ADR-G-*) + memory'yi tara (`deckent recall`, `docs/adr/`, memory index). Karar verilmişse onun ÜSTÜNE inşa et, geri açma.
- "Şüphe varsa çatal sun" yalnız GERÇEKTEN açık konularda; verili kararda çatal sunma.
- Ölçek-argümanıyla "basit tut/opsiyonel yap" önerme — tam-kapsam tek yönü ver.
- Somut yeni kanıtla bir kararın yanlış olduğunu düşünüyorsan: hedge etme, kararı+kanıtı adıyla anıp tek net soru sor (bkz. advisor reconcile deseni).

Bkz. [[project_persistence_direction_sqlite_evolution]] · [[feedback_no_minimum_no_mvp_deckent]] · [[project_adr_taxonomy_redesign_2026_06]].
