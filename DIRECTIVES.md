# DIRECTIVES — Sprint 070: Init UX + Onboarding Overhaul

## Goal: Init komutunun oluşturduğu tüm dosyaları kullanıcı-dostu, stack-aware ve AI-native hale getir. DIRECTIVES.md şablonu, IDENTITY.md oluşturma fix, DECKENT.md workflow rehberi, worker rules stack-aware, tempSkill/tempAgent init'te oluşturma, .deckent/docs/ quick-start rehberi.

---

## Task 1: IDENTITY.md Oluşturma Fix + Stack Detection Zorunlu
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands/

### Description
KRİTİK BUG: DECKENT.md satır 486'da `@.deckent/workspace/IDENTITY.md` referansı var ama init bu dosyayı HİÇ OLUŞTURMUYOR. Sadece `.brain/PROJECT-IDENTITY.md` yazılıyor — dangling reference.

Düzeltmeler:

A) `.deckent/workspace/IDENTITY.md` dosyası init'te oluşturulmalı. İçeriği stack detection sonuçlarını kullanmalı:
```
# Project Identity
Name: {projectName}
Type: {detected type — web app, CLI, library, API, etc.}
Language: {language from detectFullStack}
Framework: {framework}
Test: {testFramework}
Build: {buildTool}
Runtime: {Node.js/Python/Go etc.}
Platform: {detected platform}
```

B) `options.auto` kontrolü kaldırılmalı — stack detection HER ZAMAN çalışmalı. Satır 679'daki `options.auto ? detectedAnalysis ?? analyzeProject(root) : undefined` → her zaman `analyzeProject(root)` çağrılmalı. "Language: unknown" kabul edilemez.

C) `detectFullStack(root)` sonucu zaten satır 477'de çağrılıyor — bu sonuç IDENTITY.md'ye de aktarılmalı (tekrar çağırmak yerine mevcut `stackForDeckent` değişkenini kullan).

**Kanıt:** `grep "IDENTITY" src/cli/commands/init.ts` → writeIfNotExists workspace IDENTITY satırı var

**Test:** 3+ test (IDENTITY.md oluşturuldu, stack bilgisi "unknown" değil, dangling reference yok)

---

## Task 2: DIRECTIVES.md Zengin Şablon
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands/

### Description
Mevcut DIRECTIVES.md şablonu (satır 665-667):
```
# Directives
Describe your project goals and architecture here.
Brain reads this before every sprint.
```
Bu KULLANIŞSIZ. Kullanıcı ne yazacağını bilmiyor.

Yeni şablon — stack-aware ve örnek task formatı içermeli. `detectFullStack` sonucuna göre dinamik:

