# Deckent — Sonraki Oturum Planı

> Bu dosyayı yeni Claude Code oturumunda prompt olarak ver.
> Önceki oturumun tüm context'i ve kararları burada.

---

## DURUM ÖZETİ

Routing Engine v2 tasarlandı ve implemente edildi. 3 commit yapıldı:
- `ca4a1f0` — Routing v2 core: 11 yeni modül, 180 test
- `e7447a9` — CI fix: 10 fail eden test düzeltildi
- `f3b73e6` — Entegrasyon: 8 ölü modül sprint-controller'a bağlandı

**Mevcut test durumu:** 469 dosya, 11,862 test, 0 fail. tsc temiz.

**Ama derinlemesine keşifte 15 yeni boşluk bulundu.** Bu adımları sırayla tamamla.

---

## KRİTİK KURALLAR (hafızadan — her zaman geçerli)

1. **Dosya yazmak ≠ tamamlandı.** Her değişiklik grep/test/runtime ile kanıtlanmalı.
2. **Test geçmesi ≠ çalışıyor.** Entegrasyon testi = sistem çalışıyor.
3. **Ölü kod = profesyonellik eksikliği.** Ya tam entegre et ya hiç yazma.
4. **Geçiştirme yok.** Bu MVP değil — global enterprise seviyede AI orkestrasyon aracı.
5. **Rakipler:** OpenClaw (337k star), Claude CoWork, Perplexity Computer, Devin.

---

## YAPILACAKLAR — Öncelik Sırasıyla

### P1 — Kritik (Önce bunlar)

#### ADIM A: Eksik Dosyalar — Oluştur + Entegre Et

**A1. `src/orchestra/prompt-token-optimizer.ts` (OLUŞTURULMADI)**
- V2 aktifken skill prompt'larını TaskDNA'ya göre filtrele
- `buildWorkerPrompt()` içinde V2 aktifken çağır (src/orchestra/task-builder.ts)
- Test: `tests/orchestra/prompt-token-optimizer.test.ts`
- Kanıt: `grep -n "prompt-token-optimizer" src/orchestra/task-builder.ts` → çağrı var
- orchestra/index.ts barrel'a ekle

**A2. `src/orchestra/ecosystem-intelligence.ts` (OLUŞTURULMADI)**
- Yeni skill yüklendiğinde otomatik activation rules üret
- `skill install` CLI komutunda çağır (src/cli/commands/skill.ts)
- Test: `tests/orchestra/ecosystem-intelligence.test.ts`
- Kanıt: `grep -n "ecosystem-intelligence\|analyzeNewSkill" src/cli/commands/skill.ts` → çağrı var

#### ADIM B: 20 Manifest — manifestVersion:2 + activation rules

Tüm agent.json ve skill manifest.json dosyalarına V2 alanları ekle.
Runtime migration var ama persist edilmiyor — her sprint gereksiz hesaplama.

**9 agent.json (.deckent/agents/*/agent.json):**
Her birine `"manifestVersion": 2` + `"activation"` kuralları ekle.

Örnek activation kuralları:
- security-auditor: `{ rules: [{ when: { "intent.primary": "security" }, score: 10 }], exclude: [{ when: { "intent.primary": "documentation" } }], minScore: 5 }`
- test-writer: `{ rules: [{ when: { "intent.primary": "testing" }, score: 10 }], exclude: [{ when: { "intent.primary": "documentation" } }], minScore: 5 }`
- bug-fixer: `{ rules: [{ when: { "intent.primary": "bugfix" }, score: 10 }], exclude: [], minScore: 5 }`
- doc-writer: `{ rules: [{ when: { "intent.primary": "documentation" }, score: 10 }], exclude: [{ when: { "intent.primary": "implementation" } }], minScore: 5 }`
- code-reviewer: `{ rules: [{ when: { "intent.primary": "refactor" }, score: 8 }], exclude: [], minScore: 5 }`
- refactorer: `{ rules: [{ when: { "intent.primary": "refactor" }, score: 10 }], exclude: [], minScore: 5 }`
- api-builder: `{ rules: [{ when: { "domains": { "$contains": "api" } }, score: 8 }], exclude: [], minScore: 5 }`
- performance-analyzer: `{ rules: [{ when: { "intent.primary": "performance" }, score: 10 }], exclude: [], minScore: 5 }`
- ci-guardian: `{ rules: [{ when: { "intent.primary": "devops" }, score: 10 }], exclude: [{ when: { "intent.primary": "implementation" } }], minScore: 5 }`

**11 skill manifest.json (.deckent/skills/*/manifest.json):**
Her birine `"manifestVersion": 2` + `"activation"` ekle.
**KRİTİK:** ci-testing skill'ine `exclude: [{ when: { "intent.primary": "implementation" } }]` ekle — bu konuşmanın başlangıç noktasıydı.

Kanıt: `for f in .deckent/agents/*/agent.json; do grep -q '"manifestVersion": 2' "$f" && echo "✅ $(basename $(dirname $f))" || echo "❌ $(basename $(dirname $f))"; done`

#### ADIM C: PlannerTask Interface Eksik Alanlar

`src/core/task-types.ts` — PlannerTask interface'e ekle:
```typescript
forceAgent?: string;
forceSkills?: string[];
excludeAgent?: string[];
excludeSkills?: string[];
```

`src/orchestra/task-builder.ts` — `plannerTaskToParams()` fonksiyonunda pass-through:
```typescript
forceAgent: pt.forceAgent,
forceSkills: pt.forceSkills,
excludeAgent: pt.excludeAgent,
excludeSkills: pt.excludeSkills,
```

