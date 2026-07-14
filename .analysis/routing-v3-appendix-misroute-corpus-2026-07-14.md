# APPENDIX — MISROUTE EVIDENCE CORPUS (kanıt-ajanı tam-çıktısı, 2026-07-14)
> Ana-rapor: `.analysis/routing-v3-system-debug-2026-07-14.md` §5. Kaynaklar: `.deckent/runtime/jobs/sprint-*.json` (agentBreakdown+evaluations) · `.brain/archive/sprints/sprint-*-tasks/task-*.json` (routingMeta.taskDNA — per-task intent+confidence altın-kaynağı) · `.deckent/recently-works/*-events.jsonl` (TASK_ASSIGN) · `.analysis/` kök-neden dokümanları. NOT: scheduler-shadow JSONL'leri routing DEĞİL spawn-scheduling gölgesidir.
> Spot-check (Brain, 2026-07-14): 443-006/015/016/024 routingMeta-değerleri ve `.deckent/agents/archive/test-writer-removed-sprint-148` birinci-elden doğrulandı.

## 1. PER-SPRINT AGENT DISTRIBUTION

```
sprint-420 (n=2):  bug-fixer=2
sprint-421 (n=2):  bug-fixer=2
sprint-422 (n=2):  bug-fixer=2
sprint-423 (n=3):  bug-fixer=2, refactorer=1                    << bug-fixer 67%
sprint-424 (n=2):  bug-fixer=1, doc-writer=1
sprint-425 (n=2):  bug-fixer=2
sprint-426 (n=3):  bug-fixer=3                                  << 100%
sprint-427 (n=24): bug-fixer=24                                 << 100% (!)
sprint-428 (n=13): bug-fixer=12, doc-writer=1                   << 92%
sprint-429 (n=11): bug-fixer=11                                 << 100%
sprint-430 (n=4):  refactorer=3, doc-writer=1                   << 75%
sprint-431 (n=4):  refactorer=4                                 << 100%
sprint-432 (n=5):  refactorer=3, terminal-ux-engineer=2         << 60%
sprint-433 (n=3):  terminal-ux-engineer=3                       << 100%
sprint-434 (n=3):  ci-guardian=2, refactorer=1                  << 67%
sprint-435 (n=3):  refactorer=3                                 << 100%
sprint-436:        ci-guardian≥1   [GAP: jobs dosyası yok; TASK_ASSIGN'den kısmî]
sprint-437 (n=5):  ci-guardian=3, terminal-ux=1, refactorer=1   << 60%
sprint-438 (n=4):  refactorer=4                                 << 100%
sprint-439 (n=4):  refactorer=4                                 << 100%
sprint-440 (n=4):  refactorer=4                                 << 100%
sprint-441 (n=4):  refactorer=4                                 << 100%
sprint-442 (n=4):  devops-engineer=3, refactorer=1              << 75% (misroute-kaynaklı)
sprint-443 (n=26): refactorer=21, bug-fixer=1, devops=1, doc-writer=1, security-auditor=1, ci-guardian=1  << 81%
sprint-444 (n=7):  refactorer=3, ci-guardian=2, bug-fixer=1, terminal-ux=1   (43% — F3 sonrası)
```

Eski timestamp-çağı: refactorer 10/10 · test-writer 21/22 (%95) · doc-writer 20/21 · doc-writer 12/12 · doc-writer 10/10 · temp-react 14/27 (%52) · architect 4/4 · api-builder 9/17.

## 2. CONCRETE MISROUTE CASES (taskId — gist | intent(conf) | agent | neden yanlış | kaynak)

**Belgelenmiş:**
1. 443-006 "U4 guidance content — accessibility-auditor" | implementation(0.56) | refactorer | agent-adı intent-keyword içermiyor → catch-all | task-443-006.json
2. 443-007 — api-builder içeriği | implementation(0.56) | refactorer | aynı sınıf
3. 443-018 — i18n-specialist içeriği | implementation(0.56) | refactorer | "i18n" intent-keyword değil
4. 443-021/022/025 — observability/performance/terminal-ux içerikleri | implementation(0.56) | refactorer ×3
   → **DOĞAL DENEY:** 443-006..025 = 20 özdeş görev, hepsi conf 0.56-taban; yalnız başlıktaki agent-adının keyword-şansıyla ayrıştı: 443-015 devops(0.56)→devops-engineer ✅ · 443-016 documentation(0.80)→doc-writer ✅ · 443-024 security(0.90)→security-auditor ✅ · kalan 17 → implementation(0.56)→refactorer.
