---
name: project_limit_ledger_broken_chain_20260611
description: "deckent usage 2,4× düşük raporluyor (stale model-key→opus/haiku=$0) + retro Limit-burn 0-caller dormant; L≈$651/hafta 4-nokta kalibre; F1-TOK gerçek kazanç −%33 ve 276+ eridi; interaktif CC yakımın %58'i"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d825a48-d375-4d53-a5ec-5758d11f893c
---

2026-06-11 W3 kalibrasyonu (%51→%76 = $162.70, formül 3.+4. noktada doğrulandı; haftalık bütçe **L≈$651** ±%5):

1. 🔴 **P1 ledger bug:** `defaultCostPrices` (src/cli/commands/usage.ts:86) cost-config'in stale anahtarlarını kullanıyor (`claude-opus-4-6`, `claude-haiku-4-5`); transcript'ler `claude-opus-4-8` + `claude-haiku-4-5-20251001` → eşleşmeyen model **sessizce $0** (limit-ledger.ts:203). CLI+MCP+REPL /usage üçü de **2,4× düşük** ($25 vs $60, sprint 274-281). Token SAYIMI doğru, yalnız $ dönüşümü kırık.
2. 🔴 **P1 dormant:** `buildLimitBurnRow` (sprint-reporter.ts:499) 0-caller — retro "Limit burn" satırı hiç çıkmadı (Sprint 273-004 lafzen kapanmış, wire yok; F5/211 deseninin tekrarı).
3. 🟡 **F1-TOK errata:** gerçek kazanç sonnet-only −%33 ($0.67→$0.45), rapor edilen −%58 bug'lı fiyatlaydı; kazanç 276-280'de $0.54-0.70'e **geri eridi** (yeni prompt içeriği: SharedMemory, PLAN-INT, büyüyen ADR seti). Prompt-boyut regression-gate yok.
4. **Devrilme:** yakımın %58,5'i artık interaktif CC (tek ADR-review oturumu $65 > 3 sprint fleet'i); interaktif fable cw-ağır (%61) — >5dk boşluklar TTL öldürüyor, her dönüş tam prefix yazıyor.

**Why:** Ölçüm zincirinin kendisi de stale-data ile sessizce yanlışa düşebiliyor; iki izleme kanalı birden kör olunca regresyon 8 sprint görünmez kaldı.

**FIX DURUMU (aynı gün, 06-11 akşam):** 4 kırık halka KAPATILDI (kod landed, build+/mcp-restart bekliyor): (1) `resolveModelPrice` family-fallback + alias data fix + unknown-model uyarısı; (2) `buildSprintLimitBurnRow` → finalizeSprint wire (dormant fonksiyonda 2 gizli kusur daha vardı: yanlış root semantiği + boş taskMap); (3) cost-guard `limitCost(records,{})` + yanlış-kök fix (sprint-scoped); (4) MCP `deckent_usage` tüm-modeller-$0 fix. Ortak: `buildLedgerPrices` + `buildTranscriptTaskMap` core'da teklendi. Doğrulama: build sonrası `deckent usage --sprint 280` ≈ $11.83 ($2.86 değil); sonraki retro'da `### Limit Burn` bölümü. Detay: rapor §9.

**2026-06-19 YENİ SYMPTOM (Alperen gözlemi, autonomous-v2 dogfood sprint'leri):** worker `.result` dosyalarında **`tokenUsage` = 0 / boş** — bu $ dönüşüm bug'ından (yukarı §1, token SAYIMI doğruydu) **FARKLI**: COUNT'ın kendisi sıfır. Muhtemel kök: **docker-worker backend `.result`'a token usage yazmıyor** (spawn-backend/result-collector usage-capture gap'i). Doğrula: bir v2-sprint result'ında `tokenUsage.inputTokens/outputTokens` 0 mı → docker worker'ın provider-usage'ı .result'a aktardığı yeri kontrol et (worker.ts result-write + docker-backend stdout-parse). Usage-ledger zaten kör (§1-2); bu COUNT-kaynağını da kör ediyor → uçtan-uca usage izleme onarımı bu halkayı da içermeli.

**How to apply:** Kalan işler: (1) boot-cw/worker eşik regression-gate (P2 — §5 erimesi tekrarını yakalar), (2) interaktifte fable yerine opus/sonnet politikası (P2), (3) haftalık `%limit ↔ ledger-$` çapraz-kalibrasyon ritüeli (P3), (4) pre-existing MCP tool-count testleri (32/33 bekliyor, 34 oldu — Sprint 275 artığı, bizim diff değil). Rapor: docs/alperen-analysis/2026-06-11-sprint273-now-usage-calibration.md. İlgili: [[project_fable5_subscription_window]], [[feedback_zero_hardcode_live_data]], [[feedback_directive_kanit_letter_vs_goal]], [[feedback_trust_brain_eval_not_worker]]