#### ADIM E: Stale Heartbeat Pattern Root Cause

`.brain/PATTERNS.md`'de 2089 stale_heartbeat occurrence, 10 sprint boyunca çözülmemiş.
- tmux worker'lar heartbeat yazmadan çıkıyor olabilir
- MEMORY.md'de "tmux worker'lar kodu yazıyor ama .result bırakmadan çıkıyor" notu var
- Root cause analizi yap: `src/agents/worker.ts` heartbeat mekanizması, `src/orchestra/sprint-controller.ts` stale detection
- Subprocess backend bu sorunu çözüyorsa pattern'i resolved işaretle

---

### P2 — Önemli (P1'den sonra)

#### ADIM D: api-surface.md Contract Güncelleme

`.contracts/api-surface.md` Task JSON formatına 7 eksik alan ekle:
- forceAgent, forceSkills, excludeAgent, excludeSkills
- assignedAgent, assignedSkills, routingMeta

#### ADIM F: SprintState TypeScript Interface

`src/core/sprint-types.ts`'e ekle:
```typescript
export interface SprintState {
  id: string;
  branchName: string;
  commitSha: string;
  createdAt: string;
  wasClean: boolean;
}
```
`writeSprintState()` fonksiyonunu bu tipi kullanacak şekilde güncelle.

#### ADIM G: .deckent/usage/ Git Tracking

- `.gitignore`'a `.deckent/usage/` ekle
- `git rm --cached .deckent/usage/` ile tracked dosyaları kaldır
- Kanıt: `git ls-files .deckent/usage/ | wc -l` → 0

#### ADIM H: IDENTITY.md + CLAUDE.md Sayı Güncellemeleri

IDENTITY.md: Tests: 11,800+, Agents: 9, Skills: 11, Sprints: 65+
CLAUDE.md: core/: 49 modules, 9 built-in agents

Kanıt: `find src/core -name "*.ts" | wc -l` ve `ls .deckent/agents/ | wc -l`

#### ADIM I: Config Validation + Migration

`src/core/config.ts` validateConfig(): routing_engine ('v1'|'v2') doğrula
`src/core/config-migration.ts`: routing_engine default değer ekle

#### ADIM K: enrichScopeWithTestFiles AI Planner Path

`src/orchestra/sprint-controller.ts` — AI planner task oluşturma bloğunda
`plannerTaskToParams()` sonrası `enrichScopeWithTestFiles()` çağır.

---

### P3 — Kozmetik (P2'den sonra)

#### ADIM J: V1+V2 Paralel Çalışma Doğrulama

V2 aktifken V1 koduna girilmiyor mu doğrula.
`DECKENT_DEBUG=1` ile V2 modda `selectAgent` logu görünmemeli.

#### ADIM L: decision-engine.ts Durumu

`src/orchestra/decision-engine.ts` ve `decision-steps/` — ne yapıyor, kim kullanıyor?
`grep -r "decision-engine" src/ --include="*.ts"` ile analiz et.
Routing v2 ile çakışma varsa çöz.

---

## TAMAMLANINCA DOĞRULAMA

```bash
# 1. Derleme
tsc --noEmit

# 2. Testler
npx vitest run

# 3. Manifest kontrolü
for f in .deckent/agents/*/agent.json; do
  grep -q '"manifestVersion": 2' "$f" && echo "✅ $(basename $(dirname $f))" || echo "❌ $(basename $(dirname $f))"
done

# 4. Ölü kod kontrolü
for mod in outcome-tracker quality-assessor mid-sprint-adapter rule-evolver temp-skill-generator promotion-pipeline prompt-token-optimizer ecosystem-intelligence; do
  count=$(grep -r "import.*$mod\|from.*$mod" src/ --include="*.ts" | grep -v "$mod.ts" | grep -v "index.ts" | wc -l)
  [ "$count" -eq "0" ] && echo "❌ $mod — ölü kod" || echo "✅ $mod — $count import"
done

# 5. Contract uyumu (en az 6 eşleşme beklenir)
grep -c "forceAgent\|forceSkills\|excludeSkills\|routingMeta\|assignedAgent\|assignedSkills" .contracts/api-surface.md

# 6. Usage tracking (0 olmalı)
git ls-files .deckent/usage/ | wc -l

# 7. Stale heartbeat
grep "stale_heartbeat" .brain/PATTERNS.md
```

---

## ÖNCEKİ OTURUMDA YAPILAN ENTEGRASYON (referans)

Sprint-controller'da tamamlanan bağlantılar:

| Modül | Bağlantı Noktası | Durum |
|---|---|---|
| OutcomeTracker | planSprint (learning bonuses) + finalizeSprint (outcome kayıt) | ✅ Bağlı |
| QualityAssessor | finalizeSprint (quality score → outcome) | ✅ Bağlı |
| RuleEvolver | finalizeSprint 8d (kural evrimi) | ✅ Bağlı |
| PromotionPipeline | finalizeSprint 8e (promotion/demotion) | ✅ Bağlı |
| MidSprintAdapter | FIX phase (NO_GO reroute) | ✅ Bağlı |
| TempSkillGenerator | planSprint V2 (project-conventions skill) | ✅ Bağlı |
| V1 Stats | finalizeSprint (V2'de devre dışı) | ✅ Gated |
| Barrel Exports | core/index.ts + orchestra/index.ts | ✅ Güncel |

Commit'ler: ca4a1f0 → e7447a9 → f3b73e6 (push edilmedi — actions storage dolu, nisan'da sıfırlanacak)
