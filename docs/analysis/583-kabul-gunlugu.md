# 583 · 5-Gün-KABUL Günlüğü — deckent-native geliştirme (VS Code'suz)

> **Oyunun kuralı (583-d):** Ardışık **5 gerçek geliştirme-günü**, günlük iş deckent terminal
> (REPL/CLI) + deckent Desktop'tan yürür. VS Code yalnız **acil-fallback**tır ve her açılışı bu
> günlüğe olay-kaydı olarak girer. Her pürüz anında aşağıdaki tabloya işlenir (511-deseni);
> gün-sonunda Alperen-kararıyla born'lanır/çözülür. Pürüz bulmak BAŞARIDIR — kabulün amacı bu.
> Değerlendirme-referansı: `docs/reference/terminal-design-language.md` (DT-5) +
> `docs/analysis/surf4-d4-0-art-direction-2026-07-16.md` (Köprüüstü).
>
> **Sayaç:** kesintisiz-5 hedefi — VS Code'a düşülen gün sayacı sıfırlamaz ama olay-kaydı zorunlu;
> 5 temiz gün tamamlanınca 583 KABUL ✅.

**Pürüz-şiddeti:** 🔴 akışı durdurdu (fallback'e zorladı) · 🟡 yavaşlattı/yordu · 🔵 estetik/dil-aykırılığı (DT-5'e karşı)

---

## Gün-1 — 2026-07-18 · AÇIK

### Uçuş-öncesi (CC-el-kontrolü, gün-açılışında)
- `deckent doctor` (dist): **READY** (bilinen 2 uyarı: Brain-Budget + geçmiş-Debt — KABUL-engeli değil)
- WSLg: `DISPLAY=:0` + `wayland-0` ✓ → Electron pencere açabilir
- `npm run dev:desktop`: main+preload build ✓, renderer 5173 ✓, **Electron süreçleri ayakta, log temiz**
  — 17-Temmuz "arayüzü göremiyorum" bulgusu süreç-seviyesinde TEKRARLAMADI; görsel-doğrulama Alperen'de
- Paketli-binary (`dist-app/linux-unpacked`) mevcut; `electron v43.1.0` sağlam
- Bekleyen görsel-kanıtlar bugün doğal düşer: **Makine-Dairesi** (N3) · **DiffPanel** (N1) ·
  **Telsiz** (DT-1) · **canlı-worker-akışı** (N5) · Tabs-klavye (DT-2) · süzülme+Rota-hover (DT-3/4)

