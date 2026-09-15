# REFACTOR-PROGRAM-001 — Enterprise modülerleşme, test rasyonalizasyonu ve repo temizliği (MASTER REPO programı)

OUTCOME_ID: REFACTOR-PROGRAM-001
DOGFOOD_MODE: OFF
BASE_SHA: c02b71819

**Owner talimatı (Alperen, 2026-09-15):** "Refaktör olmadan doğru ilerleyiş imkansız; AI'lar uzun dosyada
bağlamı kaybediyor. 24k satırlık spawn-backend kabul edilebilir değil. Enterprise seviye şart, bu düzensizlik
kabul edilmiyor. Her şeye test istemiyorum; testler düzenlenecek. Arşiv istemiyoruz, tamamen sileceğiz.
Sunumdan önce refaktör ve gerçekten hızlı, işlevsel, çalışan bir deckent." 7–8 haftalık süre kabul edildi.
Silinme tetiği: 13 MASTER satırı DONE + `lint-module-size` 0 ihlal + test tavanı ≤8k kanıtı; doküman o zaman silinir.

Bu doküman **tasarım spec'idir** (solution-architect kimliğiyle). İş-takip SSOT'u `docs/MASTER-PLAN.md`;
satır taslağı §9'da. Kod, taşıma veya silme bu spec owner onayı almadan başlamaz.

## 1. Karar kaydı (owner, 2026-09-15)

| # | Karar | Seçim |
|---|---|---|
| K1 | Dosya boyutu | **1500 sert tavan** (mevcut dosyalar, ratchet: yalnız küçülür) + **800 tavan** (bölünmeden çıkan ve yeni yazılan her dosya). Veri/katalog ve yalnız-tip dosyalar gerekçeli allowlist. |
| K2 | Yürütme modu | `DOGFOOD_MODE=OFF` (control block `DECISION_REF=owner-live-2026-09-15-refactor-cutover-dogfood-off`). Astra session cutover verene kadar beklenir. |
| K3 | Öncelik | Refaktör önce; MASTER işleri kümelere yedirilir. |
| K4 | Sunum | 20. gün sabit: çalışan ürün + o güne kadar inen kümeler; kademeli kapılar (G1 kesin, G2/G3 kanıtla). "Bitmiş refaktör" iddiası yok. |
| K5 | Temizlik | Manifest-güdümlü, sınıf-onaylı, **birlikte tek tek**; hedef silmek, arşiv yok (`.git` history korunur, yeniden yazılmaz). |
| K6 | İniş kadansı | Günlük iniş + gerçek-binary smoke kapısı; kırmızı = iniş yok. |
| K7 | Ajan filosu | 2 lane: **Astra** (Codex) + **Fable**; subprocess worker/subagent kullanımı zorunlu. |
| K8 | Kapsam | src + tests + scripts (tam). |
| K9 | Versiyonlama | Semver; refaktör 0.101.0; sunum günü `v0.101.0-demo` tag + release branch; her iniş CHANGELOG satırı (lint). |
| K10 | MASTER kaydı | REPO programı altında 1 üst + 12 küme satırı; her küme `absorbs` ile yedirilen mevcut satırları listeler. |
| K11 | Topoloji | **Domain paketleri, aşamalı**: kernel / runtime / orchestration / surfaces / observability (+ providers). |
| K12 | Test politikası | Kontrat-öncelikli; **tavan ~8k test** (bugün 40.857), test dosyası ≤800 satır, full suite hedef ≤6 dk. |
| K13 | ADR çelişkisi | ADR-D-006 §2 amendment onaylandı (cohesion sınır kuralı kalır, boyut mekanik tetik kapısı olur). |
| K14 | P9 | `.git` 513 MB küçülmez; kabul. |

## 2. Ölçülen envanter (2026-09-15, salt-okunur)

