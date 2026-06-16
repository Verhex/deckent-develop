# WrongStack Kıyaslaması — Deckent Kazanımları, Düzenlemeleri ve Zorunlulukları

**Tarih:** 2026-05-22
**Kaynak:** [WrongStack/WrongStack](https://github.com/WrongStack/WrongStack) — v0.6.0, ilk commit 2026-05-12 (~10 günlük), MIT, ECOSTACK TECHNOLOGY OÜ
**Yöntem:** WrongStack repo tam incelemesi (README, ARCHITECTURE.md, CHANGELOG.md, director-architecture.md, package.json, dosya ağacı) → Deckent ile kıyas → her bulgu Deckent kodunda iki turlu `grep`/dosya doğrulamasından geçirildi. İkinci tur 3 ilk-tur hatasını düzeltti (WS-Z1 CI zaten coverage koşuyor, WS-D1 bazı komutlar zaten lazy, WS-D2 token bütçesi zaten güçlü) — düzeltilmiş hâller aşağıda `(kanıt — kod doğrulandı)` etiketli.
**Amaç:** WrongStack'ten Deckent'e taşınabilecek somut işleri sınıflandırıp önceliklendirmek. OSS GA (1 Haz 2026 beta) penceresine hizalı.

---

## 0. Bağlam — İki Ürün Aynı Kategoride Değil

WrongStack **insan-döngüde interaktif kodlama ajanı** (Claude Code / Aider sınıfı). Deckent **otonom sprint orkestrasyon sistemi** (kendi kendini yöneten AI dev ekibi). Örtüşen tek alan WrongStack'in **Director fleet** modu ile Deckent'in **Brain** orkestrasyonu.

Kıyas özeti:

| Boyut | Kazanan | Not |
|-------|---------|-----|
| Orkestrasyon derinliği & dayanıklılığı | **Deckent** | Gerçek process izolasyonu, dosya-IPC, GO/NO_GO kapıları, ADR yönetişimi |
| Hafıza & sprint-arası öğrenme | **Deckent** | SQLite Memory V2 + FTS5; WrongStack'te markdown notlar |
| Test/coverage disiplini | **WrongStack** | Zorlanan ≥%85 coverage kapısı; Deckent ölçmüyor |
| Provider esnekliği | **WrongStack** | ~110 provider, models.dev kataloğu; Deckent 3 provider hardcoded |
| Güvenlik enforcement'ı | **WrongStack** | Runtime izin blokajı; Deckent scope advisory/soft |
| Erişim kanalları & sistem kapsamı | **Deckent** | CLI/MCP/Dashboard/VS Code/Discord/Telegram/WhatsApp/API |

**Deckent'in asıl açığı mimaride değil — test/coverage disiplininde ve enforcement sertliğinde.** Bu doküman o açığı ve diğer fırsatları işe çeviriyor.

---

## 1. ZORUNLULUKLAR — OSS GA Öncesi Kapatılmalı

OSS yayınında kredibilite kıran, WrongStack'in 10 günlük bir projeyle bile karşıladığı temel eşikler.

### WS-Z1 — Coverage threshold kapısı yok

**WrongStack:** CI'da `pnpm typecheck && pnpm build && pnpm test` zorunlu; vitest coverage **zorlanıyor** — ≥%85 satır, ≥%85 fonksiyon, ≥%70 dal, ≥%82 statement. 3091 test, 260 dosya.

**Deckent (kanıt — kod doğrulandı):** `vitest.config.ts:8` — `coverage: {}` bloğu var ama **`thresholds` alanı yok** (`grep threshold` → 0 sonuç). CI'da coverage **zaten çalışıyor**: `.github/workflows/ci.yml:188` `coverage:` job'u `npm run test:coverage` koşuyor + raporu artifact olarak yüklüyor — **ama yalnızca rapor; build'i kırmıyor**. `CLAUDE.md` Sprint Metrics `Coverage: 0.0%`. Sonuç: 867 test dosyası / 16.697 descriptor ölçülüyor ama hiçbir eşik zorlamıyor. (İlk-tur hatası düzeltildi: gap "CI'da coverage adımı yok" değil — "threshold yok".)

**Önerilen iş:**
1. `npm run test:coverage` çıktısından **gerçek mevcut coverage** okunur (taban tespiti).
2. `vitest.config.ts` `coverage` bloğuna `thresholds` eklenir — **mevcut değerin biraz altına** kalibre edilir (ör. ölçüm %62 ise floor %58); böylece mevcut `coverage:` job'u eşik altına düşünce non-zero exit verir, build kırılır.
3. Ayrı CI adımı **gerekmez** — `coverage:` job'u zaten `needs` zincirinde; threshold eklenince otomatik gate olur.
4. Floor her sprint **kademeli yukarı çekilir** (ratchet) — hedef ≥%80.

**Öncelik:** P0 · **Efor:** normal · **Risk:** Düşük (kalibreli floor ile CI kırılmaz)

---

### WS-Z2 — CHANGELOG.md 30 sprint geride

**WrongStack:** Her sürüm için temiz `CHANGELOG.md` — 0.1.0→0.6.0, 13 sürüm, tarihli, Added/Changed/Fixed bölümlü.

**Deckent (kanıt):** `CHANGELOG.md` var ama son giriş **"Unreleased — Sprint 156 Pipeline Hardening (2026-05-12)"**. Proje `sprint-186`'da — **30 sprint güncellenmemiş**. Kök `CHANGELOG.md` → `docs/CHANGELOG.md`'ye yönlendiriyor. `v1.0.0-beta.1` etiketli bir release için güncel changelog **zorunlu**.

**Önerilen iş:**
1. Sprint 157→186 arası changelog backfill (retro/memory'den derlenebilir).
2. `1.0.0-beta.1` sürüm başlığı + tarih.
3. Sprint-reporter'a CHANGELOG otomatik güncelleme adımı (her sprint sonu Added/Changed/Fixed) — kronik staleness'i kökten çözer.

**Öncelik:** P0 · **Efor:** normal

---

### WS-Z3 — SECURITY.md stale + tehdit modeli yüzeysiz

**WrongStack:** `SECURITY.md` dokümante tehdit modeli içeriyor; 0.1.6 sürümünde 7 CRITICAL + 16 HIGH + 20 MEDIUM bulgusu kapatıldığı changelog'da izlenebiliyor.

**Deckent (kanıt):** `SECURITY.md` var ama "Supported Versions" tablosu **`0.1.x — Yes`** diyor — proje `1.0.0-beta.1`. Sürüm uyumsuz. İçerik sadece "report responsibly" + e-posta; **tehdit modeli yok**. Oysa Deckent'in güçlü güvenlik mimarisi var ama hiçbiri SECURITY.md'de görünmüyor: worker scope enforcement (ADR-037), spawn-safety whitelist (`spawn-safety.ts`), `.deck` secret sistemi (ADR-014), multi-project izolasyon (ADR-034).

**Önerilen iş:**
1. Supported Versions tablosu `1.0.0-beta.x` ile güncellenir.
2. **Tehdit Modeli** bölümü eklenir — mevcut ADR-014/034/037 + spawn-safety özetlenir; saldırı yüzeyi (worker kod yürütme, provider API key, multi-project sınırı) açıkça yazılır.
3. ADR-037 V1.0'ın **advisory/soft** olduğu (scope ihlali bloke etmiyor, warn/emit ediyor) dürüstçe belgelenir — kullanıcı bu sınırı bilmeli.

**Öncelik:** P1 · **Efor:** normal

---

## 2. DÜZENLEMELER — Mevcut Sistemde İyileştirme

Deckent'te zaten var olan mekanizmaların WrongStack desenleriyle güçlendirilmesi.

### WS-D1 — Başlangıç maliyeti: ağır modül lazy-load

**WrongStack:** TUI (`Ink + React`) `--tui` bayrağı arkasında **lazy-loaded** — "plain-REPL kullanıcısı React/Ink import maliyeti ödemez". Açık bir performans ilkesi.

**Deckent (kanıt — kod doğrulandı):** Tutarsız. Bazı komutlar **zaten dinamik import** kullanıyor (`finalize`, `config`, `recover`, `resume`, `review`, `test-run`, `init-steps` — `grep "await import"`). Ama `src/cli/commands/nervous.ts:19` `nervous/observer.js`'i **top-level eager import** ediyor — `deckent` her çağrıldığında komut kaydı sırasında nervous alt sistemi yükleniyor. `dashboard.ts`/`serve.ts` komutları dinamik import listesinde **yok** → dashboard server eager. Connector'lar **temiz**: hiçbir `src/` dosyası `telegraf`'ı top-level import etmiyor (`grep "from 'telegraf'"` → 0 sonuç). (İlk-tur hatası düzeltildi: connector'lar zaten lazy; gap yalnız `nervous` + `dashboard`/`serve`.)

**Önerilen iş:** `nervous.ts` ve `dashboard.ts`/`serve.ts` komut dosyalarındaki ağır alt-sistem importları **dinamik `import()`**'a çevrilir (action handler içine taşınır) — zaten lazy-load eden 7 komutla tutarlı hâle getirilir. **Saf performans/tutarlılık iyileştirmesi — kapsam azaltma değil.**

**Öncelik:** P2 · **Efor:** normal

---

### WS-D2 — Birleşik bütçe zarfı (SubagentBudget deseni)

**WrongStack:** `SubagentBudget` sınıfı her subagent için **tek zarf**ta sert limit uygular — iterasyon / araç çağrısı / token / maliyet / timeout. Aşımda yapısal hata `{ error, kind, limit, observed }` LLM'e döner. Fleet geneli `FleetSpawnBudgetError`.

**Deckent (kanıt — kod doğrulandı):** Token/bağlam tarafı **zaten güçlü** — `token-counter.ts`: `TokenBudget`, `ContextBudgetEstimate`, `BudgetWarning` tipleri + `TokenCounter` sınıfı (`isWithinBudget`, `warnIfExceeding`, `estimateTaskContextBudget`). `routing-types.ts:139` `SkillBudget` (per-skill token budget). Eksik olan: timeout + cost + iterasyon tavanı bu token zarfının **dışında dağınık** (`timeout-estimator.ts`, `spawn-backend*.ts`, cost-config ayrı). Tek per-task zarf ve WrongStack'in `{ error, kind, limit, observed }` benzeri **yapısal aşım hatası** yok. (İlk-tur hatası düzeltildi: "task budget hiç yok" değil — token bütçesi var, timeout/cost/iterasyon dışarıda.)

**Önerilen iş:** Mevcut `TokenCounter`/`SkillBudget`'i bozmadan üstüne **`TaskBudget` zarfı** — token (mevcut) + timeout + cost + iterasyon tavanını tek tipte birleştirir, aşımda yapısal hata üretir. **Konsolidasyon refactor'ü, sıfırdan inşa değil.** Evaluator + mid-sprint-adapter aşımı tekil sözleşmeden okur.

**Öncelik:** P2 · **Efor:** yüksek

---

### WS-D3 — Provider/model kataloğu dinamikleştirme

**WrongStack:** Provider kataloğu **models.dev**'den — "no hardcoded provider lists, no hardcoded pricing, no hardcoded model names". ~110 provider, 24s TTL cache. Yeni model = kod değişikliği gerektirmez.

**Deckent (kanıt):** `model-registry.ts` — 13 model, 3 provider **elle tanımlı**. `cost-config-audit` zaten model-listesi senkron açığını işaretlemiş. Yeni model her seferinde kod değişikliği ister.

**Önerilen iş:** Registry'yi koruyarak **opsiyonel katalog katmanı** — fiyatlandırma/model listesini bir veri kaynağından (models.dev veya kendi JSON'umuz) yeniler. Registry single-source-of-truth kalır, katalog onu besler. Büyük iş — **post-GA roadmap**.