5. 442-001 "Rehydrate event-fold getFlow/listFlows" | devops(0.67) | devops-engineer | saf-TS event-sourcing; 'cd'⊂hex + 'ci'⊂"içindeki" | task-442-001.json + devrimi-8 worklog
6. 442-002 | devops(0.67) | devops-engineer | aynı mis-fire
7. 442-004 "Entegrasyon ve regresyon doğrulaması" | devops(**0.42**) | devops-engineer | test-görevi; güven-tabanı yok
8. 442-003 "Hermetik coordinator test-ailesi" | implementation(0.79) | refactorer + sh-portability skill | test-yazımı; saf-TS'e shell-skill
9. 440-003 "test-yazarlığı…" | implementation(**0.95**) | refactorer → **NO_GO** | başlıkta kelimenin kendisi var
10. 440-001 classifier'ı düzelten görev | implementation(0.95) | refactorer | ironi-vakası
11. 441-004 skill-retrieval testleri | implementation(0.95) | refactorer → **NO_GO**
12. 438-003 purity-contract testleri | implementation(0.92) | refactorer
13. 438-004 hermetik test-ailesi | implementation(0.95) | refactorer
14. 439-003/004 test-harness | implementation(0.95/0.90) | refactorer (439-004 **NO_GO**)
15. 437-001 EXPIRE-SWEEP çekirdek-API | devops(0.54) | ci-guardian | devops 10↔10 beraberliği keyfî-kazanan

**Probe-bataryası (a6-sinav, 2026-07-14):**
16. sinav3: 5/5 test-authoring görevi → hiçbiri `testing` sınıflanmadı (impl 0.67-0.81 + 1 doc 0.65)
17. sinav2-task2 xplat-install-smoke | implementation(**0.36**) | kardeş-task1 aynı workflow devops(0.95)
18. sinav2-task4 CI-doğrulama | documentation(0.74) | filesWrite=.md → uzantı-sürüşü
19. sinav3-task5 race-suite CI | documentation(0.65) | README-yazımı uzantı-sürüşü
20. sinav1-task4 entegrasyon-testleri | implementation(0.81) | testing değil

**Çıkarımsal (bağımsız kök-neden dokümanı yok):**
21. 415-003 security-görevi | intent=security | bug-fixer | u4-olcum/report.md:31
22. 423-002 config-görevi | intent=config | bug-fixer | u4-olcum/report.md:32

**Kontrol (doğru rota):** 410-001 design→frontend-designer · 443-016→doc-writer · 443-024→security-auditor.

## 3. AGENT STATS
- Canlı per-agent stats SIFIRLANMIŞ (tüm agent.json stats: totalUses 0).
- Bayat-audit (2026-07-10): doc-writer **595 kullanım** · api-builder **375**, avgCoverage **2.9956/100** (phantom-dilution) · architect **350** (Write-yasaklı danışman!) · accessibility-auditor **0** · ölü-kurallar: data-engineer, architecture-planner, frontend-designer, devops-engineer, integration-engineer · `api-design` hayalet-skill: 12 kullanım/%100-başarı (içerik hiç inject edilmemiş) · typescript-expert = skill-trafiğinin ~%48'i.
- Verdict-kümelenmesi: NO_GO/TECH_DEBT'ler misroute'lu test-görevlerinde (440-003/004, 439-004, 441-004) — **misroute↔başarısızlık korelasyonu**.

## 4. REPEATED PATTERNS
1. `implementation` catch-all lavabosu (430-438 korpusunda %61→refactorer; 19/19 intent=implementation).
2. Kelime-sınırsız substring-eşleşme (çekirdek motor hiç değişmedi; yamalar çevreye).
3. `testing` intent'i sahipsiz (test-writer sprint-148'de arşivli; 3 agent testing'i exclude ediyor).
4. Çıktı-uzantısı intent'i sürüyor (.md → documentation).
5. Başlıktaki agent-adı sınıflandırmayı kaçırıyor (443 doğal-deneyi).
6. Güven bimodal, çoğu YÜKSEK-AMA-YANLIŞ (0.92-0.95 misroute'lar); güven-tabanı yok (0.36'da rota verildi).
7. Skor-beraberlikleri keyfî (devops 10↔10); secondary-intent floor-asimetrisi (floor(8×0.5)=4<5 → tek-kural-8 agent'lar secondary'den asla ateşleyemez).
8. Catch-all çağdan-çağa göçüyor (bug-fixer→refactorer→devops…; eski çağlarda test-writer/doc-writer/temp-react) — manifest-drift lavaboyu seçiyor.
