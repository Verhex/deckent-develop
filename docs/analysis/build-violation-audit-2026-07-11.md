# BUILD-VIOLATION-GUARD Audit — born-644 — 2026-07-11

**Kapsam:** `.brain/archive/sprints/sprint-403-tasks/*.log` + `sprint-404-tasks/*.log` (stream-JSONL, `tool_use` Bash içerikleri) — "sprint-403 koşarken host-dist 08:43'te yeniden derlendi" canlı-vakasının kanıt taraması.
**Metodoloji:** `grep -o` ile `npm run build|tsc -b|npm run build:all` + `"command":"..."build` desenleri her iki sprint'in TÜM `.log` dosyalarında tarandı; her eşleşme genişletilmiş bağlamla (150 karakter önce/sonra) tek tek incelendi (sadece dize-eşleşme değil, gerçekten çalıştırılmış bir Bash komutu mu diye).

---

## Sonuç: KANIT YOK

sprint-403 veya sprint-404 arşiv-loglarında `npm run build`, `tsc -b`, veya `npm run build:all`'ı gerçekten ÇALIŞTIRAN bir `Bash` `tool_use` bulunamadı. Bulunan TÜM eşleşmeler çalıştırılmayan metin-literalleridir:

| Log dosyası | Satır | Eşleşme türü | Neden false-positive |
|---|---|---|---|
| `sprint-403-tasks/task-403-001.log` | 507, 509, 511 | `Edit` tool_use — `messages.ts` içine yazılan i18n string'i (`web.build_dashboard_hint`) | Kullanıcıya gösterilecek yardım metni ("Run 'npm run build:dashboard'..."), komut değil |
| `sprint-404-tasks/task-404-001.log` | 47 | Worker prompt'undaki DIRECTIVES-türetilmiş metin | Tam tersi: `**build YASAK (npm run build dahil — dist'e ASLA dokunma)**` — YASAK UYARISI, ihlal değil |
| `sprint-404-tasks/task-404-003.log` | 42 | Aynı DIRECTIVES-uyarı metni (diff içinde) | Aynı — yasak-uyarısı, çalıştırma değil |
| `sprint-404-tasks/task-404-004.log` | 399, 404, 409, 411, 416, 418 | `src/api/server.ts`'e yazılan JSDoc yorumu + kullanıcıya-dönük HTML şablonu (`<pre>npm run build:dashboard # or: npm run build:all</pre>`) | Dashboard-not-built sayfasının statik metni, komut çalıştırma değil |
| `sprint-404-tasks/task-404-005.log` | 8 | Worker prompt'undaki karar-tablosu satırı: `| npm run build in worker | YASAK | ... |` | Yasak-tablosu, ihlal değil |

Ek olarak `"command":".*build` deseniyle (Bash `tool_use.command` alanına özel) yapılan ikinci-tur tarama, her iki sprint'te de yalnızca **meşru** build-ilişkili komutlar buldu — hiçbiri gerçek bir build çalıştırmıyor:
- `cat > /tmp/repro.mjs ... import ... from './dist/orchestra/task-builder.js'` — mevcut (önceden derlenmiş) `dist/` çıktısını OKUYAN bir repro script'i, `dist/`'e YAZAN değil.
- `sed -n ... tests/orchestra/task-builder...` / `git diff --stat src/orchestra/task-builder...` — dosya adı önekindeki "task-builder" alt-dizgesi yanlışlıkla eşleşti, build ile ilgisi yok.
- `VITEST_MAX_FORKS=2 npx vitest run tests/.../directives-builder...` — test dosya adındaki "builder" alt-dizgesi, `npm run build` değil.

**Toplam:** 4 log dosyasında 16 ham-eşleşme taranmış, 16/16 false-positive. sprint-403'ün 4 görevinin hiçbirinde ve sprint-404'ün 5 görevinden hiçbirinde gerçek bir build-komutu çalıştırıldığına dair iz yok.

---

## Yan-bulgu: log `ts` alanı olay-zamanlaması için güvenilir değil

Her görev log dosyasının İLK ve SON satırındaki `ts` alanı karşılaştırıldığında (örn. `task-403-001.log`: ilk `05:40:51.552Z`, son `05:40:51.564Z` — 511 satır, 511 event, **12ms** aralık), açıkça görülüyor ki bu `ts` damgaları **arşivleme-anı toplu-yazım** zaman damgasıdır, gerçek olay-akışı (streaming) zamanı değil. Bu, arşivlenmiş JSONL logların ince-taneli (saniye/dakika hassasiyetinde) duvar-saati korelasyonu için kaynak olarak KULLANILAMAYACAĞI anlamına gelir — raporlanan "08:43" olayının hangi worker'ın hangi saniyede ne çalıştırdığıyla eşleştirilmesi bu veri kümesinden yapılamaz.

Bununla birlikte, bu arşivin dizin-mtime'larından çıkarılabilen kaba sprint-pencereleri şöyle:

| Sprint | Arşiv dizin-mtime (yaklaşık pencere sonu) | İçerik `ts` penceresi (batch-damgalı) |
|---|---|---|
| sprint-403 | 2026-07-11 05:44:30 | ~05:35:53 – 05:41:49 |
| sprint-404 | 2026-07-11 06:53:17 | ~06:22:26 – 06:30:56 |
| sprint-405 | 2026-07-11 07:58:16 | (bu audit kapsamı dışı) |
| sprint-406 | 2026-07-11 08:54:15 | (bu audit kapsamı dışı) |

