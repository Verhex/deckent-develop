---
name: project_docs_security_features_redoc
description: "docs/security + docs/features içeriği 2026-06-16'da bilinçli silindi — SIFIRDAN yeniden dokümante edilecek (dizinler .gitkeep ile korundu)"
metadata: 
  node_type: memory
  type: project
  originSessionId: e2a45ffb-654f-4e9a-be6b-066477354ee9
---

**2026-06-16 repo-hijyen (commit 37e3bec5):** Alperen'in doküman-temizliği batch'inde
`docs/security/` (threat-model.md + sprint-156-review.md) ve `docs/features/` (22 numaralı
TR doküman: 00-genel-bakis … vb.) **içeriği bilinçli SİLİNDİ** — dizinler `.gitkeep` ile
korundu çünkü **ikisi de sıfırdan yeniden dokümante edilecek**.

**Sonraki oturum için:** Bu dizinler boş görünüyorsa eksiklik/kayıp DEĞİL — kasıtlı temiz-sayfa.
Yeni dokümantasyon yazılınca:
- `docs/features/` — ürün özelliklerinin güncel, doğru, i18n-temiz anlatımı (eski numaralı TR
  seti stale'di). `docs/index.md`'deki "Features" bölümü şu an "_being rewritten_" notu taşıyor →
  yeni docs gelince linkleri geri ekle.
- `docs/security/` — threat-model + güvenlik dokümantasyonu yeniden. `tests/docs/security-md-current.test.ts`
  threat-model bloğu çıkarıldı → yeni güvenlik docs landing'de coverage testini geri ekle.

İlgili: aynı batch `docs/directives/` sildi (yeri yok), `docs/sprints` + `docs/reviews` →
`docs/archive/`'e taşıdı, `docs/alperen-analysis` → `docs/analysis` rename. `.deckent/` reorg
planı (config kökte, runtime/settings/nervous/recently-works) ayrı + TAZE-oturum bekliyor:
plan `/home/alperen/.claude/plans/enumerated-finding-falcon.md` (DURUM: .deckent FAZ0+1 bitti).

Not: tests/docs'ta **57 kronik pre-existing doc-drift** fail'i var (README/SECURITY.md/blueprint/
agent-guide/release-notes içerik-senkron) — bu temizlikle ilgisiz, ayrı bir doc-doğruluk işi.
