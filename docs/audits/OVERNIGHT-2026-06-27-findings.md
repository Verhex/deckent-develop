# Overnight Autonomous Findings — 2026-06-27 (KPI Faz-1 + F1-PCACHE)

Bağımsız doğrulayıcı-orkestratör notları. Disk-verify + gerçek-binary esas; Brain'e güvenme.

## Pre-flight (state)
- git: main @3d7d1b04 (ahead-1 = başka-session F1-PCACHE doc commit; dokunulmadı). Working-tree temiz (untracked identity-config-faz3.test.ts).
- DIRECTIVES: 22 task (KPI 1-11 + F1-PCACHE 12-22). Source-fix'lerim intact (persistEnrichedResult, usageEmit). Yedek korunmuş.
- Sprint-state temiz.

## Timeline / Bulgular

### Sprint-330 (KPI 1-11 + F1-PCACHE 12-22, 22 task) — başlatıldı
- Plan: 22 task, models opus(12)/sonnet(10), planner-fix dist'te (hand-fix yok).
- De-risk: build OK; --output-format json risk düşük (agent .result'ı tool'la yazar); ilk-dalga izlenecek.

### Sprint-330 monitor (read-only, ~12 dk gözlem 01:02→)

**Poll 1 — 01:02**
- Progress: **0/22 done**, 4 workers running (330-001 Starting, 330-002 Writing, 330-011 docs §13, 330-012 Writing, 330-013 Starting, 330-018 Starting; status sonradan 019 da spawn). 330-003/004 "Waiting for 1" (dep on 330-001). Geri kalan queued.
- **🟢 TOKEN/COST DE-RISK = WORKS.** task-330-001.result (selfAssessment DONE) gerçek non-zero değerler taşıyor: `tokenUsage{inputTokens:5764, outputTokens:2625, cacheReadTokens:23056, provider:"claude", model:"sonnet"}` + `cost{usd:0.0635838, currency:"USD", pricingSource:"cost-config:anthropic/claude-sonnet-4-6", isLocal:false}`. Provider-agnostik capture KIRIK DEĞİL — 0/0+null DEĞİL. (kaynak: `.tasks/task-330-001.result:13-25`). Not: `.brain/archive/sprint-330-tasks/` henüz yok (sprint canlı, arşivlenmedi).
- **Boundary = temiz.** 330-001 scope.filesWrite (`src/core/kpi/types.ts`, `measure-catalog.ts`, `tests/kpi/measure-catalog.test.ts`) = result.filesChanged ile birebir; scope-dışı yok (`task-330-001.json:16-20` vs `.result:3-7`). git'te scope-dışı src/ değişikliği YOK — yalnız untracked `src/core/kpi/`, `tests/kpi/` (330-001 scope) + `tests/core/identity-config-faz3.test.ts` (pre-flight'tan beri var).
- **Red-flag tarama:** `tests/orchestra/prompt-determinism.test.ts` git-diff'te YOK → PRESERVED ✅. `src/core/kpi/` + `src/core/cost-calculator.ts` içinde `fetch(`/`http` YOK ✅. cost-calculator.ts'te `DEFAULT_CACHE_HIT_RATIO=0.70` (l.124), `DEFAULT_CACHEABLE_CONTEXT=8000` (l.126), kullanım l.395 HÂLÂ MEVCUT — fakat dosya bu sprint'te DEĞİŞTİRİLMEDİ (untracked değil, diff'te yok); F1-PCACHE (330-018 ProviderCacheAdapter vb.) henüz bu sabitlere dokunmadı → şimdilik gözlem, ihlal değil.
- **Stall/collision:** poll-1'de hb'ler taze (mtime ~01:02). Collision yok (330-001 done, kalan running task'lar ayrı scope).
- Health: **GREEN**.

**Poll 2 — ~01:06 (+~4dk)**
- Progress: **3/22 done** (14%). Done: 330-001, 330-011, 330-012. Running: 002, 012, 013, 018, 019, 020 + 003/004 dep-wait. Alert: "stale_spawn_lock auto-removed 5 (TTL>5min)" — benign housekeeping.
- **🟢 TOKEN/COST DE-RISK = WORKS (3 result doğrulandı).** 330-011: `tokenUsage{in:8627,out:500,cacheRead:34508,claude/sonnet}` cost `$0.0437334`. 330-012: `tokenUsage{in:5994,out:1950,cacheRead:23976}` cost `$0.0544248`. Hepsi gerçek non-zero, pricingSource=cost-config, isLocal:false.
- **Boundary = temiz (yeni dosyalar scope-içi).** `M src/core/adr-seed.ts` + `?? src/core/adr-operative-state.ts` → 330-020 scope.filesWrite. `?? src/providers/cache-adapter-resource.ts` → 330-018 scope. `?? src/core/catalog/` + `?? tests/catalog/` → 330-012/013 scope. 330-012 result.filesChanged = scope.filesWrite birebir. Scope-dışı yazım YOK.
- **Collision = yok.** 330-012 & 330-013 ikisi de `src/core/catalog/` dizinine yazıyor ama AYRI dosyalar (012: types.ts/catalog-source.ts; 013: local-static-source.ts/catalog-registry.ts) — paylaşılan dosya yok.
- **Stall = yok.** 330-001.hb 226s bayat AMA task DONE → biten worker heartbeat atmaz, stall değil. Diğer hb'ler taze (<120s).
- **Red-flag:** prompt-determinism.test.ts hâlâ DEĞİŞMEDİ → PRESERVED ✅.
- Health: **GREEN**.

**Poll 3 — ~01:09 (+~7dk)**
- Progress: **5/22 done** (23%). Done: 001, 011, 012, 018, 020. Running: 002, 013, 019, 021 + queued. Alert: ekstra stale_spawn_lock auto-remove (8) — benign.
- **🟢 TOKEN/COST DE-RISK = WORKS — fakat 1 nüans.** 330-018 (opus): `tokenUsage{in:6061,out:6450,cacheRead:24244,opus}` cost `$0.203677` (gerçek non-zero, tam). **⚠️ 330-020 (opus): `outputTokens: null`** — inputTokens:6748 ✅, cacheReadTokens:26992 ✅, cost.usd `$0.047236` ✅ (non-zero, hesaplandı) AMA outputTokens NULL. Yani capture KIRIK DEĞİL (5/5 result'ta input+cacheRead+cost gerçek non-zero), ama 330-020'de output-token alanı surfacelenememiş → cost output'u 0 sayıp HAFİF düşük sayar; kök de-risk (0/0+null) GEÇERLİ DEĞİL, bu yalnız tek-alan kısmi-boşluk. İzlenecek: diğer opus task'larda (002 vb.) tekrarlıyor mu.
- **Boundary = temiz.** Tüm yeni dosyalar scope-içi: 018 (`src/providers/cache-adapter-resource.ts`+test) result.filesChanged=scope birebir; 020 (`adr-operative-state.ts` NEW + `adr-seed.ts` EDIT +27 + test) scope.filesWrite birebir. Scope-dışı YOK.
- **Red-flag taraması (genişletilmiş):** `src/core/catalog/` içindeki `fetch(` hitleri NETWORK DEĞİL — `CatalogSource.fetch(): Promise<CatalogEntry[]>` domain interface metodu; local-static-source.ts:150 "never touches the network" (offline-first 330-013 by-design). cost-calculator.ts DEĞİŞMEDİ (diff'te yok). prompt-determinism.test.ts DEĞİŞMEDİ → PRESERVED ✅.
- **Stall = yok.** Bayat hb'lerin (001=396s, 011=287s, 012=224s) HEPSİ DONE-task (result var) → biten worker hb atmaz. Running task'ların hb'leri taze (013=5s, 019=4s, 021=5s, 002=13s). Stall yok.
- **Display-quirk (red değil):** `status` "What's happening" listesi DONE task'ları (001/011/012/018) hâlâ ▶ olarak gösteriyor; "Active: 4" sayacı + "5/22 done" ground-truth. Render-lag, fonksiyonel sorun değil.
- **Collision = yok.** Aktif yazan task'lar ayrı dosya kümeleri.
- Health: **GREEN**.

**Poll 4 — ~01:11 (+~9dk)**
- Progress: **6/22 done** (27%). Yeni done: 330-002. 003+004 dep açıldı, şimdi RUNNING. 005/006 dep-wait (1,2,3,4 / 1,3,4,5).
- **🟢 TOKEN/COST tablo (6 result):** 001 in5764/out2625/$0.0636 · 011 in8627/out500/$0.0437 · 012 in5994/out1950/$0.0544 · 018 in6061/out6450/$0.2037 · **020 in6748/out=NULL/$0.0472** · 002 in7230/out4350/$0.1594. → **5/6 tam, capture WORKS.** 330-020'nin null-output'u İZOLE tek-seferlik (002 opus değil ama 018 opus tam; 020 sonraki opus 002 sorunsuz → sistemik değil). Sistemik kırılma (her yerde 0/0+null) OLMADI = de-risk GEÇTİ.
- **Boundary = temiz.** Aynı dosya seti, hepsi scope-içi. Scope-dışı YOK.
- **Collision = yok.** 330-003 (`src/core/kpi/kpi-store.ts`+test) ∩ 330-004 (`src/core/kpi/kpi-definitions.ts`+test) = ∅ (ortak dosya yok) — ikisi de kpi/ dizininde ama ayrı dosya.
- **Stall = yok.** Bayat hb'ler (001=525s,011=416s,012=353s,018=221s,020=165s,002=65s) HEPSİ DONE; RUNNING'lerin hb'leri taze (003=1s,004=9s,013=8s,019=7s,021=8s).
- Health: **GREEN**.

**Poll 5 (final) — ~01:13 (+~11dk)**
- Progress: **7/22 done** (32%). Yeni done: 330-013 (in7587/out7170/$0.2324, tam). 014/015 spawn oldu (RUNNING). 005/006 dep-wait.
- **🟢 TOKEN/COST DE-RISK kesin: WORKS.** 7 result'ın 7'sinde inputTokens + cacheReadTokens + cost.usd gerçek non-zero; 6/7'de outputTokens da gerçek. Tek anomali 330-020 outputTokens=null (izole, sistemik değil — sonraki opus'lar 013/018 tam). pricingSource her zaman `cost-config:anthropic/...`, isLocal:false. Sistemik 0/0+null kırılması OLMADI.
- **selfAssessment:** 7/7 DONE. (grep 330-020.result'ta "NO_GO" gördü ama bu yalnız `notes` içinde betimsel metin — task ADR-enforcement/NO_GO-kriteri anlatıyor; parse edilen selfAssessment=DONE.)
- **Boundary = temiz.** Scope-dışı değişiklik filtresi BOŞ döndü — tüm src/tests yazımları ilgili task scope.filesWrite içinde (kpi/catalog/providers/adr-operative/adr-seed). İhlal YOK.
- **Stall = yok.** Tüm RUNNING hb'ler taze (0–9s).
- **Collision = yok.** Aktif yazanlar ayrı dosyalar.
- Health: **GREEN**.

---
## Sprint-330 monitor — KAPANIŞ ÖZETİ (~11 dk, 5 poll)
- **(a) İlerleme:** 0→**7/22 done** (32%), 6 worker aktif, NO_GO=0, hepsi DONE. Steady, sağlıklı akış.
- **(b) 🟢 TOKEN/COST DE-RISK VERDİCT = WORKS.** Provider-agnostik capture SAĞLAM: 7/7 result gerçek non-zero input+cacheRead+cost taşıyor (örn 330-001 in5764/out2625/$0.0636; 330-018 opus in6061/out6450/$0.2037; 330-013 in7587/out7170/$0.2324). `--output-format json` usage'ı yüzeye çıkarıyor — eski 0/0+cost:null kırığı YOK. **Tek nüans:** 330-020'de `outputTokens:null` (input+cost gene gerçek; cost output'u 0 sayıp hafif düşük olabilir) — İZOLE, sistemik değil; takip önerilir ama bloke edici değil.
- **(c) Boundary/stall/collision/red-flag:** HİÇBİRİ yok. Boundary temiz (tüm yazımlar scope-içi, adr-seed.ts→330-020 scope dahil); stall yok (bayat hb=biten worker); collision yok (003/004 kpi ayrı dosya, 012/013 catalog ayrı dosya); prompt-determinism.test.ts PRESERVED; cost-calculator.ts dokunulmadı (0.70/8000/DEFAULT_CACHE_HIT_RATIO bu sprint'te değişmemiş, gözlem); catalog'daki `fetch()` = offline domain-interface metodu, network değil.
- **(d) Genel sağlık: GREEN.** Alert'ler benign (CLAUDE.md>70dk stale + stale_spawn_lock auto-remove housekeeping).

### Sprint-330 — DE-RISK WIN (01:12)
- 🟢 TOKEN/COST CAPTURE WORKS — 7/7 result gerçek token+cost (330-001 $0.0636 / 018 $0.2037 / 013 $0.2324). 1500-sprint gizemi + persistence-fix çözüldü, eski 0/0 tekrarlamadı.
- Nüans: 330-020 outputTokens:null one-off (non-systemic, follow-up).
- Health GREEN: boundary/stall/collision yok; prompt-determinism.test.ts korundu; cost-calculator 0.70/8000 pre-existing (F1-PCACHE cache-adapter-resource.ts'e indi).

---
### Sprint-330 monitor wave-2 (read-only, ~01:15→ devam; F1-PCACHE high-risk odaklı)

**Poll 1 — ~01:16 (wave-2 başı)**
- **Progress: status "12/22 done" (55%); disk-truth = 12 terminal result → 10 DONE + 2 NO_GO.** DONE: 001,002,003,004,011,012,013,015,018,020. NO_GO: 021,022. Active: 3 worker. Queued/PENDING: 005,006,007,008,009,010,**016,017**,022.
- **🔴 NO_GO #1 — 330-021 (agentic-path parity, opus): GERÇEK ama KOD-DIŞI = worker timeout.** `notes:"Worker timeout — process exceeded time limit and was killed"`, filesChanged=[], 0/0 satır, tokenUsage 0/0/0 (kill öncesi output yok). Bu **operasyonel infra-timeout**, sentetik Brain-NO_GO değil; ama kod-mantık hatası da değil — task hiç tamamlanmadı. Scope: `src/agents/agentic-worker-runner.ts` + `tests/agents/agentic-prompt-parity.test.ts` → diske HİÇBİR yazım yok (boundary-temiz, çünkü sıfır-diff). Brain FIX/re-dispatch beklenir.
- **🟡 NO_GO #2 — 330-022 (docs, sonnet): cascade-skip.** `notes:"Cascade-skipped (lifecycle-robustness P0-A): dependency 330-021 ended NO_GO/MANUAL_REVIEW, so this dependent was never dispatched."` → kendi başına hata DEĞİL; 021 fix'lenince re-run. Doğru cascade davranışı.
- **🟢 330-019 (prompt hardening) IN-PROGRESS doğrulaması (EXECUTING, henüz result yok):**
  - `tests/orchestra/prompt-determinism.test.ts` **git diff'te YOK + git status clean → PRESERVED** (değiştirilmedi). ✅
  - Reorder flag default-OFF: `src/orchestra/prompt-segmentation.ts:113` `export const DEFAULT_LEADING_T0_REORDER = false;` ✅ (prompt-god-template.ts:18 import ediyor, blind-on yok; JSDoc:129 "EXPERIMENTAL, default-OFF").
  - Verify-precedence: `buildVerifyPrecedenceNote(verificationMode)` artık TÜM non-doc task'larda emit ediliyor (prompt-god-template.ts:1013-1014 + :1120 `verificationMode = isDocOnlyTask ? 'doc' : 'targeted'` + :1142 koşulsuz çağrı). Tek istisna doc-only task (by-design, test koşmaz) → "verify-precedence-always" KARŞILANIYOR. ✅ (019 bitince result + final-diff ile teyit edilecek.)
- **🟡 016 (cost-calculator rewrite) + 017 (cache-adapter.ts) HÂLÂ PENDING/Queued** — dep'leri (016:[13,15], 017:[15]) DONE olmasına rağmen concurrency-cap nedeniyle henüz dispatch edilmedi. İzleniyor; landing'te constants-gone (016) + no-hardcode-pricing/no-network (017) doğrulanacak.
- **Boundary = temiz.** git diff'teki tek src değişimi `src/orchestra/prompt-god-template.ts` (+56, 330-019 scope-içi) + `src/core/adr-seed.ts` (+23, 330-020 scope-içi, landed). Scope-dışı yazım YOK.
- **cost-calculator.ts: bu sprint'te HÂLÂ DEĞİŞMEMİŞ** (016 başlamadı) → 0.70/8000 grep'i 016-landing'e ertelendi.
- Health: **GREEN** (021 timeout izole infra-event; cascade doğru çalıştı; de-risk + boundary sağlam).

**Poll 2 — ~01:18 — 🟢 330-014 (ModelsDev/OpenRouter) LANDED + DOĞRULANDI = PASS**
- selfAssessment **DONE**, testsPassed=true, token tam (sonnet in5997/out6765/cacheRead23988). filesChanged = scope.filesWrite birebir (models-dev-source.ts, openrouter-source.ts, enrichment-sources.test.ts) → boundary temiz.
- **fetch-mocked KRİTER = KARŞILANDI.** Test (`tests/catalog/enrichment-sources.test.ts`) gerçek-network kullanmıyor: `mockFetch()` (:102-108 `vi.fn().mockResolvedValue`) + `failingFetch()` (:112-113 `vi.fn().mockRejectedValue`) ile sahte fetch enjekte ediliyor; kaynaklar `new ModelsDevSource(mockFetch(...))` şeklinde mock'la kuruluyor. **`grep fetch\(['\"\`]https?://` testte BOŞ** → un-mocked gerçek-URL çağrısı YOK. ✅
- Runtime kaynak: `models-dev-source.ts:150` + `openrouter-source.ts:175` `async fetch(): Promise<CatalogEntry[]>` — gerçek network YALNIZ sync-time enrichment'ta, `fetchFn` injectable (default `globalThis.fetch`), **constructor network'e dokunmuyor** (notes: "constructor never calls network") + hata/!ok/şekil-bozuk → `[]`+console.warn (graceful, offline-first). Tasarım doğru.

**Poll 3 — ~01:24 — 13/22, 016 START + tam boundary taraması (untracked dahil)**
- **Canlı worker'lar (hb-freshness ground-truth, status display-lag'ı aşar):** 330-019 (1s), 330-006 (8s), **330-016 (13s)** RUNNING; 330-005 result-landed (yeni DONE). Active=3. **🟢 330-016 (cost-calculator rewrite) DISPATCH OLDU** — landing'te 0.70/8000/DEFAULT_* constants-gone doğrulanacak. 330-017 hâlâ Queued (dep [15] hazır, concurrency-cap bekliyor).
- **Stall = YOK.** Eski hb'lerin hepsi result-landed (biten worker hb atmaz: 001=1207s…020=847s hepsi DONE). 3 canlı worker hb<15s. 2.5dk üstü RUNNING task yok.
- **🟢 Boundary = TEMİZ (untracked + modified tam tarama).** `git status --short src tests`: M=adr-seed.ts(→020)+prompt-god-template.ts(→019); ??=adr-operative-state.ts(→020), catalog/(→012-015), kpi/(→001-006), prompt-segmentation.ts(→019), cache-adapter-resource.ts(→018), tests/{catalog,kpi}, adr-operative-state.test.ts(→020), prompt-segmentation.test.ts(→019), cache-adapter-resource.test.ts(→018) — **HEPSİ ilgili task scope.filesWrite içinde.** Tek 330-dışı dosya `tests/core/identity-config-faz3.test.ts` = **oturum-başı PRE-EXISTING** (sprint-329 social-identity işi, ihlal değil). Scope-dışı 330-yazımı YOK.
- **Collision = YOK.** 3 canlı worker ayrı dizin/dosya: 019=orchestra/, 006=kpi/collection.ts, 016=core/cost-calculator.ts. Ortak dosya yok.
- **Alerts (6) = benign:** CLAUDE.md>70dk stale + stale_spawn_lock auto-removed (housekeeping). Agent-failure / provider-failure / boundary alert YOK.
- Health: **GREEN.**

**Poll 4 — ~01:24 — 🟢 330-019 (prompt hardening) LANDED + TAM DOĞRULANDI = PASS**
- selfAssessment **DONE**, testsPassed=true. filesChanged = scope.filesWrite birebir (prompt-segmentation.ts, prompt-god-template.ts, prompt-segmentation.test.ts). Token: opus in7806/**out=null**/cacheRead31224.
- **🟢 KRİTİK — `tests/orchestra/prompt-determinism.test.ts` PRESERVED:** `git status --short` CLEAN + `git diff --stat` grep BOŞ → bütün sprint boyunca HİÇ değiştirilmedi. ✅ (en yüksek-risk koruma kriteri karşılandı.)
- **🟢 Reorder flag default-OFF (final):** `src/orchestra/prompt-segmentation.ts:113` `export const DEFAULT_LEADING_T0_REORDER = false;`. Blind-default-on YOK. ✅
- **🟢 Verify-precedence "always" (final):** `buildVerifyPrecedenceNote()` prompt-god-template.ts:1022; eski suppression-gate artık YALNIZ `if (verificationMode === 'doc') return ''` (:1023) tek-istisnasına indi; :1135 `isDocOnlyTask` + :1161 koşulsuz `${buildVerifyPrecedenceNote(verificationMode)}` çağrısı → test-koşan TÜM task'larda emit. ✅
- **🟡 Token nüans tekrar:** opus 019 `outputTokens=null` — bu wave-1'deki opus 330-020 ile AYNI desen (opus task'larda aralıklı null-output; 018/013 opus'ta tam). **Tekrar-eden (recurring) opus-özel nüans, sistemik 0/0 kırığı DEĞİL** (input+cacheRead gerçek; cost yalnız output'u 0 sayıp hafif düşük). Follow-up önerilir, bloke edici değil.
- **Boundary = temiz** (3 dosya scope-içi). 015 + 005 + 019 sonrası **15/22 done**, Active=2. 330-016 hâlâ RUNNING (cost-calculator); 017 Queued. watch2 yeniden silahlandı (016/017 landing için).
- Health: **GREEN.**

**Poll 5 (final) — ~01:28 — 🟢 330-016 (cost-calculator rewrite) LANDED DONE+tests, 17/22**
- 006 + 016 landed → **17/22 done** (77%), Active=2. **330-016 result: selfAssessment DONE, testsPassed=True** → disk-preview constants-check artık RESULT ile teyitli. **330-017 (cache-adapter.ts A/B/D/E) BAŞLAMADI** (diskte yok, Queued) → wave-2 penceresinde landing'e yetişmedi.
- **🟢 330-016 CONSTANTS-GONE = CONFIRMED.** `src/core/cost-calculator.ts`: `DEFAULT_CACHE_HIT_RATIO` ABSENT ✅ · `DEFAULT_CACHEABLE_CONTEXT` ABSENT ✅ · `8000` ABSENT ✅ · standalone `0.70` cache-hit-ratio ABSENT ✅. Kalan tek `0.7` = `cost-calculator.ts:694 const optimisticFactor = 0.7` (estimateSprintCost confidence-band çarpanı, worst=1.6 ile çift; pre-existing + yorum-açık, DEFAULT_CACHE_HIT_RATIO DEĞİL). Spec-hedefli 3 hardcode GONE.
- **Signatures korunmuş (caller-break yok):** mevcut export'lar duruyor (`calculateActualCost`, `estimateSprintCost`, `formatEstimate`, `resolveBillingModeForAuth`, `TaskCostInput`…) + yeni regime API (`calculateRegimeCost`@317, `billingModeToRegime`@256, `CostRegime`@216, `RegimeCostResult`@232). testsPassed=True → mevcut cost-calculator testleri green.
- **🟢 330-018 (cache-adapter-resource.ts, adapter C) no-hardcode-pricing + no-network = PASS** (017 yetişmediği için landed-adapter ile karşılandı): hardcoded pricing-literal grep BOŞ; `fetch(`/`https?://`/`axios`/`net.` grep BOŞ → runtime'da network YOK.
- Health: **GREEN.**

---
## Sprint-330 monitor wave-2 — KAPANIŞ ÖZETİ (~14 dk, 6 poll, ~01:15→01:29)
- **(a) İlerleme:** wave-2 boyunca **12 → 17/22 done** (55%→77%). Disk-truth terminal=17 → **15 DONE + 2 NO_GO** (021,022). Kalan 5: 017 (Queued, başlamadı), 007/008 (dep-wait), 009/010 (Queued). Sprint pencere içinde TAMAMLANMADI → `deckent review` çalıştırılmadı.
- **(b) High-risk verdict'ler:**
  - **014 (ModelsDev/OpenRouter): 🟢 PASS.** Test fetch'i `vi.fn()` mock (enrichment-sources.test.ts:102/112), un-mocked gerçek-URL fetch YOK; constructor network'siz, sync-time `fetchFn` injectable. DONE.
  - **016 (cost-calculator rewrite): 🟢 PASS (CONFIRMED).** 0.70/8000/DEFAULT_CACHE_HIT_RATIO/DEFAULT_CACHEABLE_CONTEXT hepsi ABSENT; lone 0.7=optimisticFactor (farklı, pre-existing); signatures korunmuş + regime API eklendi; **DONE + testsPassed=True**.
  - **019 (prompt hardening): 🟢 PASS (tam).** `prompt-determinism.test.ts` PRESERVED (git status clean + diff'te yok); reorder flag `DEFAULT_LEADING_T0_REORDER=false` (prompt-segmentation.ts:113); verify-precedence note test-koşan tüm task'larda emit (prompt-god-template.ts:1022/1135/1161, tek-istisna doc-only). DONE.
  - **017 (cache-adapter.ts A/B/D/E): ⏳ NOT REACHED** (Queued, diskte yok). 018 (adapter C, landed) ile no-hardcode-pricing + no-network kriteri PASS olarak vekaleten karşılandı.
- **(c) NO_GO / boundary / stall / collision:**
  - **NO_GO=2:** 330-021 (opus, agentic-parity) = **GERÇEK ama infra-timeout** ("Worker timeout — process killed", 0 dosya, token 0/0/0) — kod-mantık hatası değil, sentetik de değil; Brain re-dispatch beklenir. 330-022 (docs) = **cascade-skip** (dep 021 NO_GO → hiç dispatch edilmedi); doğru davranış.
  - **Boundary = TEMİZ** (untracked dahil tam tarama): tüm src/tests yazımları ilgili 330 scope.filesWrite içinde; tek 330-dışı dosya `tests/core/identity-config-faz3.test.ts` = oturum-başı pre-existing (sprint-329), ihlal değil.
  - **Stall = YOK** (bayat hb'ler hep biten-worker; canlı worker hb<15s). **Collision = YOK** (eşzamanlı worker'lar ayrı dosya/dizin).
- **(d) Token nüans (recurring):** opus task'larda aralıklı `outputTokens=null` — wave-1 330-020 + wave-2 330-019 (opus). input+cacheRead+cost gene gerçek non-zero; sistemik 0/0 kırığı DEĞİL (018/013/014/016 output tam). cost yalnız output'u 0 sayıp hafif düşük olabilir → opus output-token surface follow-up önerilir, bloke edici değil.
- **(e) Alerts (6) = benign** (CLAUDE.md>70dk stale + stale_spawn_lock auto-remove housekeeping). Provider/agent-failure alert YOK.
- **GENEL SAĞLIK: 🟢 GREEN.** 4 high-risk task'ın 3'ü (014/016/019) doğrulandı + TEMİZ (016/019 DONE+tests, 014 DONE); 017 pencereye yetişmedi (018 ile vekaleten karşılandı); tek operasyonel pürüz 021 worker-timeout (izole, cascade doğru çalıştı, Brain-FIX bekliyor).

### Sprint-330 — POST-SPRINT VERIFY (verdict: GO_WITH_TECH_DEBT)
- 28/28 (27 DONE+1 TECH_DEBT, 0 NO_GO; FIX recover 021-timeout+022-cascade). build tsc=0 repo-wide. KPI+catalog 268/268; affected 13872 pass + 1 fail (convention).
- C4 invariant PASS (network/sandbox/tenant/i18n/non-block/ESM); C4b/e/g ilk-run head-pipe-&& false-positive'di.
- 🔴 FIX-gerek: (1) generic-throw ×3 (kpi-definitions.ts:93, models-dev-source.ts:155, openrouter-source.ts:180 → DeckentError); (2) opus outputTokens:null (330-019/020 capture under-count); (3) C5/009 data-gap (kpi boş — collection forward-only, 330 build-öncesi finalize; self-resolve sonraki finalize'da).
- Brain↔disk uyumlu.

### Sprint-331 (sprint-330-fix + Beta-next-work, 16 task) — başlatıldı
- Draft: subagent (docs→16 distinct-file task). DÜZELTME: subagent `- Dependencies: 0`'ı "none" sandı → 14 spurious-dep (331-001 self-dep=DEADLOCK) + T15/T16 off-by-one. CC-fix: dep-0'lar silindi, T15→Task3, T16→Task3,4. Distinct-file + dep-resolve + no-self-dep doğrulandı.
- Track A (verify-fix): error-convention(throws→DeckentError), opus-outputTokens, KPI-backfill. Track B (Beta): F1-012 provider-registry de-hardcode, F1-014r auth-non-leak, codex-token-parity, Dockerfile.worker-ship, B-HANDOFF/B-ZOMBIE, KPI Faz-2 surfaces (MCP/API/trend). R7 deferred (not-surgical).

### Sprint-331 monitor
**Scope map (distinct-file collision check):** 16 task, hepsi ayrı src dosyası — collision YOK. 008(`src/mcp/tools/kpi.ts`) vs 015(`src/cli/commands/kpi.ts`) vs 003(`src/core/kpi/kpi-{backfill,service}.ts`) farklı dosyalar. 001 baseline (önceki verify): generic-throw @ kpi-definitions.ts:93, models-dev-source.ts:155, openrouter-source.ts:180.
- **Poll-1 (t0):** progress **0/16**, 8 worker RUNNING (331-001..008 wave-1; 009-016 queued). hb hepsi taze (<15s). Alerts: Budget OVER (763/600 lines, benign line-budget) — provider/agent-failure YOK.
  - **Boundary:** working-tree'de tek src dosyası `src/agents/agentic-worker-runner.ts` (+129) — HİÇBİR 331-task scope'unda DEĞİL, son commit 238f9e02 (sprint 303-305) → **pre-existing dirty-tree, ihlal değil** (oturum-öncesi). Diğer diff'ler sprint-infra (DIRECTIVES/CLAUDE/.deckent/docs). In-scope src dosyaları henüz diskte yok (yazılıyor).
  - **Stall/Collision/NO_GO:** YOK. **Health: 🟢 GREEN.**
- **Poll-2 (+~80s):** progress **1/16** (331-005 DONE), 8 worker aktif (001-008 + 009 hb belirdi). Sprint-start=DIRECTIVES.md mtime **02:37:37** (boundary-baseline referansı).
  - **001 (error-convention) — 🟢 PASS (in-progress, temiz):** her 3 dosyada `throw new Error` = **0** (kpi-definitions.ts / models-dev-source.ts / openrouter-source.ts hepsi temizlendi); kpi-definitions.ts:84 artık `DeckentError` (DECKENT_E073) referansı + errors.ts +26. hb hâlâ aktif → completion'da teyit edilecek ama yön net PASS.
  - **005 (Dockerfile.worker ship) — 🟢 DONE (mock DEĞİL):** real-binary smoke koştu — `npm pack --dry-run 2>&1 | grep -q Dockerfile.worker → exit 0`; filesChanged={package.json, tests/build/npm-pack-dockerfile.test.ts} (scope-içi); hermetik async-spawn (spawnSync yok). testsPassed=True.
  - **Boundary — TEMİZ:** in-scope src diff'leri (001:kpi-definitions/errors/2×catalog, 005:package.json) ilgili scope.filesWrite içinde. 331-DIŞI working-tree dosyaları — `src/agents/agentic-worker-runner.ts`(+129, commit 238f9e02) + 3 untracked test (cost-calculator-regime 01:26, adr-operative-state 02:00, agentic-prompt-parity 02:04) — **HEPSİ sprint-start (02:37) ÖNCESİ** → pre-existing dirty-tree (sprint-329/330), 331-ihlali DEĞİL.
  - **Stall/Collision/NO_GO:** YOK (005 hb 67s = biten-worker, stall değil). **Health: 🟢 GREEN.**
- **Poll-3 (02:44, +~2.5dk):** progress **4/16** (DONE: 001, 005, 006, 008). 6 worker aktif + 009-012 hb belirdi.
  - **001 (error-convention) — 🟢 DONE/PASS (FINAL):** `throw new Error` = **0/0/0** (3 dosya); ErrorRegistry.createError + yeni kodlar DECKENT_E072 (catalog HTTP) / E073 (KPI formula); test 105-satır error-handling-unification GREEN. Tüm dosyalar scope-içi.
  - **002 (opus outputTokens) — 🟢 fix mükemmel (landing, henüz DONE değil):** yeni `modelUsageOutputTokens(envelope)` nested camelCase `modelUsage[*].outputTokens`'i **yalnız** top-level `usage.output_tokens` absent olduğunda fallback okuyor → `readNonNegInt(usage,'output_tokens') ?? modelUsageOutputTokens(envelope)`. Honest-`undefined`-when-absent KORUNDU, **fabrikasyon YOK** (spec'in tam istediği). claude.ts +43.
  - **006 (B-HANDOFF) — 🟢 DONE:** `pruneCompletedSprints` finalize'a non-blocking hook (runBudgetedDecay pattern), ADR-008 yön-uyumlu. sprint-finalizer.ts +50, scope-içi.
  - **008 (KPI MCP tool) — 🟢 DONE:** `deckent_kpi` → KpiService.listSprintViews delege (re-impl yok), 9/9 test. mcp/tools/{kpi.ts,index.ts} scope-içi. NOT: 008 worker, 002'nin eşzamanlı in-flight edit'inden geçici `claude.ts:503 TS6133 unused-var` tsc-gürültüsü gördü (kendi scope-dışı, doğru raporladı; 002 bitince temizlenir) — defect değil, concurrent-edit tsc-noise.
  - **Boundary — TEMİZ:** yeni in-scope yazımlar (002:claude.ts/test, 006:sprint-finalizer/test, 008:mcp kpi+index+test) hepsi scope.filesWrite içinde. Untracked 331-dışı dosyalar hâlâ pre-031 (02:37 öncesi).
  - **Stall/Collision/NO_GO:** YOK (005 hb 213s = biten-worker; çalışan task'ların hb<36s). **Health: 🟢 GREEN.**
- **Poll-4 (02:46, +~2dk):** progress **5/16** (DONE: 001, 002, 005, 006, 008). 8 worker aktif (003,004,007 + 009-013).
  - **002 (opus outputTokens) — 🟢 DONE/PASS (FINAL):** root-cause disk-verified (probe.mjs): opus result-envelope top-level `usage.output_tokens`'i atlayıp gerçek sayıyı nested `modelUsage[<model>].outputTokens`'de raporluyor; eski kod yalnız top-level okuduğu için `?? 0` collapse oluyordu (330-019/020 tekrarı). Fix surgical, honest-null korundu. claude-usage.test.ts GREEN. claude.ts:503 tsc-noise CLEARED (002 done).
  - **004 (F1-012) — ⏳ HENÜZ LANDING DEĞİL** (provider.ts diff'te yok, hb 8s aktif). LAW#2 verdict completion'da.
  - **Landing in-scope (henüz DONE değil):** 003(kpi-service.ts+33, kpi-backfill.ts untracked), 009(api/server.ts+4, kpi-endpoint.ts untracked), 010(ollama.ts+75), 012(cost-calculator.ts+9) — hepsi ilgili scope.filesWrite içinde.
  - **Boundary — TEMİZ.** **Alerts (3) = benign** (`stale_spawn_lock` auto-removed TTL>5min housekeeping; provider/agent-failure YOK).
  - **Stall/Collision/NO_GO:** YOK (146/323/124/118s hb'ler hep biten-worker'lar; çalışan task hb<13s). **Health: 🟢 GREEN.**
- **Poll-5 (02:48, +~2dk):** progress **6/16** (DONE: +010).
  - **010 (ollama /api/tags health-gate) — 🟢 DONE:** `checkHealthGate(requestedModel?)` injectable `fetchImpl`+PROBE_TIMEOUT seam ile `/api/tags` prob ediyor — **gerçek-network YOK**, host-down/empty-models/non-2xx/model-absent'te throw-suz `available:false`+actionable reason. ollama.ts/test scope-içi.
  - **003 (KPI backfill) — wiring DOĞRU (landing, henüz DONE değil):** `ensureBackfill()` (kpi-service.ts:81→`backfillFromHistory` :85) HER İKİ read-path'e wired (`:105` listSprintViews + `:146` getTrend), once-per-instance guard (:58). Spec'in tam istediği self-heal. Smoke (`kpi --json` non-empty) completion'da teyit.
  - **004 (F1-012) — ⏳ HÂLÂ landing değil** (provider.ts diff'te yok; en uzun-koşan task — 3 registration-site refactor, beklenen). LAW#2 verdict bu monitör-penceresinde 004 inerse, yoksa post-completion verify'a kalır.
  - **Boundary — TEMİZ.** **Stall/Collision/NO_GO:** YOK. **Health: 🟢 GREEN.**
- **Poll-6 (02:49, monitor-pencere sonu):** progress **9/16** (DONE: 001,002,005,006,008,009,010,012; **0 NO_GO**). 6 worker aktif (003,004,007,011,013,014/15/16 kuyruk).
  - **🔑 004 (F1-012) — LAW#2 VERDICT: 🟢 PASS** (provider.ts +168, result henüz yazılmadı ama kod diskte tam):
    - 3 registration-site artık config-driven: `resolveOpenAICompatCandidates(providerDefs)` BUILTIN candidate'leri config-declared `openai-compatible` provider'larla MERGE ediyor, isim-collision'da **config precedence** (p004.diff:125-127); `providerDefs` yoksa **tam built-in** (config-absent = byte-for-byte, satır 107) → backward-compat korundu. `applyDeckSecretsToEnv(secrets, config.providers?.registry)` config-sourced.
    - **Unknown provider HONEST-FAIL:** unknown `kind` → `continue` (register edilmez); config-provider key'siz → `skipped.push({reason})` "rather than silently falling back" (satır 169). **claude'a sessiz düşmüyor.**
    - **Residual (ihlal DEĞİL):** tek kalan `'claude'` literal = `provider.ts:1136` `config.brain_provider ?? (registered[0] ?? 'claude')` — global hiç-config-yok default-tiebreaker, registration-site DEĞİL + claude-unregistered iken inert (hasProvider=false→null). Configured-ama-unavailable provider bu literal'a değil, warn+fallback-to-first-registered yoluna (:1138→:1143) gidiyor. Kozmetik follow-up (004'ün 3-site scope'u dışı), LAW#2 ihlali değil. **Verdict: PASS.**
  - **009 (/api/kpi Tier-1) — 🟢 DONE:** registerKpiEndpoint → KpiService.listSprintViews JSON; coverage-endpoint shape; api/{kpi-endpoint,server}+test scope-içi.
  - **012 (cost honest-signal) — 🟢 DONE:** `RegimeCostUsage.outputTokens: number|null` (backward-compat widening, additive), 002/011 source-fix'lerini tamamlayan defense-in-depth.
  - **Boundary FINAL-SCAN — TEMİZ:** her src dosyası kendi scope.filesWrite'ında (007:doctor-checks.ts+148, 004:provider.ts+168 dahil); tek scope-dışı `agentic-worker-runner.ts` = pre-existing (02:37 öncesi). **Collision/Stall/NO_GO YOK.**
- **MONITOR ÖZET (15dk pencere, 6 poll):** sprint **0→9/16** ilerledi, **0 NO_GO, 0 boundary-ihlali, 0 stall, 0 collision**. Doğrulanan-DONE: 001(PASS error-conv 0-throw), 002(PASS opus-outputTokens modelUsage-fallback honest-null), 005(DONE Dockerfile real-smoke), 006(DONE handoff-prune hook), 008(DONE kpi-MCP), 009(DONE /api/kpi), 010(DONE ollama health-gate no-network), 012(DONE cost null-signal). **004 F1-012 = LAW#2 PASS** (config-driven, unknown→honest-fail; residual :1136 kozmetik). 003 pencere-sonunda **DONE** indi (self-healing backfill, disk-verified: gerçek memory.db'de henüz kpi_measurements yok; ensureBackfill her-iki-read-path idempotent wiring teyitli). Kalan 004(kod-diskte/result-bekliyor),007,011,013,014,015,016 in-flight. **GENEL SAĞLIK: 🟢 GREEN.** (Alerts hep benign stale_spawn_lock housekeeping; provider/agent-failure YOK.)

### Sprint-331 — POST-SPRINT VERIFY (verdict: GO_WITH_TECH_DEBT)
- 16/16 (12 DONE + 4 TECH_DEBT, 0 NO_GO). build tsc=0. KPI+catalog+error-handling 460/460. 001-fix (throws→DeckentError) ✓. 004 F1-012 Law-#2 PASS. 002 opus-outputTokens ✓.
- Regresyon: identity-generator test (008 yeni deckent_kpi MCP-tool→count-stale) → `npm run docs:stats` regen → YEŞİL.
- 🔴 C5 PROOF-OF-FUNCTION — 3 GERÇEK KPI-BUG (engine çalışıyor: `kpi --sprint sprint-331`→8 KPI, results 776 db'de; ama):
  1. `deckent kpi` no-arg → sprintId:null → BOŞ (kpi.ts:195 getCurrentSprintId aktif-yok→null; latest-finalized fallback YOK). **proof-of-function blocker.**
  2. forward-collection finalize'da FİRE ETMİYOR (backfill skipped:0 = recordKpiMeasurements sprint-331'de koşmadı). finalizer:752 dbPath/hook incele.
  3. cost/token KPI=0 (data backfill'den=summary, telemetri-yok; forward-collection fire-etse .result'tan gerçek-cost gelir).
- → fix-sprint (sprint-332): kpi-no-arg-fallback + forward-collection-fire + cost/token-capture. Backfill İYİ ÇALIŞIYOR (1067 measurement).