Raporlanan **08:43** zaman damgası, bu arşivdeki sprint-403 (~05:3x-05:4x) veya sprint-404 (~06:2x-06:3x) pencerelerinin HİÇBİRİNE düşmüyor — aritmetik olarak sprint-405/406 penceresine (07:58–08:54) denk geliyor. Bu, görevin kendisinin scope'unu (yalnız sprint-403/404) genişletmeden dürüstçe not edilmesi gereken bir tutarsızlık: ya orijinal canlı-vaka raporundaki "sprint-403" ataması yanlış hatırlanmış (gerçek olay sprint-405/406 civarında olmuş olabilir), ya da bu ortamdaki arşiv zaman-çizelgesi orijinal-olay ortamından farklı (örn. bu audit farklı bir dogfood-run üzerinde yürütülüyor). Her iki durumda da sprint-403/404 kapsamında kanıt aramak doğru scope kararıydı (görev metninin talep ettiği budur) — ama sonucun "bulunamadı" olmasının nedeni kısmen budur.

---

## Mekanizma doğrulaması (kanıt yok, ama olasılık gerçek)

`.deckent/config.json` → `"spawn_backend": "docker"` doğrulandı — aktif backend Docker'dır. `src/orchestra/spawn-backend-docker.ts`'deki `runSpawn()` şu mount'u kuruyor:

```
'-v', `${dir}:${CONTAINER_WORKSPACE}`,   // proje kökü, READ-WRITE
```

Yani bir worker container'ının İÇİNDE `npm run build` (ki bu `npm run clean && tsc && node scripts/copy-assets.mjs`'e genişler — `package.json`) çalıştırması, host `dist/`'i doğrudan ezer — hipotez MEKANİK olarak tamamen geçerli, sadece bu iki sprint'in loglarında DOĞRUDAN kanıtı yok.

## Alternatif hipotezler (kanıt yokken, olası nedenler)

1. **Host-side manuel build.** CLAUDE.md: *"Sprint çalışırken `npm run build` ve `/login` YASAK... build sonrası `/mcp restart` Alperen yapar."* — bu, Alperen'in (insan operatör) sprint sınırları arasında host'ta manuel `npm run build` çalıştırdığı meşru, beklenen bir iş akışı olduğunu gösteriyor. 08:43'ün gerçek zamanı sprint-405/406 penceresine denk geliyorsa, bu tam olarak "sprint bitti, host'ta build çalıştırıldı" senaryosu olabilir — worker ihlali değil.
2. **Arkaplanda kalan `tsc --watch` (`npm run dev`).** Eğer bir geliştirme oturumu `npm run dev` (tsc --watch) arka planda unutulduysa, kaynak dosyalardaki HERHANGİ bir düzenleme (worker'ların normal `src/` düzenlemeleri dahil) otomatik olarak `dist/`'i yeniden derler — bu, worker'ın kendisi build ÇALIŞTIRMADAN bile dist mtime'ının sprint ortasında değişmesini açıklar.
3. **Subprocess backend (docker değil) altında çalışan bir görev.** `spawn-backend-subprocess.ts` worker'ı host process olarak proje kökünde çalıştırır — container izolasyonu YOK. Bir görevin direktifinde `- Backend: subprocess` varsa ve o worker (yanlışlıkla veya kasıtlı olarak) `npm run build` çalıştırdıysa, bu da aynı sonucu üretir ama farklı bir log-yakalama yolu izleyebilir (bu audit yalnız docker-mount senaryosunu ima eden mevcut sprint-403/404 task-JSON'larında `backend` alanı aramadı — bulunamadı, yani muhtemelen hepsi varsayılan docker'ı kullandı).
4. **CI/pre-commit/lint hook'unun dolaylı build tetiklemesi.** `package.json`'daki `release`/`prepublishOnly` script'leri `npm run build`'ı zincirleme çağırıyor; bunlardan biri (yanlışlıkla, örn. bir worker `npm run release` gibi bir şey denediyse) build'i dolaylı tetiklemiş olabilir. Bu audit'te böyle bir çağrı da bulunamadı, ama tam-string olmayan bir çağrı yolu (örn. `npm run prepublishOnly`) ayrı bir regex gerektirir ve bu tur taranmadı (kapsam dışı — yalnız 3 doğrudan komut arandı).

## Audit metodolojisinin sınırları

- Yalnızca `.log` (stream-JSONL) dosyaları tarandı — task `.json`/`.result`/`.plan` dosyaları ayrıca `dist/` referansı için grep'lendi (sıfır eşleşme), ama bu dosyalar Bash komut geçmişi tutmuyor zaten.
- Regex kapsamı 3 açık komut kalıbıyla sınırlıydı (`npm run build`, `tsc -b`, `npm run build:all`) + ikincil `"command":".*build` taraması. `npm run release`, `npm run prepublishOnly`, `npx tsc` (proje-config'siz, `-b` olmadan) gibi dolaylı yollar ayrı taranmadı — bu bir kapsam-sınırı olarak burada açıkça not ediliyor, sessizce atlanmadı.
