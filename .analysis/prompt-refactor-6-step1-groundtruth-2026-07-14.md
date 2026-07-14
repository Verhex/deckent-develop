# PCOMP-6 · Adım 1-2 — Ground-Truth + Kök-Neden Konsolidasyonu

> Tarih: 2026-07-14 · Yürüten: Fable-CC (dogfooding'siz, MASTER-PLAN 573)
> Girdi: 2 dış-analiz (438-prompt'ları) + 3 iç-denetim (G-serisi/512 · prompt-contract-verification · agent/skill-audit)
> Korpus: **31 prompt** (sprint 430-438 task-JSON'larından canlı zincirle yeniden-üretim: `resolveAgentPrompt` + `resolveSkillPrompts` + `buildWorkerPrompt`; 0 hata) + 1 gerçek 27.7KB prompt (436-001)
> Kod-haritası: Explore-ajanı, tam pipeline `routeTaskV2 → detectTaskType → buildWorkerPrompt → buildTaskPromptSegmented → renderSegments`

## 1. Yönetici özeti

Dış-analizlerin ana teşhisi ("append-only compose, derleme yok") **doğru**; ama iki önemli düzeltmeyle: (a) behavior-precedence bloğu sanıldığı gibi blanket DEĞİL — kod-düzeyinde dar-koşullu (`prompt-god-template.ts:1389-1393`: yalnız refactorer + davranış-değiştiren intent), **fiilen blanket'e dönüşmesinin nedeni yukarı-akış**: korpustaki işlerin %61'i refactorer'a, behavior-bloğu basılan 19 prompt'un **19'u da `intent=implementation`a** damgalanıyor — kök, blok-render değil **routing/intent-sınıflandırması**; (b) `\;` sızıntısı prompt-derleyicide değil **DIRECTIVES-serileştirme katmanında** (`directives-builder.ts:119 escapeListItem`). En evrensel bulgu: **31/31 prompt'ta verify test-komutu placeholder** (`<path-to-the-test-file(s)-you-changed>`) — exact-path üretimi hattın hiçbir yerinde yok. Maliyet: ortalama prompt ~6.0K token; **görev-çekirdeği yalnız %11** — skills+persona+ADR bagajı %46, operasyonel şablon %33.

## 2. Pipeline (tek bakış)

```
routeTaskV2 (plan-time: taskDNA.intent + assignedAgent + assignedSkills)
  └ selectBestAgent  — refactorer impl@7 catch-all; domain-bonus yoksa çöküş; fallback-chain
  └ skill: activation/trigger + computeSkillRelevance (SUBSTRING, semantic yok) + B4 skill-floor (asla boş bırakmaz)
detectTaskType (plan-time: task.type)
buildWorkerPrompt (task-builder.ts:1658 — TÜM disk-okumaları burada; 6 canlı çağıran)
  └ filterSkillPromptsByDNA (çift-yönlü substring, eşik=1, boş-kalırsa HEPSİNİ döndürür)
buildTaskPrompt → buildTaskPromptSegmented (prompt-god-template.ts:388/404 — SAF derleyici)
  └ 19 segment (T0 cache-prefix / T1 proje / T2 task) → renderSegments:1505
```
Saf-derleyici sınırı temiz (tüm I/O dışarıda) — **compiler/linter'ı yerleştirmek için ideal nokta zaten mevcut mimaride hazır.**

## 3. Bulgu-eşleme: dış-analiz ↔ ground-truth ↔ frekans

| # | Dış-analiz iddiası | Hüküm | Kod-kaynağı | Korpus-frekansı (31 prompt) |
|---|---|---|---|---|
| P1 | filesWrite ↔ görev-metni/goCriteria çelişkisi (438-003) | **CONFIRMED** — kaynak prompt-derleyici değil, **planner çıktısı** (task-üretimi); derleyicide mentioned-file⊆writeAuthority lint'i yok | görev-metni: planner; render: `buildScopeBlock:829` + `:902` "single authority" | **7/31 (%23)** görev-metninde geçen dosya ⊄ filesWrite (bir kısmı "dokunma" bağlamı olabilir — lint tasarımında yazma-imalı-fiil ayrımı gerekir) |
| P2 | "CHANGES external behavior" blanket basılıyor | **KISMEN ÇÜRÜDÜ** — blok dar-koşullu (`:1389`: refactorer + non-refactor-intent); fiili blanket'lik **intent-damgası bozukluğundan** | `buildBehaviorPrecedenceNote:1389`; girdi `taskDNA.intent.primary` (`sprint-planner.ts:749`) | **19/31 basılı; 19/19'unda intent=implementation + agent=refactorer** — koşul hiç ayrıştırmıyor çünkü girdi tek-değere çökmüş |
| P3 | Skill-injection relevance inversion | **CONFIRMED + mekanizma netleşti**: semantic yok; substring-eşleşme + düşük eşikler (0.3/1) + **iki asla-boş-bırakmayan fallback** (B4-floor `routing-engine.ts:1641` + filtre "hepsini döndür" `prompt-token-optimizer.ts:150`) | `computeSkillRelevance:41` + `filterSkillPromptsByDNA:116` | sh-portability **10/31**, file-watch-hygiene **6/31** (TS/contract işlerine shell/watcher rehberi); skill-bloğu ort. 2.9KB/prompt |
| P4 | refactorer her yere | **CONFIRMED**: `impl@7` catch-all aktivasyonu; domain-bonus tetiklenmezse çöküş; fallback-chain de refactorer-önce | `selectBestAgent` (`routing-engine.ts:1273`), `AGENT_FALLBACK_CHAIN:64` | **%61 refactorer** (19/31); test-yazarlığı işleri dahil |
| P5 | goCriteria test-aileleri read-scope/verify dışı (438-001) | **KISMEN** — kaba-heuristikte 0/31 (scope.directories genelde genış); 438-001 tekil-vakası dış-analizde satır-kanıtlı; asıl evrensel eksik ↓ C | plan-time scope üretimi (planner) | tekil-vaka; sistemik hali C'de |
| C | Verify test-komutu placeholder | **CONFIRMED — EN EVRENSEL**: exact-path üretimi hattın hiçbir yerinde yok | `buildTestCommandLine:1498-1503` | **31/31** |
| — | `\;` escape sızıntısı | **CONFIRMED ama farklı katman**: DIRECTIVES-serileştirici; prompt-derleyicideki `parenAwareSplit:1261` escape'siz | `directives-builder.ts:119/130/149` | RunFlow-NL yolundan gelen tüm task'larda görünür |
| — | Persona/rubric tekrarı (4 yer) | **KISMEN**: goCriteria ~4.5 tema/prompt (2 verbatim + 2 referans); **rubric-registry prompt'a GİRMİYOR** (evaluation-tarafı) — dış-analizin "rubric de prompt'ta" varsayımı yanlış | `buildDodBlock:1406` + `buildDodChecklist:1295` + verify-ref + Karpathy#4 | ort 4.5 tema |
| — | "a implementation" article-hatası | CONFIRMED (string-interpolation) | `:1389` bloğu | behavior-bloğu basılan 19'da |

## 4. Maliyet anatomisi (31-prompt ortalaması; ~5.980 token/prompt)

| Blok | Ortalama | Pay | Not |
|---|---|---|---|
| Operasyonel şablon (Scope→son: result/heartbeat/karpathy/turn-economy…) | 5.2KB | %22 | T0-statik; cache-prefix'e taşınabilir kısmı büyük |
| Persona (agent PROMPT.md verbatim) | 4.6KB | %20 | Görevle ilgili 5-15 satır yerine tam-gövde |
| ADR bloğu | 3.1KB | %13 | top-3 + 0.3 eşik; tek ADR-contract'ı 2KB'a varıyor |
| Skills (verbatim gövdeler) | 2.9KB | %13 | inversion-etkisiyle çoğu alakasız |
| **Görev çekirdeği (Your Task+DoD+What-To-Do)** | **2.6KB** | **%11** | asıl iş |
| Verify-steps | 2.5KB | %11 | 31/31 placeholder-komutlu |

Kısalma potansiyeli: persona→focused-guidance (+%12-15), skill-precision (+%8-10), ADR-özet-modu (+%5-8), tekrar-birleştirme (+%3-5) → **%28-38 aralığı gerçekçi** (dış-analiz tahminiyle uyumlu).

## 5. Kök-neden ağacı (Adım-2 konsolidasyonu)

```
KÖK-A  Derleme-yokluğu: katmanlar-arası statik tutarlılık kontrolü yok
       → P1 (write⊆mentioned), 438-001 verify-kapsam çelişkisi, DONE≡rubric sapması
       → İç-denetim bağı: G1b "inşasız" (prompt-contract-verification), sprint-397 compile-time-gate önerisi PENDING
KÖK-B  Routing/intent tek-değere çöküyor: intent≈hep 'implementation', persona≈refactorer@7
       → P2'nin fiili-blanket'liği + P4 + (dolaylı) P3 skill-atamasının intent-affinity'si
       → İç-denetim bağı: agent/skill-audit'in 5 sistemik kök-nedeninden 2'si
KÖK-C  Retrieval substring+floor: semantic yok, boş-bırakmama fallback'leri eleme-gücünü sıfırlıyor
       → P3; ADR-relevance-inversion'ın kardeşi
KÖK-D  Exact-değer üretimi yok: test-yolu/verify-komutu placeholder; kanonik kabul tek-kaynaktan türetilmiyor
       → C (31/31), G-tekrarları, P5-sınıfı
KÖK-E  Serileştirme-katmanı sızıntıları: \; escape, ASCII'leşmiş-TR, article-interpolation
       → kozmetik ama güven-aşındırıcı; mekanik fix
YAN-1  Ölü-kod: selectAgent + selectSkills ÖLÜ (canlı=routeTaskV2) — CLAUDE.md brain-kuralı hâlâ "Run selectAgent()" diyor (bayat-doc)
YAN-2  Prompt-arşivleme: cleanup sprint-başına ~1 prompt bırakıyor — korpus/audit için kayıp (kolay fix: .prompt-*'ı arşive taşı)
```

## 6. Adım-3 tasarım-iskeleti (onaya sunulacak)

**PCOMP-6 = "derlenen prompt" üç katman:**
1. **Kanonik kabul-yapısı**: `acceptance {invariants, verification{typecheck, tests[{path,reason}]}, verdict}` tek-kaynak; goNogo/DoD/checklist/verify-bloğu bundan RENDER edilir (el-yazımı 4-kopya ölür). Test-path'leri plan-time'da repo-metadata'dan EXACT çözülür (placeholder ölür).
2. **Prompt-linter (spawn-öncesi gate)** — 8 kontrol: mentioned-write-file⊆writeAuthority · required-test-path⊆read-scope · DoD-testleri⊆verify-komutları · persona-görev-tipi-uyumu · behavior-flag↔task-tipi tutarlılığı · DONE-kuralı≡checklist · dependency-durum-tutarlılığı · exact-path-çözünürlüğü. (Fail-closed mi warn-only mu → Alperen-kararı.)
3. **Retrieval-hassasiyeti**: skill/persona çift-eşik (semantic-benzerlik VE dosya/domain-uyumu); B4-floor'un "alakasız-skill-koy" yerine "skill'siz-geç + loud-not" davranışı; persona kataloğuna test-authorship sınıfı; focused-guidance render (tam-gövde yerine göreve-ilgili kesit).

**Sıralı uygulama önerisi** (her dilim bağımsız değer): D1 exact-verify+kanonik-kabul → D2 linter (warn→ölçüm→fail-closed) → D3 routing/intent (KÖK-B) → D4 retrieval (KÖK-C) → D5 kozmetik+ölü-kod+arşivleme. Doğrulama: bu 31-prompt korpusu golden-set olur; önce/sonra skor + linter'ın 438-çelişkilerini yakalama testi + token-ölçümü.