| Ölçüm | Değer |
|---|---|
| Birinci-taraf kaynak (src+scripts) | 1.657 dosya / 666.619 satır |
| >1500 satır | 70 dosya / 140.286 satır taşınmalı (44 mekanik 1500–3k, 26 tasarımlı >3k) |
| >800 satır | 151 dosya / 204.074 satır |
| Çarpışma kümesi (exact-docker/spawn/sprint/effect/custody/lock) | 23 dosya / 77.411 satır |
| En büyükler | spawn-backend-docker 24.792 · task-attempt-custody-store 13.906 · messages 10.419 · file-lock 8.563 · sprint-finalizer 6.260 · sprint-phases 5.263 |
| src dizinleri (satır) | core 203k · orchestra 173k · cli 105k · dashboard 16k · agent 13k · api 12k · connectors 10k · mcp 10k · providers 10k · agents 8k · nervous 8k · desktop 8k · monitor 4k · training 2k · intelligence 2k · extensions 0.6k · mcp-client 0.4k · sdk 0.4k |
| Testler | 3.117 dosya / ~40.857 `it/test` / 77 skip-todo / full suite ~21 dk; >1500 satır 31 dosya |
| Scripts >1500 | 10 dosya (lint-test-hermeticity 9.0k, clean 8.5k, lint-master-plan 4.7k, …) |
| Docs | archive 6.276 dosya/151 MB · execution/evidence 1.162/23 MB · governance 202 · adr 52 · tr/en 46+46 |
| Kök gevşek | a2aplan.md, MCPV2.md, communication.md, iletisim.md, GEMINI.md, durum-raporu.md, CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md, proof/, follow-up-works/, deckent-hub/, design/, alp-discipline/, fallback-rules/, .test/ |
| Worktree / branch | 45 worktree (20 prunable), 65 local branch (R45 K9 envanteri) |
| spawn-backend-docker iç yapısı | 109 import · 224 top-level fonksiyon · 106 tip · 219 export (36 üretim, 114 yalnız-test, 68 kullanılmayan) · sınıf 13,6k satır/181 üye/dışarıdan 16 public · `spawn-backend.ts` ile çevrimsel import · ~500 satır gömülü container-içi JS/sh kaynağı |

## 3. Hedef mimari

### 3.1 Paketler ve bağımlılık yönü

```
src/
  kernel/          types · config · errors · i18n (messages→buraya, D004-W9) · model/skill/agent registry · event contracts · validators
  runtime/         spawn-backend (D004-W8) · exact-docker/{container,custody,landing,recovery,sources} · custody-store · effects · lock · worker (agents/) · provider-invocation
  orchestration/   planner · sprint/{controller,phases,finalizer,spawner,lifecycle} · evaluation · routing · scheduler · autonomous · agent (native session) · intelligence · learning (training)
  surfaces/        cli · api · mcp · mcp-client · sdk · connectors · desktop-bridge · extensions
  observability/   monitor · nervous · read-models · dashboard-projections
  providers/       (yerinde kalır) provider adapterları + docker-invocation adapterları
  dashboard/, desktop/  (ayrı toolchain'li uygulama paketleri; fiziksel yer değişmez, lint'te "surfaces ailesi")
```

Kural (lint ile fail-closed, ADR-D-004 amendment): `kernel ← runtime ← orchestration ← surfaces`;
`observability` yalnız kernel/runtime/orchestration **read-model** export'larını okur, hiçbiri observability'yi
import etmez; `providers` yalnız runtime tarafından import edilir (surfaces için login/auth komutları kayıtlı
istisna). Paket dışından `internal/` import'u yasak; paket public API'si yalnız `index.ts`.

### 3.2 Paket sözleşmesi (her paket için)

- `index.ts` public API (barrel yalnız burada; iç barrel yok), `internal/` özel.
- Dosya: mevcut ≤1500, yeni ≤800; fonksiyon/metot ≤150 satır (uyarı), sınıf ≤600 satır (uyarı).
- Mekanizma modülleri string-free (i18n-first); user-facing metin `kernel/i18n` kataloğundan.
- Paket README yok; sözleşme `docs/en|tr/reference/architecture.md` tek sayfada (managed-doc üretir).

