# CODEX GÖREV PROMPT'U — TUR 2: Kapsamlı Dokümantasyon (arşiv-seviyesi derinlik, çift-perspektif)

> Hazırlayan: Claude (Fable 5), 2026-08-01 · Onay: Alperen · Önceki tur: HOLD (haklı) — bu tur HOLD nedenlerini çözer ve kapsamı büyütür.
> Owner geri bildirimi aynen: "istediğim detayda hazırlanmadı; hem dogfood repo gerçeği hem product-user tarafı için deckent'in TÜM özelliklerini anlatan dokümantasyon istiyorum; arşivdeki dokümanlar çok detaylı ve kapsamlıydı — aynı kapsam, detay ve doğrulama seviyesinde iş istiyorum."

## Tur-1 HOLD çözümleri (owner kararları)
1. **README çelişkisi çözüldü:** yazma iznin artık `docs/**` + repo kökünde **yalnız** `README.md` ve `README.tr.md`. (Mevcut `README-TR.md` varsa içeriğini `README.tr.md`'ye taşı, eskisini `docs/archive/docs-pre-reset-2026-08-03/`'e taşı — kökte tek TR adı kalsın.)
2. **`docs/generated/`:** elle yazma yasağı sürüyor. `docs:ref:check` (5/5 missing) ve `lint:master-plan` (IDENTITY_REGISTRY_MISSING) fail'lerini SEN ÇÖZME; kök nedenini (hangi script hangi dosyayı bekliyor, kaynak nerede) CODE-DOC-DIFF raporuna ekle. Pipeline regen'i Claude+Alperen pazartesi koşacak.
3. **Provider-observation DB v1→v2 migration:** docs işi değil; fark-raporunda kalsın, MASTER-PLAN adayı olarak işaretli.

## Bağlayıcı sınırlar (Tur-1 ile aynı, README istisnası eklenmiş)
- Yazma: yalnız `docs/**` + kök `README.md` / `README.tr.md`. Kod/test/script/dist READ-ONLY. `.brain/`, `.tasks/`, `.deckent/` yazma yok. Deckent sprint/run/autonomous komutu yok (read-only `--help`/`status` serbest). Commit/push yok. `docs/MASTER-PLAN.md` ve `docs/archive/**` dokunulmaz (arşivden OKUMAK serbest ve bu tur ZORUNLU).
- Belirsizlik → `docs/analysis/OPEN-QUESTIONS-2026-08.md`'ye typed soru (mevcut 18'in üstüne ekle, numaralandır).

## Adım 1 — Kapsam envanteri (yazmadan önce, zorunlu)
`docs/analysis/COVERAGE-MATRIX-2026-08.md` üret. Satırlar üç kaynağın BİRLEŞİMİ:
(a) `docs/archive/docs-pre-reset-2026-08-03/` içindeki tüm doküman konuları (guide/, features/, cookbook/, reference/, architecture/, governance/, security/, launch/ …) — arşiv, kapsam çıtasıdır;
(b) gerçek yüzeyler: 211 CLI komut yolu, 49 MCP tool, 6 DB, config alanları;
(c) `.deckent/features-manifest.json` özellik listesi.
Her satır: `konu · arşivdeki kaynak dosya · yeni hedef dosya · perspektif (dogfood/user/ikisi) · durum`. Bu matris işin ilerleme SSOT'udur; her doc bitişinde güncelle.

## Adım 2 — Çift-perspektif yazım kuralı (her dokümanda)
- **Product-user perspektifi:** deckent'i ürün olarak kullanan kişi için — özellik ne yapar, nasıl kullanılır, örnek komut + gerçek çıktı, hangi config'le açılır. Solo kullanıcıdan enterprise'a (Law 1).
- **Dogfood/repo-gerçeği perspektifi:** aynı özelliğin BUGÜNKÜ gerçek durumu — canlı mı, hangi modül, bilinen kısıtlar/HOLD'lar. Çalışmayan şey "çalışıyor" diye yazılmaz; dürüst etiket: `✅ canlı · ⚠️ kısmi (neden) · 🔜 roadmap`.
- İki perspektif aynı dosyada ayrı bölüm olarak durur; kullanıcı-anlatısı pazarlama diline kaçmaz, kanıtsız üstünlük iddiası yok.

## Adım 3 — Üretilecek yapı (EN canonical + TR tam-parite ayna; mevcut 13 dosyanın ÜSTÜNE)
```
README.md / README.tr.md          — ürün vitrini + 5-dk quickstart (gerçek koşu)
docs/en|tr/
  guide/                          — kullanıcı el kitabı: init→plan→start→review→retro,
                                    autonomous, do/task mode, chat/REPL, terminal, dashboard,
                                    desktop, connectors (telegram/discord/whatsapp), workers,
                                    memory & recall, nervous system, recovery & troubleshooting
  features/                       — özellik kataloğu (features-manifest + arşiv features/ çıtasında,
                                    her özellik: ne/neden/nasıl/komut/durum-etiketi)
  reference/                      — api-surface (HTTP/SSE), task/result/lock formatları,
                                    config şeması alan-alan, exit/error kodları (DECKENT_E***),
                                    agent kataloğu (21+2), skill kataloğu (30)
  operations/                     — dogfood gerçeği: sprint lifecycle iç işleyişi, evidence/
                                    settlement zinciri, bilinen sürtünmeler (PAZARTESI.md FAZ 4a-ek
                                    bulguları dahil), güvenli recovery prosedürü (owner-onay kapılı)
  governance/                     — 3 Yasa, ADR sistemi nasıl çalışır (ADR'ler memory.db'de yaşar,
                                    md kopya değil), precedence zinciri, RBAC/authority (ADR-G-020)
  glossary.md                     — arşivdeki glossary çıtasında, TR-EN terim tablosu
```
Mevcut 12 çekirdek dosya (overview/architecture/cli/mcp/db/configuration) bu ağaçla çelişirse onları genişlet, çoğaltma.

## Adım 4 — Doğrulama çıtası (Tur-1 ile aynı, taviz yok)
Her komut gerçek binary'de koşulur (`node dist/cli/entry.js …`), her şema gerçek PRAGMA/kaynaktan, her iddia `dosya:satır` veya koşu-çıktısı kanıtlı. Arşivden içerik TAŞINIRKEN her iddia bugünkü koda karşı yeniden doğrulanır — arşiv kapsam çıtasıdır, gerçeklik kaynağı DEĞİLDİR (bayat iddiayı kopyalamak ihlaldir). EN/TR yapısal parite + index linkleri + `git diff --check` temiz.

## Adım 5 — Teslim
Özet: coverage-matrix doluluk % · üretilen dosya sayısı · koşulan komut sayısı · yeni fark sayısı (CODE-DOC-DIFF'e ek) · yeni açık soru sayısı. Bitmeyen satır coverage-matrix'te `EKSIK (neden)` olarak dürüstçe kalır; "tamamlandı" enflasyonu yok. Bu iş büyük — matris sırasına göre guide→features→reference→operations→governance ilerle; yarıda kesilirse matris kaldığın yeri gösterir.
