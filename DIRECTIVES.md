# DIRECTIVES — OVERNIGHT ROUND 4 (BIG): pivot-P0 genişleme + borç-temizliği (18 task)

## Goal
Strategic-pivot P0 pillar'larını genişlet (TERM açılış+keşif · TOOL registry+disclosure ·
APR broker+masking · TRN pipeline · MOAT-3 dürüst-durum) ve 10 kalite/güvenlik borcunu kapat.
Her task: önce DISK-VERIFY (`git grep`/Read, `file:line` cite), sonra hermetik-testli implementasyon.
Yasa #1 çift-bakış · Yasa #2 cross-platform · Yasa #3 god-level/no-MVP.

## 🔒 BAĞLAYICI — her task (binding)
- **DISTINCT-FILE:** `Files:` = tek yazım-otoriten; read-dizinleri yazım izni VERMEZ; scope-dışı bulgu → result `notes` (`docImpact:` konvansiyonu dahil).
- **DISK-VERIFY first:** iddiayı diskte doğrula + cite; zaten-doğruysa kanıtla SKIP.
- **ADR kontrat · surgical minimum-diff · davranış koru · YAGNI.**
- **Test hermeticity:** tmpdir+afterEach; proje-kökü/HOME'a yazma; spawnSync yok; gerçek-provider çağrısı yok.
- **No build/install/login.** `tsc --noEmit` + yalnız HEDEFLİ test dosyaların.
- **i18n-first:** yeni user-facing string yalnız `getMessage(key, lang)` (en+tr çifti).
- **Honest result** (files_changed + kanıt + selfAssessment). **No haiku.**

---

## Task 1: TERM-1 — açılış health-snapshot (row 38, pivot-P0)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/helpers/health-snapshot.ts, src/cli/entry.ts, tests/cli/health-snapshot.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-010 (terminal UX) + pivot-P0 TERM ("hazır mıyım?"). `deckent` açılışında (REPL
bootstrap — `launchDefaultRepl`, entry.ts) tek-bakış health-snapshot: provider/model (canlı
registry'den, hardcode YOK) · auth-durumu (probe var: provider-auth-probe) · MCP erişilebilirliği ·
bellek/budget özeti · cwd + aktif-mode. Yeni saf modül `buildHealthSnapshot(root)` (I/O fail-soft,
her alan "unknown"a dürüşt düşer) + entry.ts'te REPL-öncesi compact render (i18n-first; NO_COLOR
saygılı). Snapshot toplama <500ms hedef (yavaş probe'lar timeout'lu). Tier-1 surface: result'a
`Smoke: node dist/cli/entry.js --version → sürüm basılır` yerine gerçek snapshot-smoke öner
(host koşar).
### goNogo
- goCriteria: buildHealthSnapshot hermetik testli (mock probe'lar; alan-alan fail-soft kanıtı);
  render i18n-key'li (en+tr); canlı model-ID hardcode edilmemiş (registry'den — test eder);
  entry.ts wire minimal-diff; `tsc --noEmit` temiz.
- nogo: hardcoded model/provider adı; açılışı bloklayan yavaş probe; İngilizce-hardcode metin.

## Task 2: TERM-3 — kategorili komut-registry (row 42, pivot-P0)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/command-registry.ts, tests/cli/command-registry.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-011 (CLI/MCP parity) + pivot TERM-3. TEK cross-surface komut-kataloğu modülü:
her deckent komutu için {name, category (Core|Run|Memory|MCP|Enterprise|Danger), risk
(Oku|Değiştir|Çalıştır|Otonom — TERM-5 sade-risk-dili), scope, summaryKey (i18n), surfaces
(cli|mcp|repl)}. Mevcut komut listesini DİSKTEN çıkar (src/cli/commands/ register-pattern +
mcp tools listesi) — elle-uydurma YOK; kayıt-eksiği testte yakalansın (registry ⊇ registered
commands). Salt-veri + query API (byCategory/byRisk/search); UI-wiring follow-up (result notes).
### goNogo
- goCriteria: registry gerçek komut-envanterini kapsar (test, disk-taramayla karşılaştırır);
  kategori/risk enum'ları spec'teki gibi; query API testli; `tsc --noEmit` temiz.
