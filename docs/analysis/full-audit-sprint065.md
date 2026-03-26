# DECKENT TAM KAPSAM DENETİM RAPORU — Sprint 065

**Tarih:** 2026-03-26
**Kapsam:** Sprint 1 — Sprint 065 (65 sprint, tüm kod tabanı)
**Analiz:** 16 alan, 165+ kontrol noktası

---

## YÖNETİCİ ÖZETİ

| Metrik | Değer |
|--------|-------|
| Kaynak dosya | 247 .ts |
| Kaynak satır | 75,105 |
| Test dosyası | 469 |
| Test sayısı | 11,862 (15 skip) |
| Coverage | 96%+ |
| CLI komutu | 32 dosya |
| MCP tool | **16** (docs'ta 10 yazıyor!) |
| MCP resource | **9** (docs'ta 5 yazıyor!) |
| Agent | 9 (8 built-in + ci-guardian) |
| Skill | 11 (10 built-in + ci-testing) |
| Provider | 3 (Claude, Codex, Gemini) |
| Sprint | 65 tamamlandı |
| ADR | 21 |

**Genel Değerlendirme:** Proje beta yayına **%92 hazır**. 5 P1 blocker, 7 P2 sorun, 3 P3 iyileştirme tespit edildi. Kritik: MCP tool/resource sayısı dokümantasyonla uyuşmuyor, 2 phantom dosya referansı, paket boyutu limiti aşılmış, PlannerTask interface eksik.

---

## BÖLÜM 1: DERLEME & KOD KALİTESİ

| Kontrol | Sonuç | Detay |
|---------|-------|-------|
| TypeScript derleme | **TEMIZ** | 0 hata, 0 uyarı |
| `any` kullanımı | **10 adet, 7 dosya** | Düşük. init(2), spawn(1), temp-skill-gen(3), outcome-tracker(1), mid-sprint-adapter(1), sprint-controller(1), task-builder(1) |
| Hardcoded secret | **0** | Temiz |
| ADR-008 ihlali | **0** | Planner sadece core/'dan, worker brain'den import etmiyor |
| npm audit | **5 moderate** | Tümü devDependency (vitest→test-exclude→glob→minimatch). Prod'da yok. |

### God Object Uyarıları (>500 satır)

| Dosya | Satır | Önem | Öneri |
|-------|-------|------|-------|
| sprint-controller.ts | **2,306** | P2 | 8 fazı ayrı fonksiyon dosyalarına bölmek düşünülebilir |
| sprint-reporter.ts | 1,997 | P2 | Retro + learnings + stats ayrılabilir |
| config.ts | 1,016 | P3 | Validation ayrı dosyaya çıkarılabilir |
| worker.ts | 956 | P3 | Verify loop ayrılabilir |
| doctor.ts | 902 | P3 | Check'ler modüler yapılabilir |

---

## BÖLÜM 2: PHANTOM & EKSİK UYGULAMALAR

### P1 — Blocker

| # | Bulgu | Durum | Aksiyon |
|---|-------|-------|---------|
| A | `prompt-token-optimizer.ts` | **PHANTOM** | Dosya yok, import yok, referans yok. Plan/tasarımdan kaldırılmalı veya oluşturulmalı. |
| B | `ecosystem-intelligence.ts` | **PHANTOM** | Dosya yok, import yok, referans yok. Plan/tasarımdan kaldırılmalı veya oluşturulmalı. |
| C | Manifest `manifestVersion` + `activation` eksik | **20 dosya** | agent.json/manifest.json dosyaları v1 formatında. Runtime migrate ediyor ama persist etmiyor. `deckent init --repair` ile batch update gerekli. |
| D | `PlannerTask` interface override eksik | **Veri kaybı** | AI planner path'te `forceAgent`, `forceSkills`, `excludeSkills`, `provider` alanları kaybolur. Interface'e ve `plannerTaskToParams()`'a eklenmeli. |
| G | Stale heartbeat — 2,089 occurrence | **10 sprint** | .brain/PATTERNS.md'de 10 sprint'tir çözülmemiş. Root cause: worker tamamlandığında heartbeat dosyası silinmiyor veya auditor eski dosyaları algılıyor. |

### P2 — Önemli

| # | Bulgu | Durum | Aksiyon |
|---|-------|-------|---------|
| E | `SprintState` interface | **MEVCUT** | sprint-controller.ts:246'da tanımlı. Sorun kapandı. |
| F | `api-surface.md` 7 alan eksik | **Kontrat eksik** | forceAgent, forceSkills, excludeAgent, excludeSkills, assignedAgent, assignedSkills, routingMeta eklenmeli. |
| H | `.deckent/usage/` gitignore | **EKSİK** | .gitignore'da yok, untracked görünüyor. Eklenmeli: `.deckent/usage/` |
| I | `IDENTITY.md` sayıları | **ESKI** | Tests: 10,500+ (gerçek: 11,862), Agents: 8 (gerçek: 9), Skills: 10 (gerçek: 11) |
| L | `enrichScopeWithTestFiles()` | **AI path'te yok** | Structured path'te çağrılıyor (satır 371, 464) ama `plannerTaskToParams()` (satır 497) çağırmıyor. |
| M | Config validation `routing_engine` | **ZOD yok** | Invalid değer sessizce kabul ediliyor. |
| N | Config migration `routing_engine` | **EKSİK** | Eski config'lerde alan yok → undefined kalıyor. |

### P3 — İyileştirme

| # | Bulgu | Aksiyon |
|---|-------|---------|
| J | CLAUDE.md modül sayıları | Kullanıcı düzeltti: orchestra/ 42, core/ 48 |
| K | V1+V2 paralel çalışma | Conditional (`routing_engine ?? 'v1'`). Zararsız ama gereksiz v1 hesaplama olabilir. |

---

## BÖLÜM 3: MCP TOOL/RESOURCE TUTARSIZLIĞI

### MCP Tool'lar (Gerçek: 16, Docs: 10)

| # | Tool | Dosya | Docs'ta var mı? |
|---|------|-------|-----------------|
| 1 | init | init.ts | Evet |
| 2 | set-directives | directives.ts | Evet |
| 3 | plan | plan.ts | Evet |
| 4 | start | start.ts | Evet |
| 5 | status | status.ts | Evet |
| 6 | doctor | doctor.ts | Evet |
| 7 | retro | retro.ts | Evet |
| 8 | history | history.ts | Evet |
| 9 | analyze | analyze.ts | Evet |
| 10 | sync | sync.ts | Evet |
| 11 | **config** | config.ts | **HAYIR** |
| 12 | **usage** | usage.ts | **HAYIR** |
| 13 | **review** | review.ts | **HAYIR** |
| 14 | **run** | run.ts | **HAYIR** |
| 15 | **kill** | kill.ts | **HAYIR** |
| 16 | **cleanup** | cleanup.ts | **HAYIR** |

### MCP Resource'lar (Gerçek: 9, Docs: 5)

| # | Resource | Dosya | Docs'ta var mı? |
|---|----------|-------|-----------------|
| 1 | dashboard | dashboard.ts | Evet |
| 2 | directives | directives.ts | Evet |
| 3 | memory | memory.ts | Evet |
| 4 | debt | debt.ts | Evet |
| 5 | config | config.ts | Evet |
| 6 | **retro** | retro.ts | **HAYIR** |
| 7 | **usage** | usage.ts | **HAYIR** |
| 8 | **tasks** | tasks.ts | **HAYIR** |
| 9 | **agents** | agents.ts | **HAYIR** |

**Önem:** P1 — Tüm dokümanlarda (DECKENT.md, CLAUDE.md, BLUEPRINT, health-check, mcp-guide) "10 tools + 5 resources" yazıyor. Gerçek: **16 tools + 9 resources**.

---

## BÖLÜM 4: NPM PAKET ANALİZİ

| Kontrol | Sonuç | Detay |
|---------|-------|-------|
| Paket boyutu | **768 KB** | Hedef 500KB — **%54 üzerinde!** 955 dosya dahil. |
| bin field | OK | deckent → dist/cli/entry.js, deckent-mcp → dist/mcp/server.js |
| files field | OK | ["dist", "bin", "README.md", "LICENSE"] |
| engines | OK | node >= 18 |
| Prod dependencies | 3 | commander, zod, @modelcontextprotocol/sdk |
| Shebang | Kontrol gerekli | dist/ build sonrası doğrulanmalı |

**768KB paket boyutu analizi:** Dashboard build'i, declaration map'ler, source map'ler dahil olabilir. `.npmignore`'da `*.map` veya `dist/**/*.d.ts.map` hariç tutulabilir.

---

## BÖLÜM 5: CLI KOMUT ENVANTERİ

**32 komut dosyası** (src/cli/commands/):

| Komut | Dosya | Durumu |
|-------|-------|--------|
| init | init.ts (740 satır) | Çalışıyor |
| start | start.ts | Çalışıyor |
| plan | plan.ts | Çalışıyor |
| status | status.ts | Çalışıyor |
| doctor | doctor.ts (902 satır) | Çalışıyor |
| retro | retro.ts | Çalışıyor |
| history | history.ts | Çalışıyor |
| config | config.ts | Çalışıyor |
| cleanup | cleanup.ts | Çalışıyor |
| kill | kill.ts | Çalışıyor |
| spawn | spawn.ts | Çalışıyor |
| attach | attach.ts | Çalışıyor |
| watch | watch.ts | Çalışıyor |
| review | review.ts | Çalışıyor |
| run | run.ts | Çalışıyor |
| analyze | analyze.ts | Çalışıyor |
| sync | sync.ts | Çalışıyor |
| usage | usage.ts | Çalışıyor |
| agent | agent.ts | Çalışıyor |
| skill | skill.ts (633 satır) | Çalışıyor |
| plugin | plugin.ts | Çalışıyor |
| onboard | onboard.ts | Çalışıyor |
| upgrade | upgrade.ts | Çalışıyor |
| explain | explain.ts | Çalışıyor |
| finalize | finalize.ts | Çalışıyor |
| dashboard | dashboard.ts | Çalışıyor |
| web | web.ts | Çalışıyor |
| serve | serve.ts | Çalışıyor |
| archive-debt | archive-debt.ts | Çalışıyor |
| quick-start | quick-start.ts | Çalışıyor |
| test-run | test-run.ts | Çalışıyor |
| skill-marketplace | skill-marketplace.ts | Çalışıyor |

---

## BÖLÜM 6: TESTLERDEKİ SKIP'LER

**36 skip pattern** bulundu. Tümü `describe.skipIf(isWindows)` — tmux testleri Windows'ta çalışamaz. Bu beklenen bir davranış, sorun değil.

**15 skipped test:** Vitest çıktısında 15 skip — bunlar da platform-conditional testler.

---

## BÖLÜM 7: ROUTING V2 ENGINE

| Bileşen | Dosya | Durum |
|---------|-------|-------|
| Intent classifier | intent-classifier.ts | Mevcut |
| Activation engine | activation-engine.ts | Mevcut |
| Routing engine | routing-engine.ts | Mevcut, `routeTaskV2()` export |
| Condition evaluator | condition-evaluator.ts | Mevcut |
| Manifest migrator | manifest-migrator.ts | Mevcut |
| Config field | `routing_engine?: 'v1' \| 'v2'` | Tanımlı ama migration/validation yok |

**V1→V2 geçiş:** `sprint-controller.ts:688` — `config.routing_engine ?? 'v1'` ile conditional. V2 seçildiğinde `routeTaskV2()` çağrılıyor. Paralel çalışma yok, sadece conditional.

---

## BÖLÜM 8: GÜVENLİK

| Kontrol | Sonuç |
|---------|-------|
| Hardcoded secret | 0 |
| API server auth | Bearer token, timing-safe SHA-256 |
| Rate limiting | 100 req/60s per IP |
| Credential redaction | Regex-based masking in logs |
| Worker scope isolation | TaskScope enforcement |
| Skill sandbox | AST-based static analysis |
| tmux prompt | Temp file via stdin (no shell injection) |
| .deck file | .gitignore'da |
| npm package leak | .npmignore mevcut |

---

## BÖLÜM 9: RİSK MATRİSİ

| # | Risk | Etki | Olasılık | Öncelik | Aksiyon |
|---|------|------|----------|---------|---------|
| 1 | MCP tool/resource sayısı yanlış | Kullanıcı karışıklığı | Kesin | **P1** | Tüm docs güncelle: 16 tool, 9 resource |
| 2 | PlannerTask override kaybı | forceAgent/forceSkills çalışmaz AI mode'da | Yüksek | **P1** | Interface + plannerTaskToParams güncelle |
| 3 | Paket 768KB (hedef 500KB) | Yavaş install | Kesin | **P1** | .npmignore'a *.map, *.d.ts.map ekle |
| 4 | Manifest v1 persist | v2 feature'lar çalışmaz | Orta | **P1** | Batch migrate + persist |
| 5 | Stale heartbeat 2089x | False alarm, gereksiz pattern | Kesin | **P1** | Root cause araştır |
| 6 | api-surface.md eksik | Kontrat tutarsız | Orta | **P2** | 7 alan ekle |
| 7 | .deckent/usage/ gitignore | Untracked dosyalar | Kesin | **P2** | .gitignore'a ekle |
| 8 | enrichScope AI path yok | Test scope eksik | Orta | **P2** | plannerTaskToParams'a ekle |
| 9 | Config routing_engine validation | Invalid config kabul | Düşük | **P2** | Zod schema + migration |
| 10 | Phantom dosyalar | Ölü referans | Düşük | **P3** | Kaldır veya oluştur |
| 11 | V1+V2 gereksiz hesaplama | Performance | Düşük | **P3** | Short-circuit |

---

## BÖLÜM 10: SONRAKİ ADIMLAR

### Sprint 066 Önerisi (P1 Blocker'lar)

1. **MCP docs güncelle** — 16 tool + 9 resource tüm dokümanlarda
2. **PlannerTask interface** — forceAgent, forceSkills, excludeSkills, provider ekle
3. **Paket boyutu** — .npmignore optimizasyonu, hedef <500KB
4. **Manifest v2 persist** — agent.json/manifest.json dosyalarını batch güncelle
5. **Stale heartbeat** — Root cause analizi + fix

### Sprint 067 Önerisi (P2 Önemli)

6. **api-surface.md** — 7 eksik alan
7. **.gitignore** — .deckent/usage/ ekle
8. **enrichScopeWithTestFiles** — AI planner path'e entegre
9. **Config routing_engine** — Zod validation + migration default
10. **IDENTITY.md** — Tests/Agents/Skills sayıları güncelle

---

*Bu rapor Sprint 065 sonrasında oluşturulmuştur. Önceki audit (pre-Sprint 036) `docs/archive/full-audit-pre036.md`'de arşivlenmiştir.*