**Öncelik:** P3 · **Efor:** yüksek · **Bağlı:** `cost-config-audit` model-list senkron borcu

---

### WS-D4 — ADR-037 scope enforcement hard-flip

**WrongStack:** İzin politikası runtime'da **bloke ediyor** — allowlist dışı `exec` çalışmaz, fetch localhost'u engeller.

**Deckent:** ADR-037 V1.0 Layer-2 **kasıtlı eksik** — scope ihlali warn/emit ediyor, bloke etmiyor; hard-flip V2 post-GA'ya planlı. Yeni iş değil — **roadmap'te mevcut**, sadece bu kıyaslama ile teyit ediliyor.

**Öncelik:** P3 (planlı) · **Efor:** — · **Durum:** ADR-037 V2 post-GA

---

## 3. KAZANIMLAR — Yeni Fikir / Stratejik Fırsat

WrongStack'te olup Deckent'te bulunmayan, kapsamı **genişleten** (azaltmayan) yetenekler.

### WS-K1 — MCP istemci yeteneği (worker'lar dış MCP araçları kullansın)

**WrongStack:** Tam MCP **istemcisi** — dış MCP server'lara bağlanır, reconnect mantığı, vision adapter'lar (Z.AI/MiniMax preset). `wstack mcp add zai-vision`.