- nogo: uydurulmuş komut listesi; UI değişikliği; i18n'siz görünür metin.

## Task 3: TOOL-1 — deckent tool-registry çekirdeği (row 20, pivot-P0)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-builder
- Files: src/core/tool-registry.ts, tests/core/tool-registry.test.ts
- Scope: src/core/, src/mcp/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: pivot-P0 TOOL-1 ("deckenti deckent yapan") + ADR-G-011. Deckent fonksiyonlarını
terminal-native TOOL yüzeyine taşıyan çekirdek: `ToolDefinition` {name, description, paramsSchema
(zod), risk, category, handlerRef} + `ToolRegistry` (register/get/list/validate-params). MCP
tools (src/mcp/tools/) tanımlarından SEED et — çift-tanım değil, tek-kaynak adaptörü (MCP tool
→ ToolDefinition köprüsü; disk-verify MCP tool-tanım şekli). Dispatch ÇALIŞTIRMA yok (yalnız
registry+validation; dispatch TOOL-2+cutover işi). Cross-surface (REPL/MCP/CLI aynı registry'yi
okuyacak — bugün sadece modül+test).
### goNogo
- goCriteria: registry MCP-tool-setinden seed'lenir (test: bilinen tool adları mevcut; params
  şeması valide eder/reddeder); handler ÇAĞRILMAZ (saf katalog); `tsc --noEmit` temiz.
- nogo: MCP tanımlarının kopyala-yapıştır çiftlenmesi; gerçek exec; circular import (mcp→core→mcp).

