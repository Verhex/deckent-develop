# DIRECTIVES — Sprint 272: Orkestrasyon Güvenilirliği — Ghost-Finalize + Dispatch-Yarışı + Exit-Without-Result Kökü + Kind-Bazlı Limitler

## Goal: Son üç sprintin canlı bulgularını kökten kapat: (1) GHOST-FINALIZE — finalize/cleanup checkpoint artığı bırakıyor, sonraki `deckent start` hayalet 0/0-finalize koşup sprint başlatmadan çıkıyor; (2) dispatch-kuyruğu/EVALUATE yarışı — kuyrukta hiç koşmamış task varken değerlendirme başlıyor (271-013 vakası); (3) exit-without-result ailesi — worker işi yapıp .result yazamadan çıkınca sentetik NO_GO (3 sprint üst üste; iş diskte TAM olduğu hâlde); (4) F1-LIM faz-2 — 271 baseline'ına göre task-tipine göre memory limiti (kod 1.5g / doc 768m önerisi) + provider-limit tespit temeli. Bu sprint ürünün KENDİ resource-monitor'üyle koşuyor (resource_monitor.enabled=true — canlı dogfood testi).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable I/O; gerçek docker/ağ YASAK testlerde; spawnSync YASAK.
- **Self-verify TARGETED:** yalnız kendi test dosyaların; başkasının yarım dosyası NO_GO sebebi değil (notes'a).
- **Davranış korunumu:** mevcut yeşil testler yeşil kalır; tüm yeni davranışlar additive/opt-in; canlı-yol değişikliklerinde fail-safe öncelikli.
- **i18n-FIRST:** user-facing string `getMessage(key, lang)` (en+tr).
- **`.tasks/task-XXX.result` YAZ** — bu sprint'in konusu tam da bu: result yazımını ATLAMA.

---

## Task 1: GHOST-FINALIZE fix — checkpoint artığı temizliği + start'ın dürüst davranışı
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-checkpoint.ts, src/cli/commands/start.ts, tests/orchestra/ghost-finalize.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/, tests/cli/

### Description
CANLI BUG (2026-06-10, iki kez): sprint finalize/cleanup `.deckent/sprint-NNN-checkpoint.json` + `-checkpoint-seq` dosyalarını SİLMİYOR; sonraki `deckent start` bu artığı görüp önceki sprint için **hayalet finalize** koşuyor ("Sprint NNN Complete! 0/0 tasks", taskIds boş) ve YENİ SPRINT'İ BAŞLATMADAN çıkıyor — kullanıcı start'ın çalıştığını sanıyor. Kaynaklar: `src/orchestra/sprint-checkpoint.ts` (checkpoint yazımı/okuması), finalize/cleanup zinciri (`sprint-finalizer.ts` + CLEANUP fazı), `src/cli/commands/start.ts` (leftover-checkpoint yolu — davranışı İZLE ve .result'a belgele). Fix: (1) sprint terminal'e ulaştığında (finalize VE cleanup yolları, `finalize --force` dahil) kendi checkpoint dosyalarını temizle; (2) start leftover-checkpoint bulursa: checkpoint'in sprint'i ZATEN finalize edilmişse (memory.db retro var / sprint-state COMPLETE-arşivli) sessizce temizleyip YENİ sprint'e DEVAM ET; finalize edilmemişse mevcut kurtarma davranışı + kullanıcıya açık i18n mesajı ("önceki sprint artığı bulundu → X yapılıyor") — hayalet 0/0-finalize loglayıp çıkmak YASAK. Testler: finalize sonrası checkpoint yok; --force yolu; leftover+finalize-edilmiş → temizle-ve-başlat; leftover+yarım → kurtarma yolu korunur.

**Kanıt:** `npx vitest run tests/orchestra/ghost-finalize.test.ts` yeşil; `grep -n "checkpoint" src/orchestra/sprint-finalizer.ts | head -2` ≥ 1. **Test:** 8+.

---

## Task 2: dispatch-kuyruğu/EVALUATE yarışı — koşmamış task varken değerlendirme başlamaz
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/result-collector.ts, src/orchestra/sprint-phases.ts, tests/orchestra/dispatch-evaluate-race.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
CANLI BUG (271-013): TOPP continuous-dispatch'te bağımlılıkları YENİ açılmış ve henüz hiç dispatch edilmemiş task kuyrukta beklerken collector "toplama bitti" deyip EVALUATE başlattı → 013 hiç koşmadan honest-gate sentetik NO_GO yedi; FIX dalgası da onu almadı. Kaynaklar: `result-collector.ts` (waitForResults/processQueue — toplamanın bitme koşulu), `sprint-phases.ts` dispatch döngüsü (respawnEligibleTasks/TOPP, ADR-064), `isTaskDispatched` sinyali (`sprint-phases.ts:262` civarı). Fix: toplama-bitti koşulu "tüm task'lar TERMINAL (result'lı) VEYA dispatch-edilmiş-ve-bekleniyor" olmalı; dependencies'i yeni karşılanmış PENDING task varsa EVALUATE'e GEÇME — önce dispatch et (timeout güvenliği: dispatch-edilemeyen task makul üst-sınırda dürüst NO_GO'ya düşer, sonsuz bekleme YOK — mevcut sprint-timeout mekanizmasına bağla). Yarışın birim-testi: sentetik kuyrukla "dep'i son anda açılan task evaluate öncesi dispatch edilir" + "dispatch imkânsızsa (spawn hatası) timeout'la dürüşt kapanır" + mevcut akış regresyonsuz.

**Kanıt:** `npx vitest run tests/orchestra/dispatch-evaluate-race.test.ts` yeşil. **Test:** 7+.

---

## Task 3: exit-without-result kökü (a) — docker wrapper son-şans + zengin marker
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: devops-engineer
- Skills: docker-expert, typescript-expert, testing-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-exit-marker.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
3 sprint üst üste canlı desen: worker İŞİ BİTİRİYOR (hb seq yüksek/DONE, diff diskte) ama `.result` yazamadan exitCode=0 çıkıyor (limit/akış kesintisi) → host monitor "Worker exited without writing result" sentetik NO_GO. Kaynak: `spawn-backend-docker.ts` EXIT-trap / host-monitor promotion yolu (`:1083` civarı partial-promotion). Fix (wrapper tarafı): container çıkışında .result YOKSA (1) kısa son-şans penceresi (3-5s — geç flush'ı yakala); (2) hâlâ yoksa promotion marker'ını ZENGİNLEŞTİR: `git diff --stat` özeti (kaç dosya/satır — EXIT-trap zaten diff hesaplıyorsa onu kullan), son hb status/seq, `workPresent: boolean` (diff>0) alanlarıyla `EXIT_WITHOUT_RESULT` tipli partial yaz. Davranış korunur (yine NO_GO-aday partial) — ama Task 4'ün eval'i artık ayırt edebilir. Testler: mock exit akışında marker alanları; son-şans penceresi; iş-yok vakasında workPresent=false.

**Kanıt:** `npx vitest run tests/orchestra/docker-exit-marker.test.ts` yeşil; `grep -n "workPresent\|EXIT_WITHOUT_RESULT" src/orchestra/spawn-backend-docker.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 4: exit-without-result kökü (b) — eval'de workPresent → verify-and-complete FIX yolu
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/result-evaluator.ts, src/orchestra/sprint-phases.ts, tests/orchestra/work-present-eval.test.ts
- Dependencies: 272-003
- Scope: src/orchestra/, tests/orchestra/

### Description
Task 3'ün zengin marker'ını değerlendirme tüketsin: `EXIT_WITHOUT_RESULT` + `workPresent:true` partial'ı düz "crashed NO_GO" yerine **VERIFY_AND_COMPLETE** sinyalli NO_GO olur → FIX dalgasının bu task için prompt'u "sıfırdan yap" değil "diskteki işi denetle-tamamla-result yaz" çerçevesi alır (FIX prompt zenginleştirme deseni ADR-073; mevcut FIX akışına minimal ek — yeni faz İCAT ETME). workPresent:false → bugünkü davranış aynen. CC kurtarmalarında elle yaptığımız "fresh worker over partial work" deseninin üçüncü kez kanıtlanmış hâlinin ürünleşmesi. Testler: workPresent partial → eval sinyali + FIX prompt içeriğinde verify-and-complete ibaresi (mock); workPresent yok → regresyonsuz; gerçek DONE result'lar etkilenmez.

**Kanıt:** `npx vitest run tests/orchestra/work-present-eval.test.ts` yeşil; `grep -n "VERIFY_AND_COMPLETE\|workPresent" src/orchestra/result-evaluator.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 5: F1-LIM faz-2a — task-tipine göre memory limiti (kod 1.5g / doc 768m önerisi)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: devops-engineer
- Skills: typescript-expert, testing-expert, docker-expert
- Files: src/core/config-types.ts, src/core/config.ts, src/orchestra/spawn-backend-docker.ts, tests/orchestra/memory-limit-by-kind.test.ts
- Scope: src/core/, src/orchestra/, tests/

### Description
271 baseline'ı (resource-profile.md §10: kod-task peak ≤929MB, doc-task ≤247MB — 4g limit 4-20 kat fazla) → opt-in kind-bazlı limit: config `worker_memory_limit_by_kind?: { [kind: string]: string }` (örn `{ "doc": "768m", "code": "1536m" }`; anahtarlar canonical TaskKind — `core/work-model.ts` SSOT). Spawn'da: task.type için kind-limit varsa onu, yoksa mevcut `worker_memory_limit ?? 4g` (sıfır davranış değişikliği). Swap aynı oranda türetilir (limit×1.5, mevcut 4g/6g oranı). `parseMemoryString` ile validasyon; geçersiz değer → config hatası. Testler: kind eşleşmesi, fallback, swap türetimi, validasyon.

**Kanıt:** `npx vitest run tests/orchestra/memory-limit-by-kind.test.ts` yeşil; `grep -n "worker_memory_limit_by_kind" src/orchestra/spawn-backend-docker.ts` ≥ 1. **Test:** 7+.

---

## Task 6: F1-LIM faz-2b — provider-limit tespit modülü + FIX ölü-limit guard'ı
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: devops-engineer
- Skills: typescript-expert, testing-expert
- Files: src/core/provider-failure-classifier.ts, src/orchestra/sprint-phases.ts, tests/core/provider-failure-classifier.test.ts
- Scope: src/core/, src/orchestra/, tests/

### Description
269 canlı dersi: usage-limit tükenince TÜM worker'lar exit-without-result yedi ve FIX dalgası AYNI ölü limite koşup israf etti. **YENİ `src/core/provider-failure-classifier.ts`:** `classifyProviderFailure(input: { workerLog?: string; resultNotes?: string; exitCode?: number }): 'usage-limit' | 'auth' | 'oom' | 'unknown'` — pure; imzalar GERÇEK gözlemlerden: claude CLI usage-limit mesaj desenleri (workerLog'da geçen kalıpları `.tasks/*.log` arşiv örneklerinden ÇIKAR — uydurma regex yazma; bulamadığın imza için 'unknown'), exit 137 → 'oom', auth hata kalıpları. **FIX guard'ı (sprint-phases):** FIX dalgası başlamadan, NO_GO'ların ≥%50'si 'usage-limit' sınıflıysa FIX'i ATLAYIP dürüst i18n uyarısı logla ("provider limiti tükenmiş görünüyor — FIX ertelendi; limit reset sonrası deckent spawn/resume") — toplu israfı kes. Tek-tük limit → mevcut davranış. Testler: sınıflandırma imzaları, FIX-skip eşiği, normal NO_GO'larda FIX aynen.

**Kanıt:** `npx vitest run tests/core/provider-failure-classifier.test.ts` yeşil; `grep -n "classifyProviderFailure" src/orchestra/sprint-phases.ts` ≥ 1. **Test:** 9+.

---

## Task 7: docs — resource-profile kind-limit bölümü + config/features satırları
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/resource-profile.md, docs/reference/config-reference.md, docs/reference/features.md
- Dependencies: 272-005, 272-006
- Scope: docs/reference/

### Description
DİSKTEKİ koddan (inmemişleri yazma + .result'a not): resource-profile.md'ye `worker_memory_limit_by_kind` bölümü (271 baseline tablosuna referansla önerilen değerler) + config-reference'a alan tanımı + features.md'ye kind-limit & provider-failure-classifier & FIX ölü-limit guard satırları.

**Kanıt:** `grep -ciE "worker_memory_limit_by_kind" docs/reference/resource-profile.md docs/reference/config-reference.md | paste -sd+ | bc` ≥ 2. **Test:** yok — .result YAZ.

---

## Task 8: MASTER-PLAN işaretleri — 272 kapananlar
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Dependencies: 272-001, 272-002, 272-004, 272-006
- Scope: docs/

### Description
Diskte doğruladıklarını işaretle (inmemişleri İŞARETLEME + .result'a not): GHOST-FINALIZE fix ✅, dispatch/EVALUATE yarışı ✅, exit-without-result wrapper+eval zinciri ✅ (MF-9/B-MF ailesiyle ilişkilendir), F1-LIM faz-2 (kind-limit + limit-tespit + FIX guard'ı — "algıla→park"ın ilk yarısı ✅, tam park/resume-planı kalan). Tek-satır ekler.

**Kanıt:** `grep -c "Sprint 272" docs/MASTER-PLAN.md` ≥ 2. **Test:** yok — .result YAZ.

---

**Beklenen:** 8 mikro task (opus 5 — hepsi zor orkestrasyon kökü · sonnet 1 · haiku 2), zincirler: 004→003 · 007→005,006 · 008→001,002,004,006. Bu sprint ürünün KENDİ resource-monitor'üyle koşar (`resource_monitor.enabled=true` — Sprint 271 wire'ının canlı testi; CC ayrıca hafif yedek örnekleyici tutar). CC sprint sonu: `.deckent/resource-log.jsonl` ürün-logunu `deckent resources --log` ile analiz + tsc + testler + commit/push + 🔨 BUILD. Sonraki: PLAN-INT-1 + XVER-1 + dashboard UI SSO.