**Deckent (kanıt):** Deckent bir MCP **server** (31 araç dışarı sunar) ama **istemci değil** — `src/core`, `src/agents`, `src/orchestra`'da `mcpServers`/`McpClient`/`connectMcp` yok. Worker'lar dış MCP araçlarını kullanamıyor.

**Fırsat:** Worker'lara dış MCP server tüketme yeteneği — bir task özel bir dış araca ihtiyaç duyduğunda (DB introspection, tarayıcı otomasyonu, vision) Brain bunu task scope'una ekler. Bu, worker yeteneğini **gerçek anlamda genişletir** ve Deckent'in agentic-OS "her sisteme bağlanır" vizyonuyla doğrudan örtüşür.

**Öncelik:** P2 · **Efor:** yüksek · **Bağlı:** `project_deckent_agentic_os_vision`

---

### WS-K2 — Eternal/sürekli mod ↔ TOPP doğrulaması

**WrongStack:** `/autonomy eternal` + kalıcı `/goal` — sense→decide→execute→reflect döngüsü kullanıcı durdurana kadar. `EternalAutonomyEngine`, iterasyon journal'ı (500 ring buffer).

**Deckent:** Sprint modeli **kesikli** (planla→yürüt→değerlendir→retro→dur). TOPP continuous-dispatch (ADR-064) ve `project_topp_continuous_dispatch` zaten bu yönde.

