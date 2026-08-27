# CLI-SURFACE-REFORM — Dilim-1 Karar-Dokümanı (önce/sonra `-h` + tam envanter)

> **Silinme-tetiği (delete-on-consume):** Alperen §6 karar-noktalarını karara bağlayıp
> dilim-1 DIRECTIVES'ine onay verdiğinde bu doküman SİLİNİR — kalıcı kayıt MASTER 545
> `CLI-SURFACE-REFORM-001` satır-kanıtı olur.
> Kaynak: owner sohbet-kararları 2026-08-27 ("cli ingilizce olmalı" · "ilk iş profesyonel
> ayrım" · autonomous+enterprise grupları · kpi/evolve yarım-sınıfı). Envanter yöntemi:
> 78 komut × gerçek-binary `-h` probe (78/78 exit-0) + 13 şüpheli × fonksiyonel probe.

## 1. Yönetici özeti — sorunun ölçüsü

- `deckent -h` bugün **80 komutu tek düz listede** basıyor (164 satır, 0 grup).
- Açıklamalar **TR/EN karışık** (örn. "Initialize a new Deckent project" ↔ "Güncel run
  dashboard'ını göster").
- **Çift-yüzeyler:** hedeften-plana 4 kapı (do/plan-nl/set-directives/plan), gözlem 3 kapı
  (attach/watch/output), dashboard↔status --watch, analyze↔analyze-project alias.
- **Yarım-işlev sınıfı (dilim-2 onarım-backlog'u, §5):** kpi tek-sprint (tarihçe yok),
  limits YALNIZ Claude, usage YALNIZ Claude-modelleri, truth çıktısında ham `undefined`
  hücre, evolve (owner-işaretli).
- Gerçek gizli komut tek: `gateway-runtime` (bilinçli, hidden:true). Sabahki "limits/bot/mcp
  gizli" tespitim yanlıştı — help'i `head -80` ile kesmişim; onlar sayfa-altındaydı.
  Sorun gizlilik değil, **80-satırlık düz enkaz**.

## 2. Envanter + hedef-grup + disposition (80 komut)

Durum: ✅ çalışıyor · 🟡 yarım-işlev · 📦 alt-komut konteyneri (-h sağlıklı) · ⚪ derin-doğrulama dilim-1'de

| Hedef grup | Komut(lar) | Durum | Disposition |
|---|---|---|---|
| **ÇALIŞTIRMA** | `do` | ✅ | kalır; `plan-nl`'i YUTAR |
| | `run` · `plan` · `start` · `runs` | ✅ | kalır |
| | `plan-nl` | ✅ | → `do` (alias+deprecation) |
| | `set-directives` | ✅ | → ileri |
| **İZLEME** | `status` | ✅ | kalır; `dashboard`'ı yutar (`--watch`) |
| | `watch` | ✅ | kalır; `attach`+`output`'u yutar |
| | `inspect` · `history` · `explain` | ✅ | kalır |
| | `dashboard` · `attach` · `output` | ✅ | → alias+deprecation |
| | `resources` · `cu-status` | ✅ | kalır (İZLEME altı) |
| **YAŞAM-DÖNGÜSÜ** | `review` · `retro` · `cleanup` · `kill` · `checkpoint` · `recover` | ✅/⚪ | kalır |
| | `finalize` | ✅ | → ileri (normalde lifecycle otomatiği) |
| **ONAY & GÜVEN** | `approvals` · `confirmations` · `xverify` · `audit` · `audit-verify` | ✅/📦 | kalır |
| | `truth` | 🟡 | kalır; `undefined`-hücre onarımı dilim-2 |
| **OTONOM** | `autonomous` · `autonomous-mission` · `nervous` · `heartbeat` | 📦/✅ | kalır (owner: ayrı grup) |
| **ENTERPRISE** | `rbac` · `gateway` · `execution-authority` · `provider-authority` | 📦/⚪ | kalır (owner: ayrı grup) |
| **KATALOG & BİLGİ** | `agent` · `skill` · `docs` · `models` · `memory` · `recall` · `remember` | ✅/📦 | kalır |
| | `kpi` | 🟡 | KARAR-3: `evolve` ile tek analitik-yüzeye birleşim |
| | `evolve` | 🟡📦 | KARAR-3 (tanımı "cross-sprint trends" — kpi-tarihçesiyle çakışıyor) |
| | `image` · `trace` | ⚪/📦 | → ileri (training/tooling) |
| **SAĞLAYICILAR** | `connect` · `limits` · `usage` · `cost` · `local-llm` | 🟡/📦 | kalır; limits+usage provider-geneli dilim-2 |
| | `openrouter-probe` · `provider-observations` | ⚪ | → ileri |
| **ORTAM** | `init` · `onboard` · `config` · `doctor` · `sync` · `upgrade` · `plugin` · `analyze` · `features` | ✅ | kalır; `analyze-project` alias düşer |
| | `archive-debt` | ✅ | → `status --debt` (alias+deprecation) |
| **SERVİSLER** | `serve` · `bot` · `mcp` | ✅/📦 | kalır |
| **CHAT** | `chat` | ✅ | dilim-3: prompt-first native (`deckent [prompt]`) |
| **İLERİ (advanced grubu — görünür ama ayrı başlık)** | `spawn` · `test` · `process` · `mode` · `flow` · `task` · `archive` · `config-nervous`(alt) · `trace` · `image` · `set-directives` · `finalize` · `openrouter-probe` · `provider-observations` | ✅/📦/⚪ | kalır (İLERİ) |

⚪ olanlar dilim-1 uygulamasının ilk adımında (yüzey-envanter denetimi) fonksiyonel probe'dan geçirilir; yarım çıkan dilim-2 backlog'una satır olarak eklenir.

## 3. ÖNCE — bugünkü `-h` (gerçek çıktı, temsilî kesit)

```
Usage: deckent [options] [command]
Commands:                       ← 80 komut, tek düz liste, 164 satır
  init [options]                     Initialize a new Deckent project        ← EN
  status [options]                   Güncel run dashboard'ını göster         ← TR
  dashboard [options]                ... (see also: deckent status --watch)  ← çift
  plan-nl [options] <goal>           ... DIRECTIVES.md scaffold              ← do'nun kopyası
  attach / watch / output            ← üç gözlem kapısı
  ... (+72 komut daha, gruspuz, karışık dilde)
```

## 4. SONRA — hedef `-h` (EN-default; TR = config lang opt-in)

```
Usage: deckent [options] [prompt]

  deckent "<prompt>"        start a native chat session          (dilim-3)
  deckent do "<goal>"       plan a run from a goal (dry-run first)

Run          do · run · plan · start · runs
Observe      status · watch · inspect · history · explain · resources
Lifecycle    review · retro · cleanup · kill · checkpoint · recover
Trust        approvals · confirmations · xverify · audit · truth
Autonomous   autonomous · autonomous-mission · nervous · heartbeat
Enterprise   rbac · gateway · execution-authority · provider-authority
Catalog      agent · skill · docs · models · memory
Providers    connect · limits · usage · cost · local-llm
Environment  init · onboard · config · doctor · sync · upgrade · plugin · analyze
Services     serve · bot · mcp
Advanced     run `deckent help advanced` for the full expert surface

Deprecated aliases (one release window, typed warning):
  dashboard→status --watch · attach|output→watch · plan-nl→do · archive-debt→status --debt
```

~80 → **görünür ~45 komut, 11 grup**; hiçbir işlev silinmez — İLERİ grubu + alias'lar taşır.

## 5. Dilim-2 onarım-backlog'u (bu dokümanla kanıtlandı; ayrı admission)

1. `kpi` — yalnız son sprint; tarihçe/data-log yok, `--sprint N`/trend yok (owner-bulgusu;
   probe: "KPI Karnesi — sprint-698" tek tablo). KARAR-3'e bağlı: `evolve` ile birleşim.
2. `limits` — yalnız Claude aboneliği; hedef: bağlı TÜM provider'lar + `--claude/--codex/--cursor`.
3. `usage` — tablo yalnız Claude-modelleri (probe: fable/opus satırları; codex/cursor yok) —
   limits ile aynı provider-genelleme sınıfı.
4. `truth` — proof sütununda ham `undefined` render (probe-kanıtı) — projection bug'ı.
5. Çıktı-dili: runtime çıktıları da EN-default'a çekilir (TR config-lang ile).

## 6. Owner karar-noktaları (tüketim-koşulu)

1. **Gruplama (§2/§4):** onay? İtiraz ettiğin yerleşim var mı (özellikle: `finalize`/
   `set-directives`/`process` İLERİ'de; `runs` ÇALIŞTIRMA'da + `history` İZLEME'de ayrı)?
2. **İLERİ grubunun görünürlüğü:** ana `-h`'de tek satır özet + `deckent help advanced`
   (önerim) mi, yoksa ana listede ayrı başlık altında tam liste mi?
3. **kpi+evolve birleşimi:** tek analitik-yüzey (`deckent kpi` altında trend/tarihçe;
   evolve alias) — onay?
4. **Alias-penceresi:** deprecated alias'lar kaç sürüm yaşasın? (Önerim: ilk public
   release'e kadar + bir minör.)
5. **Runtime çıktı-dili:** help ile birlikte çıktılar da EN-default (TR = `config lang`) — onay?

## 7. Mekanizma (dilim-1'in temeli — owner-onaylı yön)

- **Surface-contract registry:** komut ağacı + grup + açıklama-i18n-key + flag'ler tek
  makine-okunur kaynakta; `-h`, docs komut-referansı, shell-completion ve MCP-parity
  (`cli-mcp-parity-baseline.json` gate'i) buradan ÜRETİLİR → "unutulan bağlantılı yüzey"
  sınıfı build-hatasına döner.
- **Consumer-closure gate** (owner: "doğru ve olması gereken"): yüzey değişince etkilenen
  tüketici-testleri registry/import-grafiğinden türetilir, elle seçilmez.
- Alias/deprecation: typed uyarı, sessiz kırılma yok (NEVER-MVP).

## 8. Uygulama şekli
Dogfood sprint dilimleri (Ders-31 disipliniyle): (a) registry + üretim zinciri,
(b) gruplama + alias'lar + EN-help, (c) envanter-denetimi otomasyonu + consumer-closure
gate. Dilim-2 (onarımlar) ve dilim-3 (prompt-first chat) ayrı admission. Sıra: ladder
dalgası (3301/3302/3304→3299) bittikten sonra.
