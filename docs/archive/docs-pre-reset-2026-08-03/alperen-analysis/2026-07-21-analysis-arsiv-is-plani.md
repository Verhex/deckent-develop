# 2026-07-21 — `.analysis/` Arşivleme İş-Planı (uygulama Alperen-emriyle)

> **Statü: ✅ ONAYLI PLAN (Alperen 2026-07-21 karar-turu — A1-A5 kabul; `born-backlog.json`
> kapsam-DIŞI/yerinde kalır). Henüz hiçbir aksiyon alınmadı; uygulama temizlik-gününde.** Analiz-temeli:
> `2026-07-21-dokuman-temizlik-karar-tablosu.md` #5 (referans-envanteri + refleks-listesi orada).
> Bu doküman uygulama-adımlarını sıraya koyar; "başla" emri gelince bu sıra izlenir.

## Hedef
`.analysis/` altındaki tarihî analizler → **`.analysis/archive/`** (dizin-İÇİ arşiv; `git mv` ile,
tarihçe korunur). İçerikler kritik değil (analizler gerektikçe yeniden yapılır — Alperen 2026-07-21);
kritik olan **link/referans bütünlüğünün korunması**.

## Kapsam-DIŞI (arşive girmez)
| Öğe | Neden |
|---|---|
| `xverify/` | Alperen-kararı + kod yazma-hedefi (`cli/commands/xverify.ts:236`) |
| `ozet-notu-2026-07-18.md` + `ozet-notu/` | Codex-goal **protected-dirty** (goal kapanana kadar dokunulmaz) + inventory-script yazma-hedefi |
| `u4-olcum/` + `a6-sinav-u1/` | Script okuma/yazma-hedefi (taşınacaklarsa A5'te script-sabitleriyle birlikte) |
| `born-backlog.json` | Çalışma-defteri görünümünde — **arşiv-kararı Alperen'e ayrı soru** (⬜) |

## Adımlar (sıralı)

### A1 — `git mv` (taşıma)
`mkdir .analysis/archive` → kapsam-dışı liste HARİÇ tüm üst-düzey dosyalar `git mv .analysis/<f> .analysis/archive/<f>`.
Untracked-dirty dosyalara (`ozet-notu*`, xverify raporları) dokunulmaz.

### A2 — `adr-g-006-amendment-v3` referans-düzeltmesi (ZORUNLU — CI)
Tek dosya: `docs/adr/archive/adr-g-006-amendment-v3-2026-07-14.md`.
**15 markdown-link** (satırlar: 25 · 43 · 44 · 45 · 46 · 57 · 59 · 233–239), hepsi aynı desen:

```
ESKİ: ](../../.analysis/routing-v3-<dosya>.md)
YENİ: ](../../.analysis/archive/routing-v3-<dosya>.md)
```

Hedeflenen 7 dosya: `routing-v3-system-debug` · `-appendix-signal-inventory` · `-appendix-misroute-corpus` ·
`-appendix-patch-history` · `-intent-taxonomy-inceleme` · `-secenek-b-detay` · `-design-spec` (hepsi `-2026-07-14.md`).
Mekanik tek-desen değişiklik; uygulama Edit `replace_all` (`](../../.analysis/routing-v3-` → `](../../.analysis/archive/routing-v3-`).

### A3 — `.lintlinkignore` (ZORUNLU — CI)
Bir satır eklenir: `.analysis/archive/**` ("Sprint/audit history" bloğuna — dosyanın kendi gerekçesi
zaten "historical artifacts, link-rot acceptable"). Bu, taşınan dosyaların KENDİ içindeki bayat-linklerin
lint'i kırmasını önler; A2'deki adr-linkleri ignore'a girmez, gerçekten düzeltilir.

### A4 — Doğrulama (DoD)
1. `npm run lint:link` → **yeşil** (A2+A3 kanıtı)
2. `npm run test:ci-sim` → `.analysis` gizleme-semantiği değişmedi (dizin-içi arşiv olduğundan beklenti: dokunulmamış)
3. `git status` → yalnız beklenen taşıma+2 düzenleme; başka dosya kirlenmedi

### A5 — İsteğe-bağlı kuyruk (ayrı mini-dilim, zorunlu değil)
- Kod-yorumu spec-yolları (×15: `src/core/routing/*` 9 · planner · auditor · config-types · decision-types · 2 test) → `archive/` yoluna sed-dalgası (davranış etkisi SIFIR; truth-hijyeni)
- `u4-olcum`/`a6-sinav-u1` taşınacaksa: `generate-analysis-inventory.mjs:15-16` + `measure-prompt-cost.mjs:51` sabitleri birlikte
- MASTER-PLAN'daki 14 düz-metin anışı GÜNCELLENMEZ (tarihsel kayıt — o günün doğrusu)

## Commit
Tek commit önerisi: `chore(analysis): tarihî analizler .analysis/archive/ altına + adr-g-006 link-refleksi (lint:link yeşil)`.
Commit+push Alperen-onayıyla (kural).