**Fırsat:** WrongStack'in eternal döngüsü Deckent'in TOPP yönünü **dışarıdan doğruluyor**. Ek adım: sprint-üstü "sürekli/always-on" mod — DIRECTIVES tükendiğinde Brain'in pending todo → dirty git → LLM brainstorm ile yeni iş üretmesi (WrongStack'in hibrit decide pipeline'ı tam bunu yapıyor). Agentic-OS "role-based always-on" vizyonuyla örtüşür.

**Öncelik:** P2 · **Efor:** yüksek · **Bağlı:** ADR-064 TOPP, `project_deckent_agentic_os_vision`

---

### WS-K3 — Canlı izleme TUI'si (ADR-062 referansı)

**WrongStack:** 3 yüzey — Plain REPL, TUI (Ink/React, fuzzy dosya seçici, canlı durum çubuğu, Esc-to-steer), WebUI (ayrı binary).

**Deckent:** Web dashboard (React/Vite, 7 sayfa) + CLI var; zengin **TUI yok**. `deckent status --watch` düz metin.

**Fırsat:** `deckent status --watch`'ı tam bir Ink TUI'ye çevirmek — canlı worker durumu, faz, heartbeat, alert. Gömülü web terminal (ADR-062, `project_embedded_web_terminal`) zaten planlı; WrongStack TUI o tasarım için **somut referans**.

**Öncelik:** P3 · **Efor:** yüksek · **Bağlı:** ADR-062

---

### WS-K4 — İsimli bağlam-penceresi politikaları

**WrongStack:** 4 named context politikası — `balanced` / `frugal` / `deep` / `archival` + `repair` (hasarlı tool-call komşuluğu onarımı).

**Deckent (kanıt — kod doğrulandı):** Brain budget auto-decay (900 satır bütçe) var; isimli **context-window compaction** stratejisi yok. Dikkat: `mode-presets.ts:47` `balanced` (+ `performance`/`economic`/`api`) **var ama bu `ModelStrategy` preset'i** — model seçim stratejisi, bağlam-penceresi politikası değil. WrongStack'in `balanced/frugal/deep/archival`'ı farklı eksen (compaction). İsim çakışmasına dikkat — yeni politikalar farklı adlandırılmalı.

**Fırsat:** Brain memory + worker context için isimli compaction stratejileri — örn. `frugal` (agresif decay), `deep` (son turları koru), `archival` (karar-koruyan). Kullanıcı/proje seçilebilir.

**Öncelik:** P3 · **Efor:** normal

---

### WS-K5 — İnce-grenli fleet gözlem araçları

**WrongStack:** `fleet_health` (bütçe baskısı + canlılık) ve `fleet_usage` (subagent başına token/maliyet) **LLM-çağrılabilir araçlar**. `DirectorStateCheckpoint` artımlı disk snapshot.

**Deckent:** Dashboard + `deckent status` var; per-worker bütçe/health bir MCP aracı olarak sunulmuyor. Sprint-checkpoint (ADR-043) tam-snapshot — artımlı değil.

