# CODEX GÖREV PROMPT'U — TUR 3: HOLD kapanışı (dar kapsam, bitirme turu)

> Hazırlayan: Claude (Opus 5), 2026-08-02 · Durum: Alperen onayına sunuldu (şerit onaylı, prompt içeriği gözden geçirilmedi) · Önceki tur: Tur-2 kabul edildi (82 dosya, %93,6 kapsam, dürüst HOLD).
> Bu tur **küçük ve kesin**: yeni doküman yazma turu DEĞİL. Amaç, Tur-2'nin açık bıraktığı HOLD'ları kapatıp coverage matrisini dürüstçe %100'e taşımak.

## Tur-2 sonrası owner tarafında ZATEN KAPANDI (tekrar uğraşma)

Bunlar Claude tarafından 2026-08-02'de koşuldu ve yeşil; senin tekrar dokunman gerekmiyor:

1. **`docs:ref:check` 5/5 missing → ÇÖZÜLDÜ.** Kök neden senin raporladığın gibiydi: docs-reset'te pipeline'ın sahip olduğu üç dizin (`docs/generated/`, `docs/adr/`, `docs/reference/`) elle-yazılan doküman sanılıp arşive taşınmıştı. `docs/generated/*` ve `docs/adr/*.md` (51 dosya) arşivden geri alındı, `npm run docs:ref` koşuldu → 5/5 in-sync.
2. **`lint:master-plan` IDENTITY_REGISTRY_MISSING → ÇÖZÜLDÜ.** Aynı kök neden (`docs/generated/master-plan-active.json` arşive gitmişti). Geri alındı → OK, 322 satır / 318 aktif / 22 receipt, projeksiyonlar in-sync.
3. **`lint:link` 33 hata → ÇÖZÜLDÜ (0 hata).** 30'u `.analysis/**` içindeki rename-envanterinin *alıntıladığı* link metinleriydi (sahte pozitif) → `.lintlinkignore`'a `.analysis/**` eklendi (`docs/analysis/**` zaten listedeydi, tutarsızlık giderildi). 3 gerçek kırık link (`CHANGELOG.md` ×2, `CONTRIBUTING.md` ×1) arşiv/yeni hedeflere yönlendirildi.
4. **Quickstart 4 komutu gerçek binary'de doğrulandı** (`--version-json`, `doctor --json`, `onboard --plan-only --json`, `status --json`) — hepsi exit 0, README'nin sayıları birebir tutuyor (doctor 15/17 geçti, kalan 2 non-required: Brain Budget + Gemini auth; `configPlan.applied=false`).
5. **README'nin sayı iddiaları bağımsız doğrulandı:** `truth --json` → 5 kontrat, senin yazdığın verdiktlerin aynısı (training-trace tam, tool-surface/worker-approval-gate/routing-journal proof yok, prompt-gate-block wired:none). Manifest → 21 active / 4 lightly_used / 9 dormant / 1 dead. `TOOL_CATALOG` → 49 tool. Hepsi ✅.

## Bu turda YAPILACAK İŞ — tek kalem: 42 `EKSİK` satırın kapatılması

`docs/analysis/COVERAGE-MATRIX-2026-08.md` içinde 42 satır şu gerekçeyle `EKSİK`: *"hedef mevcut; arşiv eşdeğeri güncel doğrulama henüz tamamlanmadı"*. Arşiv alt-ağacına göre dağılımları:

| Arşiv alt-ağacı | Satır | Sınıf |
|---|---|---|
| `launch/` | 10 | tarihsel |
| `release/` | 6 | tarihsel |
| `audits/` | 6 | tarihsel |
| `analysis/` + `alperen-analysis/` | 4 | tarihsel |
| `SPRINT-LOG.md` · `CHANGELOG.md` · `HANDOVER-CODEX*.md` ×2 · `index.md` | 5 | tarihsel |
| `design/` | 4 | **canlı-ilgili** |
| `superpowers/` | 3 | **canlı-ilgili** |
| `architecture/` | 2 | **canlı-ilgili** |
| `adr/` | 1 | **canlı-ilgili** |
| `reference/` | 1 | **canlı-ilgili** |

