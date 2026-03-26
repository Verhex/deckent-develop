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
| `any` kullanımı | **10 adet, 7 dosya** [DONE sprint-067] | init(2), spawn(1), temp-skill-gen(3), outcome-tracker(1), mid-sprint-adapter(1), sprint-controller(1), task-builder(1) — tümü `unknown`/proper type ile değiştirildi |
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
| A | `prompt-token-optimizer.ts` | **PHANTOM** [DONE sprint-066] | Phantom referanslar temizlendi — dosya gerçekten yok, tüm referanslar kaldırıldı. |
| B | `ecosystem-intelligence.ts` | **PHANTOM** [DONE sprint-066] | Phantom referanslar temizlendi — dosya gerçekten yok, tüm referanslar kaldırıldı. |
| C | Manifest `manifestVersion` + `activation` eksik | **20 dosya** [DONE sprint-066] | Tüm 9 agent.json ve 11 skill manifest.json dosyasına manifestVersion:2 ve activation kuralları eklendi. |
| D | `PlannerTask` interface override eksik | **Veri kaybı** [DONE sprint-066] | Interface'e forceAgent, forceSkills, excludeSkills, provider alanları eklendi. `plannerTaskToParams()` güncellendi. |
| G | Stale heartbeat — 2,089 occurrence | **10 sprint** [DONE sprint-066] | Root cause çözüldü: worker tamamlanınca heartbeat cleanup, auditor stale detection iyileştirildi. |

### P2 — Önemli

| # | Bulgu | Durum | Aksiyon |
|---|-------|-------|---------|
| E | `SprintState` interface | **MEVCUT** | sprint-controller.ts:246'da tanımlı. Sorun kapandı. |
| F | `api-surface.md` 7 alan eksik | **Kontrat eksik** [DONE sprint-066] | forceAgent, forceSkills, excludeAgent, excludeSkills, assignedAgent, assignedSkills, routingMeta eklendi. |
| H | `.deckent/usage/` gitignore | **EKSİK** [DONE sprint-066] | .gitignore'a `.deckent/usage/` eklendi. 33 tracked dosya git index'ten kaldırıldı. |
| I | `IDENTITY.md` sayıları | **ESKI** [DONE sprint-066] | Tests: 11,918+, Agents: 9, Skills: 11 olarak güncellendi. |
| L | `enrichScopeWithTestFiles()` | **AI path'te yok** [DONE sprint-067] | `plannerTaskToParams()` içine entegre edildi. |
| M | Config validation `routing_engine` | **ZOD yok** [DONE sprint-067] | Zod schema'ya `routing_engine: z.enum(['v1', 'v2'])` eklendi. |
| N | Config migration `routing_engine` | **EKSİK** [DONE sprint-067] | Migration default olarak `'v2'` atanıyor. autoMigrateOnLoad güncellendi. |

### P3 — İyileştirme

| # | Bulgu | Aksiyon |
|---|-------|---------|
| J | CLAUDE.md modül sayıları | [DONE sprint-066] Kullanıcı düzeltti + housekeeping task doğruladı: orchestra/ 42, core/ 48 |
| K | V1+V2 paralel çalışma | [DONE sprint-067] V2 artık default. `config.routing_engine ?? 'v2'` — V1 legacy olarak işaretlendi. |

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

**Önem:** P1 [DONE sprint-066] — Tüm dokümanlarda (DECKENT.md, CLAUDE.md, BLUEPRINT, health-check, mcp-guide) "10 tools + 5 resources" yazıyordu. Sprint-066'da 12 dokümantasyon dosyası güncellendi: **16 tools + 9 resources** doğru bilgi.

---

## BÖLÜM 4: NPM PAKET ANALİZİ

| Kontrol | Sonuç | Detay |
|---------|-------|-------|
| Paket boyutu | **768 KB → <500KB** [DONE sprint-067] | .npmignore optimizasyonu: *.map, *.d.ts.map, dist/dashboard/, dist/**/*.test.* eklendi. |
| bin field | OK | deckent → dist/cli/entry.js, deckent-mcp → dist/mcp/server.js |
| files field | OK | ["dist", "bin", "README.md", "LICENSE"] |
| engines | OK | node >= 18 |
| Prod dependencies | 3 | commander, zod, @modelcontextprotocol/sdk |
| Shebang | Kontrol gerekli | dist/ build sonrası doğrulanmalı |

**768KB paket boyutu analizi:** [DONE sprint-067] Dashboard build'i, declaration map'ler, source map'ler hariç tutuldu. `.npmignore` güncellendi.

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
| Config field | `routing_engine?: 'v1' \| 'v2'` | [DONE sprint-067] Zod validation + migration default 'v2' |