**Fırsat:** (a) Per-worker bütçe/health'i MCP aracı olarak sun (WS-D2 `TaskBudget` ile birleşir). (b) Sprint checkpoint'i artımlı (incremental) snapshot'a çevir — büyük sprint'lerde crash recovery hızlanır.

**Öncelik:** P3 · **Efor:** normal · **Bağlı:** WS-D2, ADR-043

---

## 3.5 — Stratejik Bağ: WrongStack, Deckent'in "Conversational Shell" Kararının Canlı Referansı

WrongStack'in çalışma modeli — terminalde **doğal dille konuş**, ajan tool-use loop'unu döndürsün — Deckent'in **zaten roadmap'te kayıtlı ama henüz karara bağlanmamış** bir yönü:

- `docs/vision/roadmap.md:192` — **"Conversational Shell — Direction Under Consideration"** (kaydedildi 2026-05-20).
- `docs/ROADMAP-GOD-LEVEL.md:189` — **"⚡ 2026-05-20 (Discussion: Conversational Shell — Karar Bekliyor)"** — tam mimari karşılaştırma + kod envanteri.
- `docs/ROADMAP-GOD-LEVEL.md:123` — Trinity tablosunda **"Chat Mode"** (AI-Asistan personası) ~%25 hazır işaretli; "tek eksik parça `src/cli/commands/chat.ts`".

Roadmap üç yol tanımlıyor: **A** (embedded terminal üstüne, ~600 LoC), **B** (kullanıcının `claude`/`codex`/`gemini` CLI'ını subprocess host'la, ~150 LoC), **C** (native SDK + kendi REPL, ~1500 LoC + ADR-010 amendment). Önerilen sıra **B→A→C**.

**WrongStack tam olarak Yol C'nin — hatta ötesinin — canlı kanıtı:**

| Roadmap'in Yol C için varsaydığı | WrongStack'in 10 günde yaptığı |
|----------------------------------|--------------------------------|
| "Provider abstraction CLI shell-out'tan native SDK'ye göç" | SDK'ye bile değil — **kendi 4 wire-family transport'u** (anthropic/openai/openai-compatible/google), SSE dahil, sıfır runtime bağımlılığı |
| "~1500 LoC + migration + ADR-010 amendment" | Çekirdek loop ~1030 LoC; REPL + TUI + WebUI + autonomy hepsi üstte |
| "Q3 2026'da provider abstraction olgunlaşınca" | models.dev kataloğu ile ~110 provider, hardcode-sıfır |

**Çıkarım:** Yol C "büyük korkutucu iş" olarak fiyatlanmış (~1500 LoC, Q3 2026). WrongStack bu tahminin **abartılı** olduğunu gösteriyor — provider abstraction + tool-use loop + REPL 10 günde, üstelik TUI/WebUI/autonomy ile birlikte yazılabiliyor. WrongStack'in `complete() = aggregateStream(stream())` deseni ve wire-family soyutlaması Deckent için **doğrudan okunabilir referans implementasyon**.

**Önerilen iş:** Conversational Shell kararı (şu an "karar bekliyor") WrongStack incelemesi ışığında yeniden ele alınır. B→A→C sırası hâlâ geçerli ama **Yol C'nin maliyet/zaman tahmini aşağı revize edilmeli** — C, "uzun vade Q3 2026" yerine B'den hemen sonra gündeme alınabilir. Karar `docs/ROADMAP-GOD-LEVEL.md` ⚡ 2026-05-20 bölümünde güncellenir.

**Öncelik:** P1 karar maddesi (June 1 beta `deckent chat` kanıtı için) · **Efor:** karar + ardından Yol B ~150 LoC

---

## 4. BİLİNÇLİ AYRIŞMALAR — Kopyalanmayacaklar

WrongStack'in iyi yaptığı ama Deckent'in **kasıtlı olarak farklı** olduğu noktalar. Belgeleniyor ki gelecekte "bunu kaçırdık" yanılgısına düşülmesin.

