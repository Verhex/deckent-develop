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

### Sprint-332 (3 KPI-fix + Beta-next-work, 16 task) — başlatıldı
- Track A: kpi-no-arg-fallback (kpi.ts:195), forward-collection-fire+cost/token (finalizer:791+collection.ts; root-cause=buildUsageTotals:661 opus-estimate kullanıyor result.cost.usd yerine).
- Track B (13): F1-013 agentic-HTTP-worker, SPAWN-1 Windows-fix, CFG-1, F1-IMG-2, DOC-PKG-1, F1-005 Dockerfile-multiCLI, F11-012 Ink-encoding, B-ZOMBIE-doctor-wire, KPI-Faz2 (dashboard-card/api-trend/mcp-trend/telegram/cost-mcp).
- F1-015 düşürüldü (bedrock.ts zaten var). Dep-bug yok (hepsi distinct-file independent). Subagent draft + CC-verify.

### Sprint-332 monitor
READ-ONLY izleyici (no build/edit/kill), ~15dk pencere, ~80s poll. Disk-verify esas.
- **Baseline (03:33):** status 0/16, "Active: 0 workers" UI-gösterimi ama heartbeat'ler 332-001..007+009 için canlı (sprint geniş-spawn ediyor). git src/tests diff BOŞ (yalnız pre-existing `package.json +1` + untracked `tests/core/identity-config-faz3.test.ts`). 16 task hepsi **distinct filesWrite** → collision-riski yok (disk-doğrulandı). Alert: yalnız benign stale_spawn_lock housekeeping beklenir.
- **Scope-haritası (boundary-referans):** 001=kpi.ts+test · 002=sprint-finalizer.ts+collection.ts+test · 003=provider.ts+subprocess.ts+test · 004=config.ts/config-migration.ts/config-cmd+test · 005=openai-compatible.ts+http-agentic-worker.ts+test (F1-013) · 006=doctor.ts+doctor-checks.ts+test · 007=stream-segmenter.ts+test · 008=dashboard KpiCard/pages/i18n+test · 009=api/kpi-trend-endpoint.ts+server.ts+test · 010=mcp/tools/kpi.ts+test · 011=cli/image.ts+entry.ts+test · 012=README+package.json+test · 013=Dockerfile.worker+spawn-backend-docker.ts+test · 014=connectors/kpi-sprint-summary.ts+notify-adapter+test · 015=mcp/tools/cost.ts+index.ts+test · 016=docs/MASTER-PLAN.md.
- **POLL 1-2 (03:34-03:36): 1/16, 8 worker.** Spawn 001-008 + 009 (009 status'ta "Queued" görünse de canlı: hb 03:35:46 + scope-içi `src/api/{server.ts,kpi-trend-endpoint.ts}` yazıyor — display-lag, ihlal değil). src-diff hep scope-içi: kpi.ts→001, server.ts+kpi-trend-endpoint.ts→009. Heartbeat'ler hep taze, stall yok, collision yok.
- **🟡 332-008 NO_GO = SENTETİK (env/auth, kod-değil):** `notes:"AUTH_FAILED: claude --version exitCode=null stdout=\"\""`, filesChanged=[], 0 satır, mtime 03:33:13 (erken-spawn auth-glitch, kod-işi öncesi). cost $0.043 (8.4k-in/500-out boşa-spawn). Bilinen transient; Brain genelde re-spawn eder. **GERÇEK kod-hatası DEĞİL.**
- **✅ TASK 1 (kpi no-arg fallback) — DISK-VERIFIED PASS** (`src/cli/commands/kpi.ts` +58, scope-içi): yeni `latestSprintWithResults(dbPath, tenantId)` → read-only `SELECT period_key FROM kpi_results WHERE tenant_id=? AND grain='sprint' ORDER BY computed_at DESC, period_key DESC LIMIT 1` (**hardcoded-id DEĞİL**). Precedence: `--sprint` → aktif-sprint (`currentSprintFn`) → latest-finalized-with-results → honest-empty (`{sprintId,kpis:[]}`, DB yaratmaz). `{readonly,fileMustExist}` + `finally db.close()` + catch→null (schema-yok crash-yok). İstenen fix birebir. (test/result bekliyor.)
- **POLL 3-4 (03:37-03:38): 2/16.** Scope-içi yeni landings: 003→provider.ts(+52)/subprocess.ts(+37), 006→doctor.ts(+26), 007→stream-segmenter.ts(+26)+utf8-test, 010→mcp/tools/kpi.ts(+8). Hepsi kendi scope.filesWrite'ında. Heartbeat'ler taze (001-007,009,010). **STALL/BOUNDARY/COLLISION YOK.**
- **✅ TASK 009 (GET /api/kpi/trend) — DONE (verified):** `registerKpiTrendEndpoint`, anti-IDOR tenant-scope (server-derived principal), honest no-data (200 `{series:[]}`, DB-yaratmaz), `tsc` 0, 8/8 + 5/5 regresyon GREEN; server.ts additive, kpi-endpoint.ts dokunulmadı (scope-uyumlu).
- **Alerts(2) = benign** `stale_spawn_lock` auto-remove (TTL>5min housekeeping) — provider/agent-failure DEĞİL. Budget "OVER 770/600" = pre-existing resource-log uyarısı, sprint-sağlığı değil.
- **Task 2 (02:38'de aktif):** status "editing src/orchestra/sprint-finalizer.ts — buildUsageTotals + recordSprintKpis" → root-cause alanında yazıyor. Task 5 (F1-013) hâlâ "Starting", `http-agentic-worker.ts` absent.
- **POLL 5 (03:39): 4/16 done (001,007,009 DONE + 008 sentetik-NO_GO).** Scope-içi: 004→config.ts/config-migration.ts/config.ts(+8/+17/+14), 010→mcp/tools/kpi.ts(+79), 002→sprint-finalizer.ts(+138). 011/012 worker'ları da başladı (11 task canlı-hb). **Task 5 hb 03:39:54 CANLI — stall DEĞİL, sadece büyük/yavaş.** Boundary/collision/stall YOK.
- **✅ TASK 2 (forward-collection + real cost/token) — ROOT-CAUSE DISK-VERIFIED** (`sprint-finalizer.ts` +138 + `collection.ts` +): `buildUsageTotals` artık **REAL-cost-first** → `const realCost = result.cost?.usd; costUsd += Number.isFinite(realCost) ? realCost : estimateResultCost(usage)` — her result'ın gerçek `result.cost.usd` + `result.tokenUsage` (input/output/cacheRead) toplanıyor; opus-estimate yalnız `cost` taşımayan result için FALLBACK'e indirildi (provider-agnostik; local `cost.usd===0` authoritative). **fix #3 ✓.** Ayrıca yeni `recordSprintKpis(projectRoot, sprint.id, metrics, results)` finalize success-path'e (satır 175) wire edildi → `recordKpiMeasurements(...)` finalize'da FİRE ediyor → **fix #2 (non-fire) ✓.** collection.ts doc da "Real-cost-first … 0 is a valid" ile tutarlı. (result bekliyor; iki dosya da yazıldı, yön kesin doğru.)
- **POLL 6 (03:40-03:41): 5/16 (010 DONE eklendi).** ⚠️ **Task 5 (F1-013) NOTU:** `task-332-005.partial-result` bir **STARTUP-MARKER** (`partialMarker:true`, 0-token, "written at startup … if OOM/force-stop") — GERÇEK NO_GO DEĞİL, worker-başlangıç emniyet-kaydı; .result yazılınca üzerine yazılır. hb 03:40:49 CANLI (9s). F1-013 opus-model, büyük-feature; ~8dk'da henüz dosya yok ama **stall değil** (hb taze). `http-agentic-worker.ts` absent — yakın takip. Scope-dışı creep YOK (chat-tool-exec/executor/runner temiz).
- **POLL 7 (03:42): 7/16 done — 001,002,003,004,007,009,010 DONE + 008 sentetik-NO_GO.** README.md(+4)→012 scope-içi. **Task 2 (002) DONE** (root-cause fix disk-doğrulandı yukarıda). DONE-task hb'leri (001/007/009/010) bayat ama beklenen (winding-down); aktif worker hb'leri taze. Alerts(2) hâlâ benign stale_spawn_lock. **BOUNDARY/STALL/COLLISION YOK.**
- **✅ TASK 5 (F1-013 agentic HTTP-worker) — DISK-VERIFIED HEALTHY (in-flight):** `src/agents/http-agentic-worker.ts` (712 satır, scope-içi) provider-agnostik loop → `createToolExecDispatcher` (`chat-tool-exec.js`) + `agentic-worker-runner/entry/tools.js` + `scope-guard.js` **READ-only import** (bu kaynak-dosyaların HİÇBİRİ diff'te modified DEĞİL → boundary-creep YOK). write/edit tool'ları `isPathInScope(targetPath, scope, projectRoot)` ile scope-dışını **hard-reject** (ADR-037 RBAC, hata model'e döner). Spec-tasarımı birebir. (openai-compatible.ts spawn-fix + test hâlâ bekliyor; yön kesin doğru.)
- **✅ TASK 5 (F1-013) — DONE (03:47, verified):** 3 scope-dosyası + 1 (aşağı). `openai-compatible.ts` (+199): `spawn()` artık throw-etmiyor → `node http-agentic-worker.js <taskId> <model> <baseURL> <apiKeyEnv> <name>` subprocess spawn'lıyor (workers-map + EXECUTING hb + timeout SIGKILL + exit-cleanup, OllamaAdapter-mirror); send() tool-use widened (back-compat, plain-chat byte-identical). testsPassed=true, `tsc` 0, **24/24 GREEN** + regresyon tests/agents 937/937 + tests/providers 602/602. Phase-2'ler kodda `TODO(phase2)` ile dürüst-işaretli (multi-worker concurrency, SCOPE_INSUFFICIENT event-parity), stub-borç değil.
- **⚖️ BOUNDARY NÜANS (gerçek-ihlal DEĞİL):** 005 ek olarak `tests/providers/openai-compatible.test.ts` (+41/-5, tracked/pre-existing) düzenledi — bu dosya 005 `scope.filesWrite` (3-dosya allowlist) DIŞINDA, AMA 005 `scope.directories=["src/providers/","src/agents/","tests/agents/","tests/providers/"]` İÇİNDE. Yani **directory-scope grant'i içinde, dar filesWrite-allowlist'i dışında.** Edit zorunlu+doğru: eski test `spawn() throws /HTTP-only/` assert ediyordu (F1-013 bunu kaldırdı) → güncellenmese suite kırılırdı; worker bunu .result'ta açıkça beyan+gerekçelendirdi (goCriteria "existing openai-compatible tests GREEN"). **Net: in-bounds (scope.directories), self-disclosed, regresyon-koruyucu. Hard-violation YOK.** (Not: Brain filesWrite-listesi directory-grant'ten dar kalmış — kozmetik scope-tanım boşluğu.)
- **═══ MONITOR FINAL (15dk pencere, POLL 1-11 + canlı disk-verify, 03:33→03:48) ═══**
  - **İlerleme:** 0/16 → **13/16 done (81%)** pencere-sonunda; **13 DONE + 1 NO_GO (008 sentetik) + 011/013/015 hâlâ in-flight (hb taze 4-14s).** DONE: 001,002,003,004,005,006,007,009,010,012,014,015,016.
  - **3 odak-task hepsi ✅ PASS (disk-doğrulandı):** **Task1** kpi no-arg→`latestSprintWithResults` DB-query fallback (hardcoded-değil). **Task2** root-cause düzeltildi: `buildUsageTotals` real `result.cost.usd`+`result.tokenUsage` (opus-estimate fallback-only) + `recordSprintKpis` finalize-fire (non-fire fix). **F1-013** agentic HTTP-worker DONE, 24/24, executor READ-only reuse + ADR-037 scope-enforce.
  - **🟡 Tek NO_GO = 332-008 SENTETİK** (`AUTH_FAILED: claude --version exitCode=null`, 0-satır, erken-spawn auth-glitch) — GERÇEK kod-hatası DEĞİL; Brain re-spawn/FIX adayı.
  - **Sağlık taraması: STALL YOK** (bayat-hb'lerin hepsi DONE-task winding-down; aktif worker'lar hep taze), **COLLISION YOK** (16 task distinct-file), **HARD-BOUNDARY-VIOLATION YOK** (her değişen dosya kendi task scope.filesWrite/directories'inde; 005-test nüansı in-bounds). Alerts hep benign `stale_spawn_lock` housekeeping; provider/agent-failure YOK.
  - **GENEL SAĞLIK: 🟢 GREEN.** Pencere içinde sprint tamamlanmadı (13/16); kalan 011(F1-IMG-2 image),013(Dockerfile-multiCLI),015(cost-MCP) in-flight, sağlıklı.

### Sprint-332 — POST-SPRINT VERIFY (verdict: GO_WITH_TECH_DEBT)
- 17/17 (FIX-recover 008-synthetic). build tsc=0. KPI+catalog+agents+providers 1726+268 pass.
- 🎯 C5: `deckent kpi` no-arg artık NON-EMPTY (Task1 latestSprintWithResults fallback ✓); task-based KPI gerçek (Completion 100%, No-Go 0%, Boundary 0%). cost/token=0 (forward-collection-captured sprint henüz yok; Task2 fix dist'te → sprint-333 finalize'ında gerçek-cost gelecek).
- 🔴→✅ REGRESYON (18 test, 5 dosya) ÇÖZÜLDÜ: production DOĞRU (bootstrapProviders direkt-çağrı + PATH-boş'ta test-ai register-oluyor); kök=test-mock staleness — 332-005 openai-compatible.ts'e `spawn` import-etti ama 4 F1-012 testinin `vi.mock('node:child_process')` SADECE spawnSync'i mock'luyordu → spawn-undefined → config-block import-fail. FIX: 4 dosyaya `spawn: vi.fn()` (50/50 PASS) + identity-count docs:stats regen. **DERS: refactor-eden-task affected test-mock'ları güncellemeli (full-affected-suite).**
- forward-collection (Task2) sprint-332-kendi-finalize'ında etkili olmadı (eski-dist); sprint-333'te gerçek-cost beklenecek.

## ═══ GECE ÖZETİ (session-limit @ ~04:50 Istanbul) ═══
**3 sprint tam-döngü (plan→run→build→adversarial-verify→fix→commit→push), hepsi origin/main'de:**
- **Sprint-330** (`eecb5c90`): KPI Faz-1 + F1-PCACHE, 28/28, GO_W/TECH_DEBT.
- **Sprint-331** (`46e7dce4`): 330-fix + Beta-next, 16/16, GO_W/TECH_DEBT.
- **Sprint-332** (`38185e8b`): 3 KPI-fix + F1-013 agentic-HTTP-worker + Beta, 17/17, GO_W/TECH_DEBT.

**KANITLANAN (disk+gerçek-binary):**
- 🟢 Token/cost-capture CANLI ($-değerler her .result'ta) — 1500-sprint gizemi + persistence-fix çözüldü.
- 🟢 KPI-engine çalışıyor: `deckent kpi` (no-arg) non-empty, 8 KPI, task-based gerçek (Completion/No-Go/Boundary).
- 🟢 F1-012 provider-de-hardcode Law-#2 PASS; F1-013 agentic-HTTP-worker (CLI-siz provider'lar worker koşar).
- 🟢 error-convention→DeckentError; opus-outputTokens-capture.

**ADVERSARIAL-VERIFY DEĞER:** 3 sprint'te gerçek-bug yakalandı + root-cause'landı + fix'lendi:
- 3 KPI proof-of-function bug (no-arg-resolution, forward-collection-non-fire, cost/token=0) → sprint-332'de fix.
- 18-test regresyon (test-mock staleness, production DOĞRU'ydu) → 4-dosya spawn-mock fix.

**AÇIK (sprint-333 için, DIRECTIVES draft-edili AMA DOĞRULANMAMIŞ — çalıştırmadan önce dep-rule+distinct-file verify):**
- C5-definitive: sprint-333 finalize (forward-collection-fix artık dist'te) → gerçek cost/token-$ gelecek → `kpi --sprint 333` doğrula.
- KPI-Faz2 surface TECH_DEBT completion (dashboard-card/api-trend/mcp-trend/telegram/cost-mcp).
- AS-2: F1-014 runtime-auth-non-leak, F1-005 Dockerfile-multiCLI.

### Opus 4.6→4.8 fix (4d16aef6) + KPI-surface verify
- Worker zaten 4.8 koşuyordu (buildArgs→registry apiId claude-opus-4-8); pricing-baseline Nisan-stale (4-6 key) → cost-etiketi 4-6 gösteriyordu. Rename → cost.pricingSource artık claude-opus-4-8. 2 stale-test (cost-config-loader/pricing-updater) güncellendi, tests/core 6036 green.
- KPI surfaces çalışıyor: kpi no-arg ✓, kpi --trend ✓ (series döndürüyor), Faz-2 (MCP/API/dashboard/telegram) task'ları DONE/TECH_DEBT. cost/token=0 + retro-scorecard-boş = forward-collection-sprint bekliyor (sprint-333).

### Sprint-333 (AS-2 + KPI-completion + Beta-onboarding, 12 task) — başlatıldı
- 001 F1-014 auth-non-leak, 002 F1-010 overflow, 003 KPI-threshold-advisory, 004 KPI cost/token LIVE-PROOF harness (C5-definitive!), 005 cost-gate-warn, 006 status-honesty, 007 SIEM-advisory, 008 DOC-PKG, 009 F1-IMG-2, 010 i18n-cleanup, 011 cookbook, 012 docs. Distinct-file + dep-bug-yok doğrulandı.

### Sprint-333 monitor (read-only adversarial monitor — CC, başladı 11:57)
**Scope baseline (all 12, distinct-file confirmed — NO collisions among tasks):**
- 001 `src/providers/subprocess.ts` + test · 002 `src/core/provider-overflow-gate.ts`,`src/orchestra/sprint-spawner.ts` + test · 003 `src/core/kpi/breach-advisor.ts`,`src/orchestra/sprint-retro-writer.ts` + test · 004 `tests/e2e/kpi-surface-smoke.test.ts` (test-only) · 005 `src/orchestra/sprint-finalizer.ts` + test · 006 `src/mcp/tools/status.ts` + test · 007 `src/core/siem-forwarder.ts` + test · 008 `README.md`,`package.json` + test · 009 `src/cli/commands/init.ts` + test · 010 `src/cli/helpers/messages.ts`,`doctor-checks.ts`,`evolve.ts`,`sync.ts` + test · 011 `docs/cookbook/getting-started-en.md` · 012 `docs/MASTER-PLAN.md`,`docs/audits/OVERNIGHT-2026-06-27-findings.md`.
- 333-010 = SOLE owner of `src/cli/helpers/messages.ts` ✓ (no other task lists it). 333-009 owns init.ts separately — no overlap.
- ⚠️ MONITOR-NOTE: 333-012 scope includes THIS findings file (`docs/audits/OVERNIGHT-2026-06-27-findings.md`) — same file I append to. Both docker-backend (flush at end). Potential append-collision/overwrite of my section if 012 lands last; flagged, not blocking.
- Pre-sprint baseline (NOT sprint output): untracked `tests/core/identity-config-faz3.test.ts`, `src/connectors/identity/providers/scim.ts` — exclude from boundary attribution.

**Poll 1 (~11:57):** progress 0/12. Status shows 4 active (001-004 "Writing code") but heartbeats EXECUTING for 001-008 (docker backend). All hb mtime fresh (11:56-11:57). No `src/`|`tests/` tracked changes on disk yet (docker workers flush at completion). No `.result` files yet → no NO_GO. Budget banner: OVER 781/600 lines (pre-existing advisory, not a sprint blocker). Health: GREEN.

**Poll 2 (~11:59):** progress 2/12. 8 workers EXECUTING (001-010 ramping). Only alert = benign "CLAUDE.md not updated in 70min" (doc-staleness advisory, not health). Two DONE landed, both disk-verified in-scope + REAL (not synthetic):
- **333-006 (status honesty) DONE** — filesChanged = `tests/mcp/status-failed-tasks.test.ts` ONLY (in scope). Honest note: `status.ts` failedTasks-fix (noGoCount via countNoGoTasks at lines 456/482) was ALREADY in place from prior sprint → no source edit needed; task added the proving test (4/4 pass). No boundary violation.
- **333-007 (SIEM warn-once) DONE** — filesChanged = `src/core/siem-forwarder.ts` + `tests/core/siem-forwarder-warn.test.ts` (both in scope). Surgical 3-part change, default-off preserved, 19/19 green incl. existing siem-forwarder.test.ts. No boundary violation.
- Boundary disk-truth: `git diff --stat src/ tests/` = only `siem-forwarder.ts` (17+/1-); untracked = the two in-scope test files + pre-sprint baseline. CLEAN. Heartbeats all fresh (<60s). Health: GREEN.

**Poll 3-4 (~12:01-12:02):** progress 3/12.
- **333-008 (DOC-PKG) DONE** — filesChanged=[] (honest no-op): README docs/ links already absolutized + test already created in sprint-332 (38185e8b); current README = 14 absolute refs, 0 relative; test passes 2ms early-exit; `npm pack --dry-run` confirms README in tarball. package.json (+1) was pre-existing at sprint start (in 333-008 scope regardless). In-scope.
- **FULL BOUNDARY ATTRIBUTION (9 tracked + untracked, ALL map to owning task — NO violation, NO collision):** doctor-checks.ts/evolve.ts/sync.ts/messages.ts→010 · siem-forwarder.ts→007 · sprint-finalizer.ts→005 · sprint-retro-writer.ts→003 · sprint-spawner.ts→002 · subprocess.ts→001 · breach-advisor.ts(+tests/core/kpi/)→003 · provider-overflow-gate.ts→002 · i18n-hardcode-cleanup.test→010 · siem-forwarder-warn.test→007 · status-failed-tasks.test→006. `messages.ts` touched ONLY by 010 (sole-owner CONFIRMED on disk). `identity-config-faz3.test.ts` = pre-sprint baseline.

**🔒 333-001 (F1-014) LAW #2 / SECURITY VERDICT — SOURCE: PASS.** `src/providers/subprocess.ts` diff replaces the full-`...process.env` spread (the documented leak at old :199-203) with a SCRUB+inject contract:
  1. base = `{...process.env}` (keeps PATH/HOME/LANG — non-secret);
  2. `delete childEnv[key]` for ALL of new const `CROSS_PROVIDER_CREDENTIAL_KEYS` = [ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, DEEPSEEK_API_KEY, DASHSCOPE_API_KEY, ZHIPU_API_KEY] (scrub every provider key);
  3. `Object.assign(childEnv, opts.env)` re-injects ONLY this worker's own credential (the per-provider map from `applyDeckSecretsToEnv`); then LANG/PYTHONIOENCODING forced.
  - Subscription **claude** worker → `opts.env` empty → child has **NO ANTHROPIC_API_KEY** → CLI session-auth (ADR-076 inverse-failure / Sprint-213 mass-NO_GO prevented). PASS.
  - **codex** worker → child carries ONLY OPENAI_API_KEY, zero ANTHROPIC/GOOGLE cross-leak. PASS. Base PATH/LANG preserved. Pure-JS map ops = cross-platform (Law #2). Honest `TODO(phase2)` notes config-driven (F1-012 arbitrary `apiKeyEnv`) providers not covered by the static set — debt flagged, not silent.
  - Mirrors the committed docker allowlist (`spawn-backend-docker.ts:820-847`); did NOT touch docker backend or auth-matrix.test (scope-respecting).
  - ⏳ TEST + .result pending flush (333-001 still EXECUTING) — will confirm `tests/providers/subprocess-auth-noleak.test.ts` assertions (codex→only-OPENAI, claude→no-ANTHROPIC, PATH/LANG kept) + GREEN run for the complete proof.
  - Health: GREEN.

**Poll 4-5 (~12:02-12:03):** progress 5/12.
- **✅ 333-004 (KPI cost/token LIVE-PROOF) — REAL-BINARY e2e CONFIRMED, NOT mock-only.** `tests/e2e/kpi-surface-smoke.test.ts` on disk: `spawn(... ENTRY=dist/cli/entry.js, 'serve','--port',port,'--no-terminal')` boots the BUILT binary; seeds `.brain/memory.db` via the **real `KpiStore.upsertResults`** (cost_per_sprint=1.23 over 2 sprint periods) — no mocks/in-memory substitute; **free port** via `createServer()`+`address().port` (not hardcoded); async readiness polling `GET /health` (no spawnSync); `afterEach` `srv.close()` in try/finally (Windows handle-guard); `describe.skipIf(DIST_ABSENT)` honest skip when unbuilt. Assertions: T1 `GET /`→200; **T2 `GET /api/kpi`→200, `kpis[]` non-empty, finds `cost_per_sprint`, `typeof value==='number'` AND `toBeCloseTo(1.23,2)`** (real numeric cost from real store reaches real API = the live-proof); T3 `GET /api/kpi/trend`→200 + `series[]`. Meets ADR-079 Tier-1 proof-of-function bar. (333-004 .result not yet flushed — still EXECUTING; test file on disk fully satisfies the spec.)
- **333-003 (KPI breach-advisory) DONE** — new `src/core/kpi/breach-advisor.ts` + 1 additive non-blocking try/catch call in `sprint-retro-writer.ts` (both in scope), `tests/core/kpi/breach-advisor.test.ts` 10/10 green, no regressions (write-retrospective/sprint-retro-writer/scorecard suites green). CONSUMES `result.status` verbatim (no re-compute), ADR-008 core→cli respected, and EXPLICITLY did NOT touch messages.ts ("Task 10 owns it") — boundary-respecting. In-scope.
- **Alerts now 4 — all benign/housekeeping:** CLAUDE.md-staleness (doc advisory) + 3× `stale_spawn_lock auto-removed (TTL>5min)` (Auditor auto-releasing docker spawn-churn locks — self-healing, NOT a collision/deadlock; tasks completing DONE confirm spawn pipeline healthy).
- **WATCH (not a violation):** 333-003's tsc note observed pre-existing TS6133/TS6192 unused-symbol warnings in `evolve.ts`(010) + `sprint-spawner.ts`(002) while those workers were mid-flight (files `M` in tree). Each worker runs its own tsc; will confirm clean when 002/010 land. Heartbeats: active workers fresh (<15s); DONE tasks' hb stopped (expected, not stalls). Health: GREEN.

**Poll ~12:03-12:04: progress 9/12 (8 results DONE; 001 source+test on disk, result still flushing).**
- **✅ 333-004 (KPI LIVE-PROOF) — RUN-PROVEN DONE.** result: "All 3 tests GREEN (2.76s, real-binary boot)"; T2 cost_per_sprint **value=1.23** (numeric — forward-collection fix verified end-to-end). Hermetic: mkdtempSync root+HOME, real `KpiStore.upsertResults` seed, DECKENT_API_TOKEN child-auth, /health async readiness, SIGTERM→SIGKILL teardown + timer.unref, skipIf dist-absent, no spawnSync, zero source touches. This is the definitive proof-of-function for the whole KPI surface. PASS.
- **✅ 333-010 (i18n sole-owner) DONE.** 49 hermetic i18n tests + messages.test 20/20 + doctor/sync suites all green; English output byte-equivalent (exact-match asserts). messages.ts touched ONLY by 010 (disk-confirmed across all polls). In-scope.
- **333-002 (overflow gate) DONE** — new `provider-overflow-gate.ts` + 1 additive flag-gated (default-off) wire in `sprint-spawner.ts`; `tsc --noEmit` exit 0 (resolves the earlier WATCH for sprint-spawner.ts); 11/11 + 7 regression suites green; honest TODO(phase2). In-scope.
- **333-005 (cost-gate WARN-only) DONE** — warn-only non-blocking `emitFinalizeSpendAdvisory` wired into `sprint-finalizer.ts`; HARD gate (enforce_spend_gate) NOT flipped (default-off preserved); 102/102 existing finalizer + 10/10 new green; explicit post-beta follow-up for hard enforcement. In-scope.
- **333-009 init.ts** now in boundary diff (9+/) — in scope ✓.

**🔒 333-001 (F1-014) FINAL SECURITY VERDICT — SOURCE + TEST: PASS (Law #2).** `tests/providers/subprocess-auth-noleak.test.ts` (9.2KB, on disk) is a hermetic injected-`spawnImpl` seam (NO real process — nogo honored). Setup seeds host `process.env` with all three keys (sk-ant-HOST/sk-oai-HOST/goog-HOST). 4 assertions captured from the spawn `opts.env`:
  - `it('codex worker child env carries ONLY OPENAI_API_KEY — no ANTHROPIC/GOOGLE leak')` → `env.OPENAI_API_KEY==='sk-oai-OWN'`, `env.ANTHROPIC_API_KEY` **toBeUndefined**, `env.GOOGLE_API_KEY` **toBeUndefined** (lines 138-141). Cross-provider leak BLOCKED.
  - `it('claude SUBSCRIPTION worker (no opts.env) gets NO ANTHROPIC_API_KEY (ADR-076)')` → `env.ANTHROPIC_API_KEY` **toBeUndefined** (line 150), + OPENAI/GOOGLE undefined. **The core Law-#2/ADR-076 assertion — subscription claude carries NO key → CLI session-auth, Sprint-213 inverse-failure prevented.**
  - `it('preserves base non-secret host vars (PATH/LANG/probe) byte-for-byte')` → `env.PATH===process.env.PATH`, LANG/PYTHONIOENCODING/non-secret-probe kept (lines 160-163).
  - `it('api claude worker (opts.env carries its own key) gets ANTHROPIC_API_KEY, no foreign keys')` → own key present, foreign undefined (lines 172-173).
  - VERDICT: **PASS** — spawn-time worker env gets ONLY its own provider credential; no cross-provider key leak; subscription Claude gets NO ANTHROPIC_API_KEY. (.result pending flush; source+test on disk are complete & correct.)

**BOUNDARY (poll-9, full attribution): NO violation, NO collision.** 10 tracked + 11 untracked, every file maps to its single owning task (init.ts→009, subprocess.ts→001, overflow-gate+test→002, finalizer+cost-gate-advisory.test→005, breach-advisor+tests/core/kpi→003, siem→007, retro-writer→003, status-failed-tasks.test→006, doctor/evolve/sync/messages/i18n.test→010, e2e/kpi-surface-smoke.test→004). `identity-config-faz3.test.ts`=pre-sprint baseline. No file shared by two tasks. Status CI banner: "tsc OK". 8/8 landed results = DONE, 0 NO_GO. Health: GREEN.

## ═══ 🔴 P0 BULGU: token/cost HEURISTIC, gerçek-API-ölçümü DEĞİL (user-flagged) ═══
**Cevap: resulta yazılan token/cost %100 DOĞRU DEĞİL — Anthropic'in tuttuğu gerçek-usage ile TUTARSIZ.**

### Survey (61 result, sprint-330/331/332)
- cost=0/undefined: 2 (330-021/022, NO_GO-timeout, in/out=0 → beklenen).
- output=null: 12 (opus VE sonnet — 331-008/332-010/332-014 sonnet; opus-özel DEĞİL).
- cacheCreationTokens=undefined: **61/61** (hiç yakalanmıyor).
- tokenUsage.source=undefined: **61/61** (normalizeUsage'dan geçmiyor).

### Kök-neden (KESİN)
- token-counter `.tasks/task-{id}.log` okuyor (token-counter.ts:208) → log **65-byte/boş** (`--output-format json` envelope düşmüyor) → `estimateTokenUsage` HEURISTIC'e düşüyor (token-counter.ts:401-403).
- HEURISTIC formüller (yapısal-kanıt, 61/61 tam-eşleşir): `input ≈ estimatedTokens`, `output = linesAdded × 15`, `cacheRead = input × 4`, `cacheCreation = 0/yok`.
- usageEmitArgs `--output-format json` spawn'a uygulanıyor (subprocess.ts:105/222) AMA envelope worker-log'a yazılmıyor → extract edilemiyor.

### SOMUT KARŞILAŞTIRMA (gerçek vs heuristic)
- GERÇEK worker-session (~/.claude/projects/.../9e1b8305, turns=2): in=18644 out=2314 cacheRead=28324 **cacheCreate=47514**.
- HEURISTIC result (332-001): in=8354 out=825 cacheRead=33416(=in×4) **cacheCreate=0**.
- → input 2.2× / output 2.8× sapma + **cacheCreation (limit-dominant maliyet) TAMAMEN kaçırılmış** → cost ciddi-yanlış.

### Anthropic gerçek-usage NEREDE
- `~/.claude/projects/-home-alperen-deckent-dev/*.jsonl` (session-store) — her turn'de `message.usage{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}`. tokscale-yaklaşımı bunu okur.

### FIX (sprint-334 P0)
1. Worker-session'ı task'a eşle (spawn'da session_id yakala — `--output-format json` envelope'unda session_id var; VEYA cwd+timestamp korelasyon).
2. session-store jsonl'den gerçek-usage TOPLA (4 alan, cacheCreation dahil) → heuristic'i bununla DEĞİŞTİR.
3. ALT: worker stdout'undaki `--output-format json` envelope'unu log'a yaz → extractUsage zaten parse ediyor.
4. Doğrulama: result.tokenUsage == session-store-toplamı (±0), source='session-store', cacheCreation>0.

---

## Sprint-333 — Docs Task (333-012) Verify-First Findings + Status (~09:09 UTC)

Disk-verify by docs task 333-012 before writing §10 rows. Ground truth only; no claims beyond confirmed .result files.

### Disk-verified state at doc-write time

**Sprint-332 committed truth (38185e8b, 17/17, 0 NO_GO):** All 16 base tasks + 1 FIX-recover landed. Stale §10 row said "8 DONE / 1 NO_GO / 7 not-executed" — written mid-sprint before FIX completed. All files disk-verified: `src/agents/http-agentic-worker.ts`, `src/dashboard/src/components/KpiCard.tsx`, `KpiTrendPage.tsx`, `src/connectors/kpi-sprint-summary.ts`, `src/mcp/tools/cost.ts`, `src/cli/commands/image.ts`, `tests/build/readme-package-links.test.ts`, `spawn-backend-docker.ts` (F1-005) — all committed, all present. §10 row corrected retrospectively by task 333-012.

**Sprint-333 result files confirmed (selfAssessment=DONE, disk-read):**
- 333-002 F1-010 overflow gate (flag-gated, default-off; 14/14 tests) ✅
- 333-003 KPI threshold-breach advisory (12/12 tests) ✅
- 333-004 KPI Tier-1 e2e smoke + cost/token live-proof harness (3/3 real-binary tests, 2.76s) ✅
- 333-005 cost-gate warn-only finalize advisory (102+10 tests) ✅
- 333-006 status failedTasks honesty (test-only, src already fixed; 4/4) ✅
- 333-007 SIEM warn-once (19/19 tests) ✅
- 333-008 DOC-PKG-1 close (honest no-op, sprint-332 already complete) ✅
- 333-010 i18n + B-ZOMBIE centralization (49 hermetic i18n tests) ✅

**Still executing (hb fresh, no result yet):** 333-001 (F1-014), 333-009 (F1-IMG-2 init), 333-011 (EN cookbook), 333-012 (this task).

### F1-014 Security Verdict (333-001 — source+test disk-verified, result pending)
`CROSS_PROVIDER_CREDENTIAL_KEYS` scrub replaces full `...process.env` spread in `subprocess.ts`. Key assertions: codex worker → OPENAI_API_KEY only (ANTHROPIC/GOOGLE absent); subscription claude → NO ANTHROPIC_API_KEY (CLI session-auth, ADR-076); PATH/LANG preserved. 4 hermetic injected-spawnImpl tests on disk; .result pending flush. Source verdict: **LAW #2 PASS**.

### Cost/Token Live-Proof Status (C5-definitive)
- **Harness exists and is real-binary (333-004 DONE):** `tests/e2e/kpi-surface-smoke.test.ts` boots `dist/cli/entry.js serve`, seeds real KpiStore.upsertResults, asserts `GET /api/kpi` returns `value≈1.23` (numeric, round-trip through real API). Proof-of-function bar met.
- **Actual cost/token $ in KPI results:** will populate from sprint-333 finalize. The forward-collection fix (332-002 `buildUsageTotals` real-cost-first) has been in dist since sprint-332 commit. Sprint-333 finalize will be first sprint where `deckent kpi --sprint 333` shows real `cost_per_sprint`/`token_per_task` (non-zero from .result data).
- **Token capture gap (P0 from survey above):** cacheCreation still not captured (61/61 absent); fix design documented above in this file (session-store jsonl approach, sprint-334 P0).

### Genuinely open after sprint-333 (no silent debt)
- Telegram KPI bot dispatch: `kpi-sprint-summary.ts` committed sprint-332; connector-bootstrap.ts wiring not implemented (blocked by social-identity dirty-tree)
- avg-tool-call + output/accepted-PR KPIs: phase2, requires agentic-worker instrumentation (off-limits to workers)
- F1-010 multi-worker/mid-flight overflow: phase2 (TODO in code)
- R7 SSE: not-surgical, deferred
- cost-gate HARD enforcement: post-beta only
- KPI Faz-3 multi-tenant RBAC + custom-KPI + SLO/error-budget: post-beta
- Token capture accuracy (cacheCreation, source='session-store'): sprint-334 P0

### Sprint-334 (P0 TOKEN-REAL-CAPTURE + AS-2/KPI/Beta, 11 task) — başlatıldı
- Task1 P0: token-counter heuristic→session-store gerçek-usage (provider-agnostik seam, cacheCreation dahil, source='session-store', faithful tmpdir-fixture test).
- Track B: F1-014-phase2 dynamic-scrub, P0-C orphan-terminate (sprint-333 27dk-linger), A20 worker-question, F1-013 scope-event-parity.
- Track C: Telegram-KPI-dispatch (connector-bootstrap'a dokunmadan), breach-advisory-CLI.
- Track D: cookbook, ADR-093. Distinct-file + dep-bug-yok doğrulandı. cost-calculator zaten cacheCreation×1.25 → Task1 cost'u düzeltir.

### Sprint-334 monitor
> READ-ONLY independent monitor (no build/edit/kill). Disk-verify + git diff --stat ground truth. Append-only.

**Poll 0 (12:52) — baseline:** status 0/11 done, 6 active (334-001..006 Writing code; 007 queued, 008 queued via worker .sh; 009/010/011 queued). All 8 hb files fresh (mtime within ~13s). No NO_GO, no alerts. No sprint-334 scope files in git diff yet (workers still writing). Pre-existing dirty tree (social-identity Faz-3 + prior cookbook/bot-agentic work) noted as baseline — NOT attributed to sprint-334. Scope map captured for boundary checks (334-006 must NOT touch connector-bootstrap.ts; 334-001 → token-counter.ts + session-usage-store.ts + task-types.ts).

**Poll 3 (12:56) — 2/11 DONE:** 334-004 (ipc-registry) DONE, 334-007 (kpi.ts breach-surface) DONE. All landed files in-scope (kpi.ts, ipc-registry.ts, kpi-breach-surface.test.ts, ipc-worker-question-action.test.ts). No boundary/stall/collision. connector-bootstrap.ts confirmed CLEAN vs HEAD (not in baseline) → a 334-006 touch WOULD be flagged.

**334-001 TOKEN-REAL-CAPTURE — SOURCE verdict (src disk-verified; tests pending):**
- (a) real session-store SUM incl cacheCreation: **PASS** — `session-usage-store.ts:99-142 sumSessionUsage` sums input/output/cache_read/`cache_creation_input_tokens` (l135) across all turns; tolerant (corrupt lines skipped, never throws).
- (b) source='session-store': **PASS** — `session-usage-store.ts:227`.
- (c) heuristic last-resort + ordering: **PASS** — `token-counter.ts:290-291` calls `readNativeUsage` FIRST and returns on hit; `:294` envelope→`source:'envelope'`; `:296` fallback heuristic→`source:'estimate'` (honest self-label).
- (e) provider-agnostic seam: **PASS** — `session-usage-store.ts:207-212` codex/gemini return `null` with TODO(phase2), Law #2 seam; returns null when no real source (l216/l219). sessionRoot injectable (l214 `query.sessionRoot ?? defaultClaudeSessionRoot`).
- TokenUsage type: **PASS additive-optional** — `task-types.ts:421 cacheCreationTokens?`, `:431 source?` (existing shape preserved).
- (d) TEST HERMETICITY: **PASS** (tests landed poll-4) — `session-usage-store.test.ts` + `token-counter-real-usage.test.ts` both `mkdtempSync(tmpdir())` + inject `sessionRoot`; only `~/.claude` mentions are comments ("NEVER read"); no homedir/os.homedir/process.cwd in tests. SUM faithfulness: session-store test l89-92 assert each of 4 fields == dynamically-summed fixture (real proven values 18644/2314/28324/47514), l93 cacheCreation>0, l94 source='session-store', l98 cacheRead≠input×4 (distinguishes heuristic RED), l163 codex→null. token-counter test covers all 3 tiers: l96 session-store / l110 estimate (l120-121 RED preserved: cacheRead===input×4, cacheCreation undefined) / l144 envelope.
- **334-001 OVERALL: PASS (a)(b)(c)(d)(e)** — src+tests disk-verified faithful & hermetic. .result not yet flushed (worker running suite); code is complete and correct. No off-limits file (cost-calculator/collection/sprint-finalizer/claude.ts) touched.

**Poll 4 (12:57) — 3/11 DONE** (004/007/008). 334-001 tests landed; 334-002 (cross-provider-keys.ts/subprocess.ts/spawn-backend-docker.ts) + 334-005 (http-agentic-worker.ts + scope-event test) landed, all in-scope.
- **BOUNDARY CLARIFICATION:** `src/providers/subprocess.ts` (30/37 changed) is **334-002's legitimate scope** (F1-014 scrub), NOT a violation — and 334-002 is its sole writer (no collision). It's in 334-001's do-NOT-touch list but 334-001 correctly did not write it.
- Off-limits sweep CLEAN: connector-bootstrap.ts / connector-notify-adapter.ts / kpi-sprint-summary.ts / sprint-pid-manager.ts / sprint-finalizer.ts / cost-calculator.ts / collection.ts / claude.ts all untouched vs HEAD.
- Stall note: 334-004 hb 113s, 334-007 hb 145s — both ALREADY DONE (result present); stale hb on a completed worker is benign, not a stall.
- finalize.ts (334-003) + kpi-summary-dispatch.ts (334-006) NOT yet landed; workers running.

**Poll 5 (12:58) — 4/11 DONE** (004/005/007/008). STALL flags on 334-004 (192s) + 334-007 (224s) are BENIGN — both already DONE (completed-worker stale hb, not a real stall).
**334-006 Telegram KPI dispatch — verdict PASS:** connector-bootstrap.ts / connector-notify-adapter.ts / kpi-sprint-summary.ts all UNTOUCHED vs HEAD (kpi-summary-dispatch.ts only READ-imports the exported `buildConnectorTargets`/`ConnectorBootstrapDeps` — not an edit). `buildSprintKpiSummaryFn(root,lang)` (l51) → `(sprintId)=>Promise<string|null>` opens `KpiService(<root>/.brain/memory.db, tenant 'default')` (l56), `listSprintViews` (l57), formats via shared `buildKpiSprintSummary` (l62, reused), returns `null` on empty (l61/66), ALWAYS `service.close()` in `finally` (l67-71, Windows handle-guard). Wired at the 3 clean caller-sites: `start.ts:297`, `autonomous.ts:682`, `sprint-runner-entry.ts:233` — each passes `{ kpiSummaryFn: buildSprintKpiSummaryFn(...) }` via new `buildConnectorAdapterWithKpiSummary` wrapper; default no-notify path preserved (`targets.length===0 → return null`).

**Poll 6-7 (12:59-13:01) — 7→8/11 DONE** (001/002/004/005/007/008/009/010). 334-001 now genuinely DONE (real result, 5 in-scope files, notes match source verification). 334-009 wrote OVERNIGHT-2026-06-28-findings.md (separate file — no conflict with this 06-27 file). No NO_GO; all STALL flags on already-DONE workers (benign).

**334-003 orphan-terminate (P0-C) — verdict PASS:** `finalize.ts` (31/1) adds a NORMAL-path block `if (!opts.force)` (l245) that `readPid` (l247) then SIGTERMs via the EXISTING delegated `terminateOwnedSprintProcess` (l249, not re-implemented) — guarded by the **self-pid check** `recordedPid !== null && recordedPid !== process.pid` (l248, never suicides when finalize runs in the coordinator), mirrors the --force advisory print (l250-254: killed / skipped-reused), then `clearPid` (l255). Correct ORDERING (runs BEFORE finalizeSprint's persistFinalSprintState→clearPid, comment l235-236). TODO(phase2) for the deeper 27-min-linger root-cause noted (l242-244). Off-limits (sprint-pid-manager / sprint-finalizer / sprint-controller) UNTOUCHED. Test (finalize-orphan-normal.test.ts) + .result still pending (334-003 worker running, hb fresh).

**ALL 3 FOCUS TASKS PASS on disk** (334-001 token-capture, 334-003 orphan-terminate, 334-006 Telegram-KPI). Health GREEN.

**Poll 8-9 (13:02-13:04) — 10/11 DONE** (001/002/004/005/006/007/008/009/010/011 all selfAssessment=DONE). Only 334-003 still finishing (writing result; src+test already verified PASS). 334-006 + 334-011 landed DONE.
- **334-003 test hermeticity PASS:** `finalize-orphan-normal.test.ts` per-test `mkdtempSync(tmpdir())` (l153), spies/hijacks `process.kill` so NO real process is signalled (l19-20/157 — avoids the nogo "real process.kill in test"); covers all 3 paths: external-alive pid → SIGTERM (l174 asserts pid≠process.pid), in-process `recorded===process.pid` → NO self-signal (l186-188), dead pid → no signal (l200).
- **Alerts: 4× `stale_spawn_lock` auto-removal** (TTL>5min housekeeping) — BENIGN, not failures. No boundary violation, no collision, no real stall (every >150s hb belongs to an already-DONE worker). Health GREEN.
- Boundary final sweep CLEAN: every changed src/test file maps to its owning task's scope.filesWrite; connector-bootstrap.ts / connector-notify-adapter.ts / kpi-sprint-summary.ts / cost-calculator.ts / collection.ts / claude.ts / sprint-pid-manager.ts / sprint-finalizer.ts / sprint-controller.ts all UNTOUCHED. subprocess.ts = 334-002's legitimate scope (sole writer, no collision).

**FINAL (≈13:06) — SPRINT-334 COMPLETE: 11/11 DONE (100%), ZERO NO_GO, zero GO_WITH_TECH_DEBT.** All eleven .result files selfAssessment=DONE (001-011). 334-003 closed DONE last (changed exactly [finalize.ts, finalize-orphan-normal.test.ts], in-scope). Final off-limits sweep: connector-bootstrap.ts / connector-notify-adapter.ts / kpi-sprint-summary.ts / sprint-pid-manager.ts / sprint-finalizer.ts / sprint-controller.ts / cost-calculator.ts / collection.ts / claude.ts ALL untouched vs HEAD. No boundary violation, no collision, no real stall (all >150s heartbeats belonged to already-DONE workers), only 4 benign stale_spawn_lock auto-removal alerts. **Monitor verdict: Health GREEN end-to-end.** All 3 P0 focus tasks independently disk-verified PASS (token-real-capture incl cacheCreation + source tags + hermetic injected-sessionRoot tests; orphan-terminate normal-path SIGTERM with self-pid guard + spied-kill hermetic test; Telegram-KPI dispatch via new module + 3 clean caller-sites, connector-bootstrap untouched). NOTE: worker self-assessments + tsc/test pass are not host-re-run by this read-only monitor; src/test correctness was verified by direct disk read (file:line cited above). Post-sprint host-side build + Tier-1 Smoke (finalize orphan-termination; `start --help`) remain Alperen's gate.