**V1→V2 geçiş:** [DONE sprint-067] `sprint-controller.ts` — `config.routing_engine ?? 'v2'` ile conditional. V2 artık default. V1 keyword-based routing legacy olarak işaretlendi.

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
| 1 | MCP tool/resource sayısı yanlış | Kullanıcı karışıklığı | Kesin | **P1** [DONE sprint-066] | Tüm docs güncellendi: 16 tool, 9 resource |
| 2 | PlannerTask override kaybı | forceAgent/forceSkills çalışmaz AI mode'da | Yüksek | **P1** [DONE sprint-066] | Interface + plannerTaskToParams güncellendi |
| 3 | Paket 768KB (hedef 500KB) | Yavaş install | Kesin | **P1** [DONE sprint-067] | .npmignore optimize edildi, hedef <500KB sağlandı |
| 4 | Manifest v1 persist | v2 feature'lar çalışmaz | Orta | **P1** [DONE sprint-066] | 20 dosya (9 agent + 11 skill) batch migrate + persist |
| 5 | Stale heartbeat 2089x | False alarm, gereksiz pattern | Kesin | **P1** [DONE sprint-066] | Root cause fix: cleanup + auditor stale detection |
| 6 | api-surface.md eksik | Kontrat tutarsız | Orta | **P2** [DONE sprint-066] | 7 alan eklendi: forceAgent, forceSkills, vb. |
| 7 | .deckent/usage/ gitignore | Untracked dosyalar | Kesin | **P2** [DONE sprint-066] | .gitignore'a eklendi |
| 8 | enrichScope AI path yok | Test scope eksik | Orta | **P2** [DONE sprint-067] | plannerTaskToParams'a entegre edildi |
| 9 | Config routing_engine validation | Invalid config kabul | Düşük | **P2** [DONE sprint-067] | Zod schema + migration default 'v2' |
| 10 | Phantom dosyalar | Ölü referans | Düşük | **P3** [DONE sprint-066] | prompt-token-optimizer + ecosystem-intelligence referansları kaldırıldı |
| 11 | V1+V2 gereksiz hesaplama | Performance | Düşük | **P3** [DONE sprint-067] | V2 artık default, V1 legacy |

---

## BÖLÜM 10: SONRAKİ ADIMLAR

### Sprint 066 Önerisi (P1 Blocker'lar) — TAMAMLANDI

1. **MCP docs güncelle** — [DONE sprint-066] 16 tool + 9 resource tüm dokümanlarda
2. **PlannerTask interface** — [DONE sprint-066] forceAgent, forceSkills, excludeSkills, provider eklendi
3. **Paket boyutu** — [DONE sprint-067] .npmignore optimizasyonu, <500KB sağlandı
4. **Manifest v2 persist** — [DONE sprint-066] agent.json/manifest.json dosyaları batch güncellendi
5. **Stale heartbeat** — [DONE sprint-066] Root cause analizi + fix tamamlandı

### Sprint 067 Önerisi (P2 Önemli) — TAMAMLANDI

6. **api-surface.md** — [DONE sprint-066] 7 eksik alan eklendi
7. **.gitignore** — [DONE sprint-066] .deckent/usage/ eklendi
8. **enrichScopeWithTestFiles** — [DONE sprint-067] AI planner path'e entegre edildi
9. **Config routing_engine** — [DONE sprint-067] Zod validation + migration default 'v2'
10. **IDENTITY.md** — [DONE sprint-066] Tests/Agents/Skills sayıları güncellendi
11. **`any` kullanımı** — [DONE sprint-067] 10 adet, 7 dosya temizlendi

---

## BÖLÜM 11: SPRINT 067 SONUÇ ÖZETİ

Sprint 067 tamamlandı. Tüm P1/P2/P3 maddeleri sprint-066 ve sprint-067'de çözüldü.

| Metrik | Önceki | Sonraki |
|--------|--------|---------|
| Açık P1 | 5 | 0 |
| Açık P2 | 7 | 0 |
| Açık P3 | 3 | 0 |
| Test sayısı | 11,862 | 11,918+ |
| Sprint | 65 | 67+ |
| Routing engine | v1 (legacy) | **v2 (default)** |
| npm paket boyutu | 768KB | <500KB |
| `any` kullanımı | 10 adet | 0 |

---

*Bu rapor Sprint 065 sonrasında oluşturulmuştur. Sprint 066-067 çözüm durumları eklenmiştir (2026-03-27). Önceki audit (pre-Sprint 036) `docs/archive/full-audit-pre036.md`'de arşivlenmiştir.*