| WrongStack deseni | Neden Deckent'e taşınMIYOR |
|-------------------|----------------------------|
| **0 runtime bağımlılığı / ~1K LoC minimal kernel** | Deckent vizyonu god-level full-scope ürün (ADR-033, `feedback_no_minimum_no_mvp_deckent`). 9 bağımlılık (`better-sqlite3`, MCP SDK, `zod` vb.) gerçek yetenek karşılığı. Yalınlık WrongStack'in ürün kategorisi için doğru — Deckent için değil. |
| **`--no-features` offline strip modu** | "Özellik soyma" çerçevesi Deckent felsefesine aykırı. Offline çalışma additive bir özellik olarak değerlendirilebilir ama "katmanları kaldır" yaklaşımı benimsenmez. |
| **tsup + Biome tek-araç build** | Deckent'in `tsc` + özel script pipeline'ı (`adr-validator`, `check-error-handling`, `lint-links`) ADR'lerle gerekçeli ve yönetişime bağlı. Değiştirmeye değmez. |
| **In-memory ephemeral fleet (Director)** | Deckent'in dosya-tabanlı, process-izolasyonlu, çökmeye-dayanıklı orkestrasyonu kasıtlı olarak daha ağır ve daha dayanıklı — bu Deckent'in temel farklılaştırıcısı. |

---

## 5. Konsolide İş Listesi

| ID | İş | Kategori | Öncelik | Efor | OSS GA |
|----|-----|----------|---------|------|--------|
| WS-Z1 | Coverage threshold kapısı + CI adımı | Zorunluluk | **P0** | normal | Blocker |
| WS-Z2 | CHANGELOG 157→186 backfill + otomasyon | Zorunluluk | **P0** | normal | Blocker |
| WS-Z3 | SECURITY.md güncelleme + tehdit modeli | Zorunluluk | **P1** | normal | Önemli |
| WS-X1 | Conversational Shell kararı — WrongStack ışığında yeniden değerlendir (§3.5) | Karar/Strateji | **P1** | karar + Yol B ~150 LoC | `deckent chat` beta kanıtı |
| WS-D1 | CLI başlangıç lazy-load | Düzenleme | P2 | normal | — |
| WS-D2 | `TaskBudget` birleşik bütçe zarfı | Düzenleme | P2 | yüksek | — |
| WS-D3 | Dinamik provider/model kataloğu | Düzenleme | P3 | yüksek | post-GA |
| WS-D4 | ADR-037 scope hard-flip | Düzenleme | P3 | — | planlı (V2) |
| WS-K1 | MCP istemci yeteneği (worker → dış MCP) | Kazanım | P2 | yüksek | post-GA |
| WS-K2 | Sürekli/always-on mod (TOPP üstü) | Kazanım | P2 | yüksek | post-GA |
| WS-K3 | Canlı izleme TUI'si | Kazanım | P3 | yüksek | post-GA |
| WS-K4 | İsimli bağlam politikaları | Kazanım | P3 | normal | post-GA |
| WS-K5 | Fleet gözlem araçları + artımlı checkpoint | Kazanım | P3 | normal | post-GA |

**OSS GA öncesi minimum:** WS-Z1, WS-Z2, WS-Z3 (3 zorunluluk) + WS-X1 (Conversational Shell kararı, `deckent chat` beta kanıtı için). Geri kalan post-GA roadmap.

---

## 6. Sonuç

WrongStack'in Deckent'e öğrettiği tek gerçek ders **test/coverage disiplini ve güvenlik enforcement sertliği** — mimari değil. 10 günlük bir proje zorlanan %85 coverage kapısıyla 2 aylık Deckent'i bu alanda utandırıyor. WS-Z1/Z2/Z3 bu açığı OSS GA penceresinde kapatır.

Orkestrasyon derinliği, hafıza ve yönetişimde Deckent açık ara önde — bu nedenle kazanımlar (WS-K*) **yeni yetenek ekleme** niteliğinde, "eksik kapatma" değil. MCP istemci yeteneği (WS-K1) ve sürekli mod (WS-K2) Deckent'in agentic-OS vizyonuyla doğrudan örtüştüğü için stratejik olarak en değerli ikisi.

**En önemli stratejik çıktı — WS-X1 (§3.5):** WrongStack'in doğal-dil-ile-çalışma modeli, Deckent'in roadmap'te zaten kayıtlı ama "karar bekliyor" durumundaki **Conversational Shell** yönünün canlı referansıdır. WrongStack, Yol C'nin (native provider + REPL) korkulduğu kadar büyük bir iş olmadığını 10 günde kanıtlıyor. Bu, `deckent chat` kararını June 1 beta öncesi yeniden ele almak için somut bir gerekçe.

---

_İlgili: [README.md](README.md) · OSS GA roadmap: `project_june1_beta_roadmap` · TOPP: `project_topp_continuous_dispatch`_