### Adım A — 32 tarihsel satırı doğru şekilde kapat (doğrulama DEĞİL, sınıflandırma)
Launch duyurusu, release notu, geçmiş sprint audit'i, devir belgesi ve changelog gibi kayıtlarda "bugünkü koda karşı yeniden doğrulama" diye bir kavram yoktur — bunlar olay-kaydıdır ve arşivde doğru yerdedir. Bu satırların durumunu şu şekilde değiştir:

`TARİHSEL — arşiv olay-kaydı; canlı doküman iddiası taşımaz, yeniden doğrulama uygulanmaz. Kaynak arşivde erişilebilir.`

**Şartı var:** her satır için, o arşiv belgesinin **bugün hâlâ geçerli bir iddia taşıyıp taşımadığını** bir kez kontrol et. Taşıyorsa (örneğin bir release notu hâlâ geçerli bir kurulum kontratı anlatıyorsa) o satırı `TARİHSEL` yapma — Adım B'ye taşı. Kararını satırda tek cümleyle gerekçelendir.

### Adım B — 10 canlı-ilgili satırı gerçekten doğrula
`design/` (test-containment E2 authority, TOOL-CU computer-use pack, web-console ×2), `superpowers/` (3), `architecture/` (2), `adr/` (ADR-010 commander.js tek-runtime-bağımlılık, ADR-090 Ink+React), `reference/` (1).

Her biri için:
1. Arşivdeki iddiayı çıkar.
2. **Bugünkü koda karşı doğrula** (`dosya:satır` kanıtı veya salt-okunur gerçek-binary çıktısı). ADR-010 için `package.json` dependencies'e, ADR-090 için Ink/React sürümlerine fiilen bak.
3. Hedef dokümandaki (`docs/{lang}/…`) karşılığı bugünkü gerçeği yansıtıyor mu? Yansıtmıyorsa **hedef dokümanı düzelt** (yazma iznin var) ve dürüst etiketi (`✅ / ⚠️ / 🔜`) koy.
4. Satırı `KAPSANDI` yap, kanıtı yaz.

### Adım C — Matris özetini güncelle
Üstteki "Güncel özet" bloğunu yeniden hesapla. Hedef: `EKSİK` = 0; her satır ya `KAPSANDI` ya `TARİHSEL`. Doluluk yüzdesini iki sınıfı ayrı gösterecek şekilde yaz (şişirme yok).

## Bağlayıcı sınırlar (Tur-1/2 ile aynı)
- Yazma: yalnız `docs/**` + kök `README.md` / `README.tr.md`. Kod/test/script/`dist` **READ-ONLY**. `.brain/`, `.tasks/`, `.deckent/` yazma yok.
- **`docs/generated/`, `docs/adr/`, `docs/reference/` artık canlı pipeline dizinleridir — ELLE DOKUNMA.** (Bu turda geri getirildiler; `npm run docs:ref` sahibi.)
- `docs/MASTER-PLAN.md` ve `docs/archive/**` dokunulmaz (okumak serbest ve zorunlu).
- Deckent sprint/run/autonomous/do komutu **YOK**. Salt-okunur `--help` / `--json` / `status` serbest.
- **Commit/push YOK.** (Tur-2'de commit'i Alperen kendisi attı; sen atma.)
- Belirsizlik → `docs/analysis/OPEN-QUESTIONS-2026-08.md`'ye numaralı typed soru. Mevcut ledger 28; üstüne ekle.

## Teslim
Tek özet: `TARİHSEL` sayısı · `KAPSANDI`'ya çevrilen sayı · Adım B'de bulunan bayat-iddia sayısı (ve düzeltilen hedef dosyalar) · yeni açık soru sayısı. Bitmeyen satır dürüstçe `EKSİK` kalır — "tamamlandı" enflasyonu yok.