## Task 4: TOOL-2 — progressive disclosure köprüsü (row 21, pivot-P0)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/tool-search.ts, tests/core/tool-search.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: TOOL-1
### Description
Governing: pivot-P0 TOOL-2 (§7.1 "BM25 modeli, daha iyisi"). TOOL-1 registry'si üstüne
search/describe/call-plan köprüsü: `searchTools(query, {limit})` (token-tabanlı skorlama:
name-exact > name-partial > description-token; deterministik sıralama), `describeTool(name)`
(tam şema), `planCall(name, args)` (validate + risk-etiketli çağrı-planı döner — EXEC YOK).
Core-set kavramı: `coreTools()` eager-listesi (status/plan/run/start/review/help/memory-query —
TOOL-CORE row 23'ün temeli). Hepsi saf + hermetik.
### goNogo
- goCriteria: arama deterministik + alakalı (test: 'sprint başlat' → start önde); describe tam
  şema döner; planCall invalid-args'ı reddeder + risk etiketi taşır; coreTools listesi spec'teki
  7'yi içerir; `tsc --noEmit` temiz.
- nogo: gerçek tool-exec; nondeterministik skorlama; TOOL-1 dosyalarına yazma.

## Task 5: APR-1 — ApprovalBroker çekirdeği (row 29, pivot-P0 "en kritik")
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-builder
- Files: src/core/approval-broker.ts, tests/core/approval-broker.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: pivot-P0 APR-1 (§11.1) + ADR-G-020. Runtime-wide, EVENT-tabanlı (stdin DEĞİL)
ApprovalBroker: sprint-350'de inen `approval-contract.ts`'i (disk-verify) kullanır.
`ApprovalBroker` {submit(request)→pending (dosya-backed store: .deckent/approvals/, atomic
tmp+rename, JSONL ya da dosya-per-request), on('pending'|'decided') EventEmitter, decide(id,
decision)→resolve + awaiting-promise resume, list(pending), expire(now) TTL-süpürme}.
Çok-process gerçeği: store DOSYA-tabanlı (başka process decide edebilir — poll/watch seam
injectable). Worker-suspend/resume mekaniği ve kanal-relay'ler (APR-2) follow-up — burada
broker çekirdeği + store + event.
### goNogo
- goCriteria: submit→pending persist (atomic yazım test); decide→promise resume + event; expire
  TTL testi; ikinci-process-decide simülasyonu (store'a dışarıdan yazılan decision'ı watch/poll
  seam'i görür); contract-tipleri approval-contract'tan import (yeniden-tanım YOK); `tsc` temiz.
- nogo: stdin-etkileşimi; contract-tiplerini çiftlemek; non-atomic store yazımı.

## Task 6: APR-4 — onay redaction/masking (row 37, pivot-P0)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, secure-coding
- Files: src/core/approval-masking.ts, tests/core/approval-masking.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: APR-4 (§11.7) + ADR-G-025. ApprovalRequest'in maskedArgs/rawArgsRef ayrımını dolduran
modül: `maskArgs(raw)` → redactSensitive-tabanlı masked görünüm (komut-string'i, env-değerleri,
path'lerdeki credential'lar) + `storeRawArgs(root, id, raw)` → .deckent/approvals/raw/ altına
0600-perm, atomic; `resolveRawArgs(root, ref)` yalnız explicit çağrıyla. Serileşen request'e raw
ASLA girmez (contract zaten dışlıyor — testle kanıtla).
### goNogo
- goCriteria: sk-/Bearer/API_KEY/password= maskelenir (test); raw ayrı-dosyada 0600 + atomic;
  request-JSON'unda raw'ın izi yok; `tsc` temiz.
- nogo: raw'ın request'e sızması; maskeleme mask-formatını mevcut redactSensitive'den saptırmak.

## Task 7: TRN-4 — training-pipeline mükemmelleştirme (row 80, pivot-P1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/training/pipeline.ts, tests/training/trn4-pipeline.test.ts
- Scope: src/training/, src/core/, src/agent/, tests/training/, docs/adr/
- Dependencies: none
### Description
Governing: TRN-4 ("Hermes shipped-grade") + ADR-G-009. sprint-350'de inen TRN-1/2/3 wire'larını
disk-verify et (trace-recorder çıktı-şekli), sonra pipeline modülü: trace → ShareGPT-format
dönüştürücü + compressor (tool-result truncation politikalı) + label-zenginleştirme (outcome/
agent/model) + redaction-pass (çift-kontrol). Girdi: .deckent/training/ trace'leri; çıktı:
ShareGPT JSONL. Deterministik; büyük-trace'te bellek-güvenli (satır-akışlı).
### goNogo
- goCriteria: fixture-trace → geçerli ShareGPT JSONL (şema-testli); truncation politikası testli;
  redaction çift-pass kanıtı; satır-akışlı (dev dosyada tüm-dosya-belleğe-alma yok — test yaklaşık
  kanıt yeterli); `tsc` temiz.
- nogo: format uydurup ShareGPT'den sapmak; redaction'sız çıktı.

## Task 8: MOAT-3 — NOT_DISPATCHED dürüst-durum (row 87, P1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/result-evaluator.ts, src/orchestra/sprint-phases.ts, src/core/task-types.ts, tests/orchestra/moat3-not-dispatched.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: MOAT-3 (sentetik-NO_GO güven sorunu; sprint-347/348'de canlı yaşandı: spawn/dispatch
hiç olmadığında worker "NO_GO" görünüyor — yalan). Dispatch-hiç-olmamış (spawn-fail, container
hiç start etmemiş, .result+.hb+log hiçbiri yok) task'ler evaluation'da **NOT_DISPATCHED** ayrı
dürüst-durumuyla işaretlensin: TaskEvaluation enum'una ekle, evaluate-fazı disk-kanıtına göre
ayırt etsin (result yok + hb yok + worker-start izi yok → NOT_DISPATCHED; result yok ama hb/iz
var → mevcut synthetic-NO_GO). FIX-fazı NOT_DISPATCHED'ı "re-dispatch aday" sayar (worker-suçu
değil); rapor/summary ayrı sayaç gösterir. Geriye-uyum: mevcut NO_GO akışları bozulmaz.
### goNogo
- goCriteria: enum+ayrım testli (üç senaryo: dispatch-yok / worker-öldü-izli / normal-NO_GO);
  FIX-fazı sınıflandırması testli; summary sayacı; mevcut evaluate testleri yeşil; `tsc` temiz.