### 3.3 Entry-point dondurma listesi (dist yolu = çalışma-zamanı sözleşmesi; `rootDir=src`)

`dist/cli/entry.js` (bin, 22 referans) · `dist/mcp/server.js` (bin) · `dist/index.js` · `dist/sdk/index.js` (exports) ·
`dist/core/exec-authority-native.js` (Dockerfile.worker COPY + 6 container-içi referans) · `dist/orchestra/sprint-phases.js` ·
`dist/agents/http-agentic-worker.js` · `dist/agents/agentic-worker-entry.js` · `dist/agents/landing-proposal-entry.js` ·
`dist/providers/{openrouter,openai-compatible,ollama}.js` · `dist/core/skill-pool.js` · `dist/core/pricing-data-baseline.js`.
Bu 14 yol taşınmaz; taşınırsa eski yolda 1-satır shim kalır ve Dockerfile/test referansı aynı commit'te güncellenir.

### 3.4 spawn-backend-docker hedef bölünmesi (24.792 → ≤16 modül, her biri ≤800)

`runtime/exact-docker/`: `backend.ts` (SpawnBackend fasadı, 17 metot, composition root) · `container/{runtime,logs,retry,monitor}.ts` ·
`custody/{dispatch,mount,accept,release,monitor}.ts` · `landing/{commit,release,rehydrate,compensate}.ts` · `recovery/{reconcile-pending,retain}.ts` ·
`result/{settlement,attribution,scope-manifest}.ts` · `cross-verify-runtime.ts` · `preflight.ts` · `errors.ts` · `types.ts` · `constants.ts` ·
`sources/*.js|*.sh` (pid1, probe, sealer, runner: gerçek dosya, içerik-hash pinli, build kopyalar).
Provider invocation/auth izolasyonu → `providers/<p>/docker-invocation.ts`. Çevrim `spawn-backend-types.ts` ile kesilir.
Recovery açık maddeleri (R45 OPEN-ITEMS: DRAIN-RESUME, TERM-ONLY, REPLAY-PROOF, ABC-LIVE + related) bu paketin tasarım girdisidir;
davranış düzeltmesi **ayrı commit**, taşıma ile karışmaz.

## 4. Ön-koşullar (gözden kaçmaması gerekenler)

| # | Bulgu | Zorunlu önlem |
|---|---|---|
| P1 | Yol-anahtarlı baseline'lar: operation-ingress 5.208, script-registry 156, spawnsync 128, error-handling 43 giriş; 8 lint script'i literal `src/` yolu; vitest coverage exclude yol bazlı | `scripts/refactor/move-module.mjs`: git mv + import rewrite (src, tests, desktop) + baseline yol rewrite + eski yolda shim, tek atomik adım; kuru-çalıştırma ve `--color-moved` kanıtı |
| P2 | Entry-point yolları (§3.3) | Freeze listesi lint'te; ihlal = iniş yok |
| P3 | `lint-layer-shims` fail-closed tam-graf kapısı; ADR-D-004 katman adları | ADR-D-004 amendment (paket adları + yön); D004-W8/W9, ORCH-W1, API-W1 yedirilir |
| P4 | `src/desktop` 9 dosyada kök src import; ayrı tsconfig | Kapıda desktop + dashboard tsc |
| P5 | `managed-docs/content-generators.ts` src yollarından CLAUDE.md mimari bölümü üretir; `docs:ref:check`, `docs:stats:check` | Her küme inişinde regen + check |
| P6 | 40.9k test / 21 dk; `verify:affected` mevcut | Günlük: affected + smoke; gece: full |
| P7 | İki belgeli çevrim (spawn-backend↔docker, sprint-phases↔controller, TDZ-safe) | Tip dosyasıyla kes veya TDZ-safe kanıt testi |
| P8 | Recovery zincirinin 2 untracked src + 3 untracked test dosyası | Cutover checkpoint commit'i bunları içerir |
| P9 | `.git` 513 MB; history yeniden yazılmaz | Kabul; GIT-MAINT satırları ayrı |
| P10 | R45: cutover landing K0 (capsule alanları, Cursor projection parity, decision anchor) + K1 (CLI/MCP description parity lint) kırmızı; Astra düzeltme yetkisi almamış | Owner yetkisi: Satır 0 bu iki kırmızıyı düzeltme iznini içerir |
| P11 | `lint-operating-policy` bugün 2 eski capsule'de kırmızı (RECOVERY-DO-DOGFOOD-001*.md alanları) | Satır 0 içinde onarılır veya capsule silinir (temizlik) |
| P12 | Ürün-repo senkronu (ADR-D-008, `sync-to-product.mjs`) | Küme inişinden sonra sync doğrulaması |
| P13 | Windows/macOS/WSL: taşıma platform-nötr, Docker COPY yolları ve cross-platform e2e CI advisory | Freeze listesi + cross-platform-e2e raporu (REMOTE_ADVISORY) |