```markdown
# DIRECTIVES — Sprint 001: İlk Sprint Hedefi

## Goal: Projenizin ilk sprint hedefini buraya yazın. Örnek: "Kullanıcı authentication sistemi ekle"

---

## Task 1: Örnek Task Başlığı
- Model: sonnet
- Effort: normal
- Skills: {stack'e göre: typescript-expert / testing-expert}
- Files: {stack'e göre örnek dosya yolları}
- Scope: src/

### Description
Task'ın ne yapacağını detaylı açıklayın.

**Kanıt:** `{stack'e göre test komutu}` → beklenen çıktı

**Test:** 3+ test

---

<!-- Bu dosyayı düzenleyerek sprint hedeflerinizi tanımlayın.
     Sonra: deckent plan → deckent start
     Detaylı format: .deckent/docs/directives-guide.md -->
```

Şablonu `language` değişkenine göre TR veya EN oluştur.

**Kanıt:** `cat DIRECTIVES.md` → örnek task formatı ve açıklama içeriyor

**Test:** 2+ test (TR şablon, EN şablon)

---

## Task 3: DECKENT.md Workflow + Rehber Ekleme
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands/

### Description
Init'te oluşturulan DECKENT.md'ye (satır 483-512) Workflow Guide ve DIRECTIVES Format Rehberi ekle. Deckent-dev'deki zengin DECKENT.md'yi referans al ama init'te oluşturulan versiyon daha kısa ve kullanıcı-odaklı olmalı.

Eklenecek bölümler (DECKENT.md içine, mevcut Rules ve Context arasına):

A) **Workflow** — 8 adım kısa açıklama:
```
## Workflow
1. `deckent init` — Projeyi başlat
2. `deckent set-directives` — Sprint hedeflerini yaz (DIRECTIVES.md)
3. `deckent plan` — Task'ları planla
4. `deckent start` — Worker'ları başlat
5. `deckent status` — İlerlemeyi izle
6. `deckent review` — Sonuçları değerlendir
7. `deckent retro` — Retrospektif oku
8. `deckent cleanup` — Temizle
```

B) **DIRECTIVES Format** — Kısa referans:
```
## DIRECTIVES Format
Her task şu yapıda olmalı:
## Task N: Başlık
- Model: opus/sonnet/haiku
- Effort: low/normal/high  
- Files: değişecek dosyalar
- Scope: izin verilen dizinler
### Description
Detaylı açıklama...
```

C) **Providers** — Hangi provider'lar kullanılabilir:
```
## Providers
- Claude (default), Codex (OPENAI_API_KEY), Gemini (GOOGLE_API_KEY)
```

Dil seçimine göre TR veya EN oluştur.

**Kanıt:** `grep "## Workflow\|## DIRECTIVES\|## Providers" DECKENT.md` → 3 yeni bölüm var

**Test:** 2+ test (workflow bölümü var, DIRECTIVES format bölümü var)

---

## Task 4: Worker Rules Stack-Aware
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands/

### Description
Worker rules (satır 659-662) şu anda hardcoded:
```
- Run tests before marking done (npx vitest run)
```

Bu TypeScript-specific. Python projesi için `pytest`, Go için `go test`, Rust için `cargo test` olmalı.

Düzeltme: `detectFullStack` sonucundaki `commands.test` ve `commands.lint` değerlerini worker rules şablonuna aktar:

```
- Run lint before marking done (${lintCmd})
- Run tests before marking done (${testCmd})
- Coverage goal: minimum 80%
```

Ayrıca brain.md'deki "max 200 lines" → "max 300 lines" ve "exceeds 600 lines" → "exceeds 900 lines" güncelle (memory budget artışı sprint-067'de yapıldı).

**Kanıt:** Python projede init → worker rules'da `pytest` görünmeli

**Test:** 3+ test (Python test komutu, default fallback, brain.md budget değerleri)

---

## Task 5: TempSkill + TempAgent Init'te Oluşturma
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/init.ts, src/orchestra/temp-skill-generator.ts
- Scope: src/cli/commands/, src/orchestra/

### Description
`generateProjectConventionsSkill()` ve `generateTempAgents()` zaten var ama init sırasında çağrılmıyor. İlk sprint öncesi kullanıcının elinde hiçbir proje-spesifik skill/agent yok.

Düzeltmeler:

A) Init'te stack detection sonrasında `generateProjectConventionsSkill()` çağır. Sonucu `.deckent/skills/project-conventions/` altına yaz:
- `manifest.json` — skill definition
- `SKILL.md` — generated content

B) Init'te `generateTempAgents()` çağır. Her agent için `.deckent/agents/{agent-id}/` altına yaz:
- `agent.json` — agent definition  

C) `temp-skill-generator.ts`'deki `generateProjectConventionsSkill()` fonksiyonu `ProjectAnalysisInput` bekliyor. `detectFullStack` sonucunu bu formata dönüştür. dependencies için package.json veya requirements.txt oku.

D) Eğer stack detection başarısız olursa (language=unknown), skill/agent oluşturma atlanmalı — sessizce devam et.

**Kanıt:** `ls .deckent/skills/project-conventions/manifest.json` → dosya var

**Test:** 4+ test (skill oluşturuldu, agent oluşturuldu, unknown stack → atlandı, manifest valid JSON)

---

## Task 6: .deckent/docs/ Quick-Start + Rehber
- Model: sonnet
- Effort: high
- Skills: typescript-expert, documentation-writer
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands/

### Description
Init'te `.deckent/docs/` dizini oluştur ve içine kullanıcı rehberleri yaz:

A) **quick-start.md** — 5 adımda ilk sprint:
```markdown
# Quick Start — Deckent ile İlk Sprint

## 1. Hedeflerinizi Yazın
DIRECTIVES.md dosyasını düzenleyin veya:
deckent set-directives "Authentication sistemi ekle"

## 2. Sprint Planlayın  
deckent plan

## 3. Çalışmaya Başlayın
deckent start

## 4. İlerlemeyi İzleyin
deckent status --watch

## 5. Sonuçları Değerlendirin
deckent review
deckent retro
deckent cleanup
```

B) **directives-guide.md** — DIRECTIVES format rehberi (DECKENT.md'deki detaylı versiyonun kopyası):
- Task formatı açıklaması
- Model/Effort/Skills/Files/Scope alanları
- Örnek DIRECTIVES (farklı proje türleri için)

C) **config-reference.md** — Tüm config.json ayarları:
- mode, language, max_workers, brain_provider, worker_provider
- routing_engine, spawn_backend, ai_planner_timeout
- Her ayırın açıklaması ve geçerli değerleri

Dil seçimine göre TR veya EN oluştur (language değişkeni).

**Kanıt:** `ls .deckent/docs/` → quick-start.md, directives-guide.md, config-reference.md

**Test:** 3+ test (3 dosya oluşturuldu, içerik boş değil, dil doğru)

---

## Task 7: BOOT.md Kullanıcı-Dostu Güncelleme
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands/

### Description
BOOT.md (satır 702) şu anda iç teknik süreç. Kullanıcıya yönelik değil. İki düzenleme:

A) BOOT.md'yi hem teknik hem kullanıcı-dostu yap:
```markdown
# Boot Sequence — Sprint Başlatma Süreci

Bir sprint başlatıldığında (`deckent start`) şu adımlar otomatik çalışır:

1. **Plan** — Brain DIRECTIVES.md'yi okur, task'ları planlar
2. **Spawn** — Worker'lar başlatılır (tmux veya subprocess)
3. **Execute** — Worker'lar task'ları uygular, heartbeat yazar
4. **Evaluate** — Brain sonuçları değerlendirir (GO / NO_GO / TECH_DEBT)
5. **Fix** — Başarısız task'lar yeniden denenir
6. **Retro** — Retrospektif yazılır (RETRO.md)
7. **Decay** — Bellek bütçesi kontrol edilir
8. **Cleanup** — Task dosyaları arşivlenir

> İpucu: `deckent status --watch` ile süreci canlı izleyebilirsiniz.
```

Dil seçimine göre TR veya EN.

**Kanıt:** `grep "İpucu\|Tip:" .deckent/workspace/BOOT.md` → kullanıcı ipucu var

**Test:** 1 test (BOOT.md kullanıcı ipucu içeriyor)

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression
- Her dosya değişikliği stack-aware olmalı — hardcoded TypeScript referansları kaldırılmalı
- Dil desteği: language='tr' → TR içerik, language='en' → EN içerik
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