- nogo: NO_GO semantiğini genişletip ayrımı bulanıklaştırma; disk-kanıtsız sınıflandırma.

## Task 9: PGID — worker process-group teardown (row 432-MOAT, G-013)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/providers/subprocess.ts, tests/providers/pgid-teardown.test.ts
- Scope: src/providers/, src/core/, tests/providers/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-013 (MOAT-2 e2e bulgusu). SIGKILL-escalation doğrudan worker'ı öldürür ama
grandchild'ları DEĞİL (kanıt: sh-wrapped worker'da sleep orphan kaldı). Fix: POSIX'te worker'ı
`detached: true` (yeni process-group lideri) spawn et + killWithSignal grubu hedeflesin
(`process.kill(-pid, sig)`); Windows'ta detached semantiği farklı — platform-dallı (win32'te
mevcut tek-pid davranışı korunur + dürüst debugLog; taskkill /T follow-up notu). MOAT-2'nin
child.unref() + hbInterval düzenleri AYNEN korunur (moat2-linger testleri yeşil kalmalı).
### goNogo
- goCriteria: POSIX'te spawn detached + grup-kill (mock-spawn testi: kill(-pid) çağrısı);
  win32 dalı davranış-koruyucu; tests/providers/subprocess*.test.ts + moat2-linger yeşil;
  `tsc` temiz.
- nogo: MOAT-2 unref/escalation davranışını bozmak; gerçek-sinyal testleri.