## 5. Kapılar

- **`scripts/lint-module-size.mjs`** (ratchet): baseline `scripts/module-size-baseline.json` (dosya→satır); mevcut dosya baseline'ı aşamaz ve tavan 1500; baseline'da olmayan dosya ≤800; allowlist `{path, reason, owner, expiry}`; fonksiyon >150 / sınıf >600 uyarı. `lint:gates` zincirine girer.
- **Günlük iniş kapısı (~15 dk):** `tsc --noEmit` (kök+dashboard+desktop) · lint-module-size · `lint:gates` · `lint:i18n` · `verify:affected` · smoke (`repl-smoke-verify`, `provider-free-smoke`, `tests/e2e/cli-smoke.e2e`; docker kümesi değiştiyse `docker-backend.test` + `docker-restart-reconcile`) · `build:all` · gerçek binary `deckent doctor` + `deckent status` · CHANGELOG satırı (lint) · managed-doc regen. Kırmızı = iniş yok.
- **Gece:** full suite; 5 landing'de bir kuralı korunur.
- **Küme kapanışı:** farklı-provider xverify üç mühür (tasarım / uygulama / sonuç); Astra↔Fable karşılıklı (same-provider yasak).
- **Yalnız-taşıma kanıtı:** `git diff --color-moved=dimmed-zebra` + tsc; davranış değişikliği ayrı commit.
- **Sunum kapıları:** G1 (gün 14) Terminal + `deckent do` tek görev → worker → accepted result → durable settlement; G2 (gün 16) `deckent start` çoklu-worker + dashboard; G3 (gün 17) Goal→Mission. Geçmeyen sunumda yok.

## 6. Test politikası (40.857 → ≤8.000)

Kalır: paket public-API kontrat testleri (paket başına 1–3 dosya), e2e/smoke/gerçek-binary, cross-platform, güvenlik/authority/custody
invariant testleri, ADR-gate testleri. Gider: internal fonksiyon testleri, kopya/near-duplicate, fixture-içi yeniden-implementasyon,
implementasyon-snapshot'ları, tek satır test eden dosyalar, 77 skip/todo. Her küme için `tests/<paket>/DISPOSITION.json`
(keep/merge/delete + gerekçe) owner onayına gelir; silme G3. Test dosyası ≤800; `tests/` ağacı paket ağacını yansıtır.

## 7. Temizlik (birlikte, tek tek, silme)