### Gün-1 egzersiz-listesi (gerçek işin içinde dokunulacaklar)
- [ ] Desktop: bağlan/spawn ✓ (yeni-daemon doğdu) → Console «Rota» canlı-akış → bir koşu başlat (Emir) → Telgraf-karar
- [ ] **Telsiz**: gerçek soru-cevap (canlı model-cevabı smoke'ta kanıtlı — görsel ilk-temas bugün)
- [x] **Makine-Dairesi**: ✅ GÖRSEL-KANIT DÜŞTÜ (Alperen canlı, 11:5x): terminaller Electron-ekranında görünüyor + çalışıyor — N3'ün bekleyen kanıtı + P5-fix canlı-doğrulandı (token-preflight geçti ki soket bağlandı)
- [ ] Terminal REPL: `@path` + slash-menü + inbox-kartı (a/f/r/s) + onay-kartı gerçek işte
- [ ] `runs <n> --diff` → **DiffPanel** aynı koşuda (iki yüzey aynı ayak-izi)
- [ ] Koşu-sonu `runs <n> --commit` VEYA chat'ten `git_add/commit` onay-kartıyla (N4 iki bacak)
- [ ] `status --follow` ⚡Live'da worker-akışı (N5 interactive-ON ilk gerçek-koşu)

### Pürüz-kaydı — Gün-1
| # | Şiddet | Yüzey | Ne oldu | Karar/born |
|---|---|---|---|---|
| P1 | 🔴 | Desktop (dev) | **Boş pencere** (17-Tem "göremiyorum"un kendisi). Kök-neden: sıkı header-CSP dev'de vite/plugin-react'in inline-preamble'ını blokladı → "can't detect preamble" → hiç render yok | ✅ FIX aynı-gün: `buildLocalRendererCsp` dev-only `script-src 'unsafe-inline'` (`ELECTRON_RENDERER_URL` sinyali; paketli-CSP bayt-aynı, pinli) |
| P2 | 🟡 | Daemon-CORS | "Could not reach the daemon": ACAO `sendJson`'da DEFAULT_PORT'a **hardcode** (origin-duyarsız; kanun-10 ihlali) + closure-route'larda (run-flow/terminal) **hiç yok** → dev-renderer (5173) tüm okumalarda bloklu | ✅ FIX aynı-gün: tek-yetkili `resolveCorsOrigin` + `applyLoopbackCors` (loopback-any-port + paketli `Origin: null` yansır; loopback-dışı asla; Vary: Origin); eski-yanlışın 3 pini yeni-doğruya çevrildi + 5 yeni pin |
| P3 | 🟡 | Desktop-CSP | react-aria'nın (DT-2 kilitli-lib) runtime inline-style'ları `style-src` tarafından bloklu — paketliyi de etkiliyordu (a11y-duyurucu sessiz) | ✅ FIX aynı-gün: `style-src 'self' 'unsafe-inline'` (script-kilidi aynen; pinli). **Alt-bulgu:** index.html META-ikizi "keep in sync" YORUMUNA rağmen drift'liydi — ws:// kaynakları da yoktu (N3-soketini paketlide bloklayacaktı, denenmeden yakalandı); meta eşitlendi + senkron artık PİNLİ |
| P5 | 🟡 | Daemon-CORS | Makine-Dairesi token-isteğinin CORS-**preflight'ı** (kimliksiz OPTIONS, spec-gereği) closure'daki token-gate'e düşüp 401 yiyordu — Engine Room dev-renderer'dan token'ı hiç isteyemiyordu (log'dan yakalandı) | ✅ FIX aynı-gün: `/api/terminal/*` OPTIONS → erken-204 (hiçbir şey vermez; gerçek-metod gate'te kalır) + pin; canlı-doğrulama = Alperen'in "terminaller görünüyor" teyidi |
| P6 | 🟡 | Desktop (ürün-derinlik, Alperen canlı) | "Çok yetersiz/detaysız — kişiler TÜM işlerini bu yüzeyde yürütemez; basit VE gelişmiş olsun; menü SOLDA olsun" | ✅ aynı-gün: (a) sol-ray uygulandı (hot-reload'la canlı); (b) **ihtiyaç-analizi çıkarıldı** `docs/analysis/desktop-ihtiyac-analizi-2026-07-18.md` — 14 iş-ailesi envanteri (5✅·5🟡·6🔴... 4✅+5🟡+5🔴), sol-ray IA, A-seti (KABUL-içi 4 ince-dilim) + B-seti (DESK-DEPTH-1..6 satır-adayları); fazlama Alperen-kararında |
| P7 | 🟡 | Desktop (yön, Alperen canlı) | "Sprint-durumu/dosya-akışı/『deckent şu an napıyor』yok; worker-detay-penceresi yok; History sadece-kod; .deckent'te milyon gösterilebilir özellik var — GELİŞTİRMEDEN ÖNCE enterprise-app'i DETAYLI planla" | ✅ aynı-gün: A1-implementasyonu duraklatıldı (sunucu-yüzü `/api/git/*` bitmiş+10-pin yeşil hâliyle indirildi) → **disk-envanteri** (retro-203·debt-222·memory-290·adr-47·agents-stats·hb·locks·shadow·lint…) → **`docs/analysis/desktop-enterprise-plan-2026-07-18.md`**: 12-ekran spec (Köprü-Operasyon-Merkezi + Worker-Penceresi dahil) · veri→ekran eşleme-tablosu · 4-yeni-587-servisi · F0-F5 fazlama · kabul-cümlesi; onay Alperen'de |
| P10 | 🟡 | «Köprü» liste | "En son başlattığım araya karışıyor; çok fazla eski iş, kötü görünüyor" — akış-listesi sırasız, geçmiş Köprü'yü boğuyor | ✅ hot-fix: CANLI-akışlar üstte+varsayılan-seçim, geçmiş katlanır «Geçmiş seferler» (8-cap + Koşular-hint). Kalıcı-fix (updatedAt alanı liste-payload'ına) → F2 |
| P11 | 🟡 | çıktılar | "Outputlar JSON — app'te anlamı yok" | ✅ hot-fix: `log-humanize.ts` insan-projeksiyonu — Sonuç-sekmesi alan-özetli (öz-değerlendirme/notlar/değişen-dosyalar), ham yalnız katlanır «raw»da; 5-pin |
| P12 | 🔴 | Worker canlı-sekme | "Live sekmesi boş — worker'lar canlı napıyor göremiyoruz" — sunucu-SSE'nin AKTIĞI canlı-ölçümle kanıtlandı (backfill ✓) → kopukluk renderer'da sessizdi + sunucu-projeksiyonu `[text] (empty)` basıyordu (zarf-içi metni kazamıyor) | ✅ hot-fix: (a) akış-durum-bandı her-zaman görünür (canlı·N-satır / koptu—deneniyor; sessiz-boş YASAK) + onError-yüzeyi; (b) zarf-kazıcı `digText` — iç-içe assistant-metni/tool_use(arg) GERÇEK cümleye döner (canlı-447 sınıfı pinli). Sunucu-tarafı summarize-derinleştirme → F2 |
| P14 | 🔴 | SÜREÇ+YÖN (Alperen) | Sefer-Sahnesi eskizi RED ("gemi değil DALGALANMA; Jarvis-hissi; görsel inanılmaz-unique olmalı") + süreç-reddi: "küçük-küçük yamalama prensibini kabul etmiyorum — BAŞTAN tasarlayalım" + işlev-parite şartı ("deckent işlevlerini desktoptan yapamıyoruz, böyle olmaz") | ✅ karşılık aynı-saat: yamalama-DURDU; **`desktop-reborn-soru-seti-2026-07-18.md`** — kapsamlı-analiz-tabanlı 20-soru enstrümanı (kimlik/IA/görselleştirme/işlev-parite/teknik/süreç; her soru seçenekli+CC-önerili); detaylı soru-cevap turları başladı |
| P13 | 🔴 | TASARIM-VİZYONU | Alperen: "kutucuk-içinde-yazı deckent'e yakışmıyor; CANLI, MUAZZAM his veren, orkestrasyonu HİSSETTİREN app istiyorum; istediğimin milyonda-1'indeyiz; bu çok basit bir MVP, kesinlikle yeterli değil" (Yasa-3 çağrısı) | ⏳ ESKALASYON: 588'e **F1.5 «CANLANDIRMA»** maddesi — Köprü'nün yaşayan-sahne tasarım-turu (design-then-approve): akış-birinci-sınıf sahne (kart-grid değil), sürekli-telemetri hissi, D4-0 deniz-ritmi motion'ının TAM uygulanışı; eskiz Alperen-onayına gelecek |
| P8 | 🟡 | serve token-dosyası | Desktop-spawn daemon token'ı ENV'le alıyor ama `runtime/api-token` DOSYASINI o token'la güncellemiyor → dosyadan-okuyan yerel araçlar bayat-token'la 403 yiyor (canlı-izlemede yakalandı; CC gerçek-token'ı süreç-env'inden alarak izledi) | ⏳ fix-adayı: serve EFEKTİF token'ı kaynağı-ne-olursa-olsun runtime-dosyasına yazsın; test-sonrası |
| P9 | 🟡 | «Köprü» faz-şeridi | 4 worker CANLI koşarken şerit boş — **kök-neden BENİM okuyucumda**: dosya DÜZ-şekilde dolu (`{sprintId:'sprint-447', phase:'EXECUTE'}`) ama servis iç-içe (`{sprint:{...}}`) okuyordu | ✅ FIX aynı-dakika: iki-nesil-okuyan hoşgörülü-okuma + GERÇEK-şekil pini (canlı-447'den birebir) + legacy-pin; dist-build ✓ — şerit **daemon-reconnect'te** yanar |
| P4 | 🟡 | Desktop (Alperen canlı-bulgu) | "Engine-Room/Chat'te sekme değişince kaldığım yerden devam etmiyor" — route-unmount yerel-state'i siliyordu | ✅ FIX aynı-gün: Telsiz-transkripti + Makine-Dairesi sekme-seçimi zustand-store'a taşındı (görünüme dönüş = kaldığın yer; PTY içeriği inv#4 replay'iyle zaten dönüyor). Derin keep-alive (xterm scroll-pozisyonu) → aday-born, gün-sonu kararı. **Canlı-doğrulandı** (Alperen: "başka yere dönünce hâlâ açık, ok") |

### F0+F1 teslimi (P7-planının KABUL-içi kapsamı) — TAMAM, el-testi bekliyor
Plan-onayı sonrası aynı-gün: **F0** (Changes+ray-grupları+Runs-detay+Telsiz-kalıcılık) + **F1**
(«Köprü» operasyon-merkezi + Worker-Penceresi + sprint-live-service). Test-planı:
**`docs/analysis/588-test-plani-2026-07-18.md`** (T1-T18) — Alperen koşacak, feedback'le kapanacak.

### Gün-sonu özeti
*(gün kapanırken doldurulur: dokunulan-yüzeyler · pürüz-sayısı · fallback-olayı var mı · Gün-2'ye devir)*

---

## Gün-2 — ·bekliyor·
## Gün-3 — ·bekliyor·
## Gün-4 — ·bekliyor·
## Gün-5 — ·bekliyor·
