# DIRECTIVES — Sprint 061: Agent Activation Fix + Critical Debt + Beta Polish

## Goal: Agent activation P0 fix (8 agent tanımlı ama hiçbiri kullanılmıyor — kök neden: persistence + stats guard), plan standalone provider fix, brain budget decay, açık teknik borç temizliği, CLI polish. Beta readiness %78 → %95 hedef.

---

## Task 1: Agent Assignment Persistence Fix (P0 CRITICAL)
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts, src/orchestra/task-builder.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
KÖK NEDEN: selectAgent() doğru agent'ı seçiyor ama task JSON'a persist etmiyor.

**A) createTask() assignedAgent Field Initialize:**
task-builder.ts'deki createTask() fonksiyonunda Task objesine `assignedAgent: 'generic'` default field'ı ekle. Böylece JSON.stringify serialize ederken alan mevcut olur.

**B) planSprint() Agent Selection → JSON Write Doğrulama:**
sprint-controller.ts satır 663-676'daki agent selection bloğundan SONRA, task JSON yazılırken (satır 698-703) assignedAgent alanının korunduğunu doğrula. Debug log ekle: `debugLog('Agent assigned: ${task.id} → ${task.assignedAgent}')`.

**C) selectAgent() Sonuç Loglaması:**
AgentPoolManager.selectAgent() sonucunu logla — hangi agent seçildi, trigger score, neden. Eğer hiçbir agent seçilmediyse (tüm score < threshold) bunu da logla.

**D) assignedSkills Field Initialize:**
createTask()'ta `assignedSkills: []` default field'ı da ekle. Skill seçimi sonrası atanan skill ID'leri bu alana yaz.

**E) End-to-End Test:**
Test: planSprint() → task JSON oku → assignedAgent ≠ 'generic' (agent trigger keyword'leri match eden task için). Örnek: "Fix security vulnerability" task'ı → security-auditor agent'ı atanmalı.

**Test:** 10+ test

---

## Task 2: Agent Stats Update Fix (P0 CRITICAL)
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts, src/core/agent-pool.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
KÖK NEDEN: sprint-controller.ts satır 1394'teki `if (!agentId || agentId === 'generic') continue;` guard'ı TÜM task'ları skip ediyor çünkü hepsi generic.

**A) Guard Değiştir:**
Satır 1394'ü `if (!agentId) continue;` olarak değiştir. generic agent için de stats tracking yap (debug amaçlı).

**B) Stats Write Doğrulama:**
AgentPoolManager.updateAgentStats() çağrıldıktan sonra agent.json dosyasının güncellendiğini doğrula. Test: sprint sonrası agent.json'da totalUses > 0.

**C) writeSprintLog Agent Bilgisi:**
sprint-reporter.ts'deki writeSprintLog fonksiyonuna agent bilgisi ekle. Sprint log'da her task için atanan agent adını yaz. Format: `| Task | Agent | Status |` tablosu.

**D) Skill Bilgisi de Sprint Log'a Ekle:**
Aynı şekilde assignedSkills bilgisini de sprint log'a yaz.

**Test:** 10+ test

---

## Task 3: Agent List Display Fix + History Agent Column (P1)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/agent.ts, src/cli/commands/history.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/cli/commands/

### Description
**A) agent list Display Fix:**
"Uses: undefined, Success: NaN%" → agent.ts'deki list formatlamasında stats objesini güvenli oku:
- `stats?.totalUses ?? 0`
- `isNaN(stats?.successRate) ? 0 : Math.round(stats.successRate)`
- Format: "Uses: 0, Success: 0%"

**B) history Agent Column:**
history.ts'deki parseSprintLog fonksiyonunda agent sütununu parse et. writeSprintLog'a Task 2'de eklenen agent bilgisini oku ve göster.

**C) agent stats --json:**
`deckent agent stats <name> --json` çıktısını düzelt — stats objesi doğru serialize edilmeli.

**Test:** 8+ test

---

## Task 4: Plan Standalone Provider Bootstrap (P0)
- Model: opus
- Effort: high
- Files: src/cli/commands/plan.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
`deckent plan` komutu "No providers registered" hatası veriyor çünkü bootstrapProviders() çağrılmıyor.

**A) Provider Bootstrap Ekle:**
plan.ts'e start.ts pattern'ini takip ederek bootstrapProviders() çağrısı ekle. Import: `import { bootstrapProviders } from '../../core/provider.js'`.

**B) Fallback to Structured:**
Provider bootstrap başarısız olursa (API key yok vs.) structured mode'a fallback yap — hata fırlatma yerine uyarı ver ve structured parse kullan.