Sınıflar: (1) kök gevşek dosya/dizinler (§2), (2) `follow-up-works/`, `proof/`, `.test/`, (3) `docs/execution/evidence` 1.162 dosya (yalnız
MASTER satır-kanıtı olarak referanslanan digest'ler kalır), (4) `docs/archive` 6.276 dosya, (5) `docs/execution/active` biten capsule'ler,
(6) 20 prunable worktree + kalan worktree/branch (R45 K9 envanteri; OPS-BRANCH-001), (7) `.deckent/recovery-snapshots`, (8) untracked cpuprofile/baseline.
Her sınıf: exact manifest + hash → owner "sil" → tek commit → link-lint yeşil. Arşiv yok.

## 8. İş planı (2 lane: A = Astra, F = Fable; ikisi de subprocess worker kullanır)

| Sıra | Satır (REPO) | Kapsam | Yedirilen MASTER satırları | Lane | Hafta/Gün | Çıkış kanıtı |
|---|---|---|---|---|---|---|
| 0 | REFACTOR-CUTOVER-001 | Astra cutover: K0/K1 kırmızı düzeltme yetkisi, checkpoint commit (5 untracked dahil), policy lint yeşil, 3178 BLOCKED gerekçeli | 3178 (BLOCKED), POLICY-GATE, LINT-PARITY | A + Owner | H1 g1–2 | commit hash, `lint-operating-policy` 0, tsc 0 |
| 1 | REFACTOR-GATE-001 | lint-module-size + baseline, ADR-D-006/D-004/G-014 amendment, entry freeze, `move-module` aracı, CHANGELOG lint, smoke bataryası tanımı | LAYER-BOUNDARY-GATE-001, TRUTH-BASELINE-001, SCRIPT-LIFECYCLE-001 (registry) | F | H1 g1–4 | 1 deneme taşıma 8 gate yeşil |
| 2 | REFACTOR-CLEANUP-001 | §7 sınıfları, manifest + owner "sil" + tek commit; worktree/branch | REPO-CLEANUP-001/APPLY, DOCS-TOPOLOGY-001, DOCS-ARCHIVE-001 (silmeye dönüşür), OPS-BRANCH-001/RETIRE, STATE-PRUNE-001 | F + Owner | H1–H2 | manifest digest, dosya sayıları, link-lint 0 |
| 3 | REFACTOR-SURFACES-CLI-001 | cli → surfaces/cli; messages → kernel/i18n katalog göçü; doctor/autonomous/start/status/index; repl app/run | I18N-CATALOG-AUTHORITY-001, CLI-VOCAB-001, CLI-SURFACE-REFORM-001 dilim-1, ERROR-REGISTRY-001 (kısmi), D004-W9 | F | H2 g6–10 | 11 dosya ≤1500, repl/cli smoke, gerçek binary |
| 4 | REFACTOR-RUNTIME-001 | spawn-backend kümesi → runtime/exact-docker (§3.4), providers docker-invocation, recovery açık maddeleri | D004-W8, ADR-G-014, 3178 kapanış zinciri, XVERIFY-TRUTH-001 (kısmi) | A (tasarım g6–7, bölme g8–15) | H2–H3 | docker e2e + restart-reconcile, gerçek `deckent do`, xverify mührü |
| 5 | REFACTOR-KERNEL-001 | core çarpışmasız → kernel: config+config-types, errors, registry, validators, event contracts, sprint-archive, run-flow-store, invocation-receipt-store, provider.ts, memory-store | CONFIG-TRUTH-001, CONFIG-AUTHORITY-001 (kısmi), ZERO-HARDCODE-PROVIDER/FLOW-001 (ratchet), MEMORY-AUTHORITY-001 (yol) | F | H3 g11–15 | ≤1500, config testleri, clean-clone-smoke |
| 6 | REFACTOR-SURFACES-API-001 | api, mcp, mcp-client, sdk, connectors, extensions → surfaces; monitor, nervous → observability | API-W1, ORCH-W1, MCP-ANNOTATION-SAFETY-001 (kısmi), NERVOUS-* (yol) | F | H4 g16–18 | server/auditor testleri, serve-localhost-smoke |
| 7 | DEMO-20261005-001 | G1/G2/G3 kapıları, prova g18–19, `v0.101.0-demo` tag + release branch | U01–U06, RECOVERY-PAUSE-STATUS-001 | A + F + Owner | H3–H4 g14–20 | gerçek-binary receipt'ler |
| 8 | REFACTOR-RUNTIME-CUSTODY-001 | task-attempt-custody-store, file-lock, execution-effect-*, persistence-contract → runtime/{custody,effects,lock} | STATE-RETENTION-001, TASK-RETENTION-001, STATE-ARCHIVE-RESTORE-001 (yol) | A | H5–H6 g21–30 | custody testleri (8.5k test dosyası bölünür) |
| 9 | REFACTOR-ORCHESTRATION-001 | sprint-controller/phases/finalizer/spawner/lifecycle, result-collector/evaluator, scheduler-effects, task-builder, planner, autonomous, agent, intelligence, training | ADR-D-006 GODOBJ, EVAL/DEBT satırları (yol) | F | H5–H7 g21–35 | sprint-controller/brain testleri, first-sprint e2e |
| 10 | REFACTOR-TESTS-001 | 40.9k→≤8k; 31 dosya >1500; tests/ ağacı paket ağacına | TEST-675, TEST-HERMETIC-001, TEST-SPAWN-001, TEST-ORPHAN-001 | A + F (küme başına) | H2–H8 sürekli | DISPOSITION.json onayları, full suite ≤6 dk |
| 11 | REFACTOR-SCRIPTS-001 | 10 script >1500; script-registry | SCRIPT-RETIRE-001, CI-* | F | H7 g31–35 | lint:gates 0, registry güncel |
| 12 | REFACTOR-DOGFOOD-RETURN-001 | `DOGFOOD_MODE=ON` canary, 3178 durable settlement, 0.101.0 release | 3178 DONE, RELEASE satırları | A + Owner | H8 g36–40 | canary receipt, release checklist |

Haftalık lane özeti: H1 A=cutover, F=gates+cleanup · H2 A=runtime tasarım/bölme, F=cli · H3 A=runtime, F=kernel · H4 A=runtime kapanış+demo, F=surfaces+demo ·
H5–H6 A=custody, F=orchestration · H7 A=custody kapanış+tests, F=orchestration+scripts · H8 dogfood dönüş + release.

## 9. MASTER satır taslağı (REPO programı; Order 5600–5612; şema: Order|ID|Parent|Program|Outcome|Priority|DependsOn|Gate|State|Truth|Acceptance|Evidence|Updated)

| Order | ID | Parent | Program | Priority | DependsOn | Gate | State |
|---|---|---|---|---|---|---|---|
| 5600 | REFACTOR-PROGRAM-001 | — | REPO | P0 | — | G2,G1,G3 | OPEN |
| 5601 | REFACTOR-CUTOVER-001 | REFACTOR-PROGRAM-001 | REPO | P0 | RECOVERY-DO-DOGFOOD-001 | G1 | OPEN |
| 5602 | REFACTOR-GATE-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-CUTOVER-001 | G1,G2 | OPEN |
| 5603 | REFACTOR-CLEANUP-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-CUTOVER-001 | G3,G5 | OPEN |
| 5604 | REFACTOR-SURFACES-CLI-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-GATE-001 | G1 | OPEN |
| 5605 | REFACTOR-RUNTIME-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-GATE-001 | G1,G7 | OPEN |
| 5606 | REFACTOR-KERNEL-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-GATE-001 | G1 | OPEN |
| 5607 | REFACTOR-SURFACES-API-001 | REFACTOR-PROGRAM-001 | REPO | P1 | REFACTOR-KERNEL-001 | G1 | OPEN |
| 5608 | DEMO-20261005-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-RUNTIME-001, REFACTOR-SURFACES-CLI-001 | G7 | OPEN |
| 5609 | REFACTOR-RUNTIME-CUSTODY-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-RUNTIME-001 | G1 | OPEN |
| 5610 | REFACTOR-ORCHESTRATION-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-KERNEL-001, REFACTOR-RUNTIME-001 | G1 | OPEN |
| 5611 | REFACTOR-TESTS-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-GATE-001 | G3 | OPEN |
| 5612 | REFACTOR-SCRIPTS-001 | REFACTOR-PROGRAM-001 | REPO | P1 | REFACTOR-GATE-001 | G1 | OPEN |
| 5613 | REFACTOR-DOGFOOD-RETURN-001 | REFACTOR-PROGRAM-001 | REPO | P0 | REFACTOR-RUNTIME-CUSTODY-001, REFACTOR-ORCHESTRATION-001 | G7 | OPEN |

Truth başlangıcı tüm satırlarda `0/0/0/0/0/0/-`; Acceptance = §8 "çıkış kanıtı" sütunu; Evidence = bu doküman + iniş commit hash'leri.
Yedirilen satırlar kendi Evidence hücresine `absorbed-by: <REFACTOR-…>` alır; DONE'a aynı kanıtla geçer; DISPOSED yalnız owner kararıyla.

## 10. Riskler ve geri alma

- **"Hiç çalışmayan ürün" riski:** günlük kapı + yalnız-taşıma commit'leri; her commit tek başına `git revert` edilebilir; shim'ler küme kapanana kadar kalır.
- **Recovery ile çarpışma:** runtime kümesi Astra'da, recovery bağlamı onda; davranış düzeltmesi ayrı commit; Fable xverify.
- **Baseline drift:** move-module aracı baseline'ları yeniden yazar; elle baseline düzenleme yasak.
- **Sunum baskısı:** G1 kapısı geçmezse repl bölmesi geri alınır (revert), ürün öncelik.
- **Test kırpma regresyonu:** silme küme kapanışından SONRA, kontrat testleri yeşilken; e2e/smoke asla silinmez.
- **Platform:** freeze listesi + cross-platform e2e advisory raporu her küme kapanışında okunur.

## 11. Kapsam dışı ve owner-karar noktaları

Kapsam dışı: `.git` history yeniden yazımı; dashboard/desktop fiziksel taşıma; yeni ürün özelliği; provider ekleme.
Owner kararları: (a) Satır 0 K0/K1 düzeltme yetkisi; (b) ADR-D-004 ve G-014 amendment metinleri; (c) her temizlik sınıfının "sil" onayı;
(d) test DISPOSITION onayları; (e) sunum G1–G3 kapı sonuçlarına göre gösterim; (f) 0.101.0 release ve `v0.101.0-demo` tag.

## DONE

1. `lint-module-size`: src+tests+scripts içinde >1500 satır 0 dosya; baseline dışı >800 0 dosya; allowlist gerekçeli ve süreli.
2. Paket topolojisi §3.1; `lint-layer-shims` yeni yön kuralıyla fail-closed yeşil; ADR-D-004/D-006/G-014 amendment'ları accepted.
3. spawn-backend-docker yok; `runtime/exact-docker` ≤16 modül ≤800 satır; `SpawnBackend` 17-metot fasadı; çevrimsel import 0.
4. Test sayısı ≤8.000, test dosyası ≤800 satır, full suite ≤6 dk; e2e/smoke bataryası yeşil.
5. Temizlik sınıfları (1)–(8) owner onayıyla silinmiş; link-lint 0; worktree ≤ aktif lane sayısı.
6. Gerçek-binary G1 kanıtı (do → worker → accepted result → durable settlement) ve sunum tag'i `v0.101.0-demo`.
7. `DOGFOOD_MODE=ON` canary receipt; 3178 DONE; 0.101.0 release checklist yeşil.
8. 13 MASTER satırı DONE; yedirilen satırlar `absorbed-by` kanıtıyla kapanmış.