## Task 10: RVDC — finalizer ölü-V1-branch çöküşü (row 425)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-planner.ts, tests/orchestra/rvdc-deadbranch.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-006 (ROUTE-V1-PURGE follow-up). Finalizer'daki artık-ölü `if(routingVersion
!== 'v2')` V1-stats-branch'i (~61 satır; agent.json'a yazar) davranış-hassas dedent'le kaldır —
V2/learnings.json yolu TEK yol kalsın; planner+finalizer'daki vestigial tek-değerli
version-guard'ları temizle. DİKKAT: double-count-guard mantığı finalize kritik-yolu — önce
mevcut testleri koş, minimum-diff, sonra tekrar koş.
### goNogo
- goCriteria: V1-branch yok (grep-kanıt); stats yalnız learnings-yoluna; mevcut finalize/stats
  testleri yeşil; yeni regression-test (v2-default akışı stats'ı BİR kez sayar); `tsc` temiz.
- nogo: stats çift-sayımı; agent.json-yazımının yanlışlıkla tamamen kaybı (learnings-yolu
  agent-stats güncellemesini zaten yapıyorsa onu koru — disk-verify).

## Task 11: RV2C — Route-V2 integration coverage (row 426)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/orchestra/route-v2-integration.test.ts
- Scope: tests/, src/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-006. Silinen V1-only integration testlerinin (full-sprint-e2e/error-recovery/
project-type routing) V2-eşdeğerleri: routeTaskV2 üzerinden (a) karışık-görevli mini-set'te
çeşitlilik (tek-agent ≤%60), (b) monorepo-tipi çok-dizinli görev routing'i, (c) force-*
override'ların korunması, (d) role-mismatch penalty'nin canlı etkisi (reviewer implement-task'ta
seçilmez — gerçek agent-pool fixture'ıyla). Salt-test task'ı; src'ye DOKUNMA.
### goNogo
- goCriteria: 4 senaryo hermetik testli (gerçek DB'siz — fixture pool); suite yeşil; `tsc` temiz.
- nogo: src değişikliği; gerçek .brain/memory.db okuma.

## Task 12: APDD — auditor PILOT_ADR_RULES dedup/taxonomy-fix (row 423)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/monitor/auditor.ts, tests/monitor/apdd-pilot-rules.test.ts
- Scope: src/monitor/, src/core/, tests/monitor/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-019 (taxonomy) + row 423. `PILOT_ADR_RULES`/checkADRCompliance'daki DB-gated
kural anahtarları eski `ADR-006/008` — taxonomy-rename sonrası DB-id'ler `adr-g/d-NNN` →
eşleşmeyen kural = ölü/redundant. Disk-verify: hangi kurallar hangi id'yle ölü; yeni-id'lere
remap ET ya da gerçekten-redundant'sa (authority-enforcer zaten kapsıyorsa) SİL — seçimini
kanıtla gerekçelendir. Auditor'un diğer davranışı bozulmaz.
### goNogo
- goCriteria: ölü-anahtar kanıtı (file:line + DB-id listesi); remap-veya-sil kararı gerekçeli;
  auditor testleri yeşil + yeni test (kural gerçek taxonomy-id'yle ateşlenir YA DA silinmiş);
  `tsc` temiz.
- nogo: kanıtsız silme; taxonomy-id'siz yeni hardcode.

## Task 13: EAA — evaluation-audit atomic yazım (ADR-G-025 born)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/evaluation-audit-trail.ts, tests/orchestra/eaa-atomic.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-025 (EVAL-AUDIT-ATOMIC born). `writeEvaluationAudit` düz `writeFileSync` —
checkpoint/phase-persistence'ın kullandığı `.tmp`+`renameSync` atomik desenine geçir (aynı
dosyadaki mevcut desenleri disk-verify + aynısını uygula). Yarım-yazılmış audit post-mortem'i
bozmasın. Davranış/format değişmez.
### goNogo
- goCriteria: tmp+rename kanıtı (test: yazım-anı kesintisi simülasyonu → ya eski ya yeni, asla
  yarım); mevcut audit-trail testleri yeşil; `tsc` temiz.
- nogo: format değişikliği; ekstra I/O katmanı.

## Task 14: SWEEP2 — stale model-ID süpürme part-2 (row 431 kalanı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/core/model-registry.test.ts, tests/core/cost-calculator.test.ts, tests/scripts/zero-hardcode-audit.test.ts, tests/core/limit-ledger-cache-gate.test.ts, tests/orchestra/tmux.test.ts, tests/orchestra/sprint-reporter-usage.test.ts, tests/orchestra/reconciler.test.ts, tests/orchestra/planner.test.ts, tests/mcp/cost-tool.test.ts, tests/providers/claude-usage.test.ts, tests/catalog/catalog-types.test.ts, tests/mcp/usage-tool.test.ts, tests/mcp/models.test.ts, tests/providers/claude.test.ts, tests/catalog/catalog-registry.test.ts, tests/cli/models.test.ts, tests/cli/usage-command.test.ts, tests/e2e/tmux-backend.test.ts, tests/e2e/provider-smoke.test.ts
- Scope: tests/, src/core/, docs/adr/
- Dependencies: none
### Description
Governing: [[feedback_zero_hardcode_live_data]] + row 431 (part-1 sprint-350'de). Listelenen 19
dosyada `claude-sonnet-4-6` → kanonik güncel ID (kaynağı model-registry/catalog'dan cite et;
sprint-350-006'nın kanıtını yeniden-kullanabilirsin). Testin NİYETİ "alias güncel modele çözülür"
ise registry-tabanlı assertion'a çevir; ID-fix ötesinde yeniden-yapılandırma YOK. Her dosyanın
suite'ini koş.
### goNogo
- goCriteria: 19 dosya güncel + suite'leri yeşil; kanonik-kaynak cite; kalan-stale=0 (grep-kanıt
  result'ta); `tsc` temiz.
- nogo: davranışsal test değişikliği; listedışı dosya.

## Task 15: DPP — dead provision-helper purge/consent (row 208, P1·SEC)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, secure-coding
- Files: src/cli/commands/init-steps.ts, src/cli/commands/init.ts, tests/cli/dpp-provision.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-030 + row 208 ("consent-bypass riski"). `maybeProvisionDockerImage` /
`reprovisionWorkerImageAfterUpgrade` helper'larının call-site'sizlik iddiasını disk-verify et;
gerçekten ölülerse SİL (ADR-D-006 dead-code disposition); bir call-site varsa consent-zorunlu
yap (explicit onay-parametresi olmadan docker-build ASLA). Riskli-miras: sessiz docker-image
build'i kullanıcı-onayı olmadan çalışmamalı.
### goNogo
- goCriteria: 0-caller kanıtı (grep) → silme + testler yeşil; YA DA call-site'li → consent-gate
  testli; hiçbir yol sessiz-build bırakmaz; `tsc` temiz.
- nogo: davranışı sessizce değiştirip init'i kırmak; kanıtsız silme.

## Task 16: CFG-1 — legacy `mode` config-set blokajı (row 209, P1)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts, tests/core/cfg1-legacy-mode.test.ts
- Scope: src/core/, src/cli/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: row 209 ("resolveMode wire; 3-yol tutarsız"). Legacy `mode` değeri tüm config-set'i
blokluyor iddiasını disk-verify et (validateConfig / config-set yolu / resolveMode üçlüsü);
kök-neden: legacy on-disk değer validation'ı düşürüyor. Fix: routing_engine v1→v2 coercion
desenini (aynı dosyada mevcut — disk-verify) legacy-mode için uygula: oku-anında coerce +
migrateConfig kalıcılaştır; `deckent config set` legacy-mode'lu dosyada çalışır hale gelsin.
### goNogo
- goCriteria: legacy-mode'lu fixture-config'de set başarılı (hermetik test, tmpdir); coercion
  + migrate testli; mevcut config testleri yeşil; `tsc` temiz.
- nogo: legacy değeri sessizce SİLMEK (coerce et, veri kaybetme); validation'ı gevşetmek.

## Task 17: DOCTOR-1 — backend-aware platform-check (row 210, P1·WIN)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/doctor.ts, tests/cli/doctor-backend-aware.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Governing: row 210 + Yasa #2. doctor'ın Platform-check'i backend-blind: Windows+docker
kombinasyonunda yanlış teşhis; ayrıca brain-budget label eksik/yanıltıcı. Disk-verify
(runDoctorChecks platform/backend dalları), sonra: check'ler configured spawn_backend'i hesaba
katsın (docker-varken tmux-yokluğu FAIL değil; win32+subprocess honest-support satırı);
brain-budget label'ı gerçek kaynağından. i18n-first.
### goNogo
- goCriteria: backend-matrisli testler (docker/tmux/subprocess × linux/win32 mock-platform);
  yanlış-FAIL senaryosu düzeldi (regression-test); i18n-key'ler en+tr; `tsc` temiz.
- nogo: gerçek docker/tmux çağrısı testte; platform-string hardcode.

## Task 18: W5C — kind-affinity routing sinyali, config-gated (row 447, P2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/routing-engine.ts, tests/core/w5c-kind-affinity.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: row 447 (349-005 analiz) + ADR-G-006. refactorer feature-add'e atanıyor (davranış-koruma
misyonuyla çelişki; Sprint-211 refactorer-heavy nüksü). İMPLEMENTER-İÇİ ince-sinyal: TaskKind
'refactor' → refactorer +bonus; 'code-development' → refactorer hafif-penalty (−2). **Config-gated,
DEFAULT-OFF** (`routing.kindAffinity ?? false`) — dağılım-değişikliği Alperen sabah-onayına kadar
kapalı kalır; flag-off yolu byte-identical. Mevcut role-signal (getRoleMismatchPenalty) desenini
aynala.
### goNogo
- goCriteria: flag-off → skor byte-identical (test); flag-on → refactor-task'ta refactorer öne,
  feature-task'ta geriler (fixture-pool testi); routing-diversity testleri yeşil; `tsc` temiz.
- nogo: default-on; role-signal'i bozmak.