**C) --dry-run Provider-Free:**
`--dry-run` flag'inde AI planner gerekmez — structured parse yeterli. Provider olmasa bile çalışsın.

**Test:** 6+ test

---

## Task 5: Brain Budget Decay + Memory Temizliği (P0)
- Model: sonnet
- Effort: high
- Files: .brain/MEMORY.md, .brain/DEBT.md, src/orchestra/debt-manager.ts
- Scope: .brain/, src/orchestra/, tests/

### Description
Brain budget 591/600 (%98.5). Bir sonraki sprint MEMORY.md'ye yazınca bütçe aşılacak.

**A) MEMORY.md Decay:**
Eski sprint learnings'lerini sıkıştır. Sprint 1-37 (zaten 5 satır özet) koru. Sprint 048-060 learnings'lerini özetle: her sprint için tek satır "Sprint X: GO_WITH_TECH_DEBT (N task)" formatında.

**B) DEBT.md Arşivleme:**
Resolved debt'leri (12+ kayıt) .brain/archive/DEBT-ARCHIVE.md'ye taşı. Sadece open debt'leri DEBT.md'de bırak.

**C) Decay Tetikleme:**
runDecay() fonksiyonunu çağır — resolved patterns, resolved debt, eski sprint logları arşivle.

**D) Budget Hedefi:**
591 → <450 satır hedef. Decay sonrası doctor'da "Brain Budget: X/600 lines" kontrolü PASS olmalı.

**Test:** 5+ test

---

## Task 6: Open Debt Cleanup (debt-059-008-fix) (P1)
- Model: sonnet
- Effort: high
- Files: src/mcp/tools/*.ts, src/mcp/helpers/enrich.ts
- Scope: src/mcp/, tests/mcp/

### Description
debt-059-008-fix: HIGH, Open=2, Resolved=false — MCP tools kalite.

**A) Enriched Response Doğrulama:**
16 MCP tool'un hepsinde `_enriched: { summary, hints[], timestamp }` pattern'ini doğrula. Eksik olanları ekle.

**B) Error Handling Tutarlılığı:**
Tüm tool handler'larda try/catch + anlamlı hata mesajları. Hata durumunda `{ error: true, message: "..." }` formatı.

**C) Input Validation:**
Zod schema ile input validation eksik olan tool'lara ekle (özellikle yeni 6 tool: config, usage, review, run, kill, cleanup).

**D) Debt Resolved İşaretle:**
Tüm fix'ler tamamlandıktan sonra DEBT.md'de debt-059-008-fix → Resolved=true, Fixed In=sprint-061.

**Test:** 8+ test

---

## Task 7: Framework Detection + Analyzer Fix (P2)
- Model: sonnet
- Effort: normal
- Files: src/core/analyzer.ts, src/core/stack-detector.ts
- Scope: src/core/, tests/core/

### Description
`deckent analyze` komutu framework="unknown" döndürüyor ama React dashboard mevcut (src/dashboard/).

**A) React Detection:**
analyzer.ts veya stack-detector.ts'de src/dashboard/ dizinini kontrol et. package.json veya vite.config.ts varsa framework="react" döndür.

**B) Analyzer → Stack-Detector Wrapper:**
analyzer.ts'in stack-detector.ts ile aynı işi yaptığı kısımları kaldır. analyzer.ts → detectProjectStack() çağırsın + ek git bilgisi eklesin.

**Test:** 5+ test

---

## Task 8: Remaining CLI Polish
- Model: sonnet
- Effort: high
- Files: src/cli/commands/history.ts, src/orchestra/sprint-reporter.ts, .deckent/agents/security-auditor/agent.json
- Scope: src/cli/, src/orchestra/, .deckent/, tests/

### Description
Dummy test'te tespit edilen P2 sorunlar:

**A) Duration Format Tutarlılığı:**
Retro: "31 minutes 8s" vs History: "31m 7s". Tek format kullan (kısa format: "31m 8s").

**B) History Type Consistency:**
tasks/completed/noGo alanları string yerine number olarak serialize et.

**C) Security-Auditor Trigger Scopes:**
triggerScopes: ["src/auth/"] → ["src/auth/", "src/api/", "src/middleware/"] (proje yapısına uygun).

**D) Agent Score Tiebreak:**
successRate=0 olduğunda deterministik sıralama: agent name alphabetical.

**E) Skill Selection Diversity:**
Aynı 3 skill sürekli seçilmesin — task scope'una göre farklı skill seti.

**Test:** 8+ test

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression (11,200+ test geçmeli)
- Agent activation: assignedAgent ≠ 'generic' en az 1 task'ta
- Agent stats: totalUses > 0 en az 1 agent'ta
- Brain budget: <500 satır
- Open debt: 0
- %100 GO hedefli
