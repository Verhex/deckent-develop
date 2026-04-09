# DIRECTIVES — Sprint 128: Litmus Testi — Sprint 127 Düzeltme Doğrulaması

## Goal: Sprint 127'de ELLE yapılan 7 kritik düzeltmenin Deckent sprint mekanizmasıyla çalıştığını doğrula. Worker'lar tsc/vitest çalıştırabilmeli, FIX fazı gereksiz tetiklenmemeli, metrics doğru olmalı, stale heartbeat false positive olmamalı.

---

## Task 1: Worker Verify Loop Smoke Test
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: test-writer
- Files: tests/smoke/verify-loop-smoke.test.ts
- Scope: tests/smoke/, tests/, src/orchestra/

### Description
Worker'ın `tsc --noEmit` ve `npx vitest run` komutlarını çalıştırabildiğini doğrula.

1. `tests/smoke/verify-loop-smoke.test.ts` oluştur ve şu testleri yaz:
   - `buildWorkerPrompt()` çıktısında `tsc --noEmit` string'i bulunduğunu doğrula (import: `../../src/orchestra/task-builder.js`)
   - `buildWorkerPrompt()` çıktısında `npx vitest run` string'i bulunduğunu doğrula
   - `buildWorkerPrompt()` çıktısında `CRITICAL VERIFY STEPS` bölümü bulunduğunu doğrula
   - Prompt'ta eski `run the project lint command` ifadesi OLMAMALI (negative test)
   - buildWorkerPrompt() için minimum Task objesi oluştur: `{ id: 'test-001', title: 'Test', description: 'Test task', model: 'sonnet', effort: 'normal', status: 'PENDING', scope: { directories: ['src/'], filesRead: [], filesWrite: [] }, dependencies: [], sprintId: 'sprint-test', createdAt: new Date().toISOString() }` — eksik alanlar varsa types.ts'den kontrol et

2. `tsc --noEmit` çalıştır → temiz olmalı
3. `npx vitest run tests/smoke/verify-loop-smoke.test.ts` çalıştır → geçmeli

**Kanıt:** `npx vitest run tests/smoke/verify-loop-smoke.test.ts` → tüm testler geçer
**Test:** 4 test (prompt contains tsc, prompt contains vitest, prompt contains CRITICAL VERIFY, prompt NOT contains old lint)

---

## Task 2: Promotion Pipeline Guard Doğrulaması
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: test-writer
- Files: tests/orchestra/promotion-guard.test.ts
- Scope: tests/orchestra/, tests/, src/orchestra/

### Description
Built-in agent'ların promotion/demotion pipeline'dan atlandığını doğrula.

1. `tests/orchestra/promotion-guard.test.ts` oluştur ve şu testleri yaz:
   - Test setup: `mkdtempSync` ile geçici projectRoot oluştur. `.deckent/agents/test-builtin/agent.json` dosyası yaz: `{ "id": "test-builtin", "name": "Test Builtin", "source": "builtin", "enabled": true }`
   - `PromotionPipeline.promote('test-builtin', 'agent')` → `false` dönmeli (built-in skip)
   - `PromotionPipeline.demote('test-builtin', 'agent')` → `false` dönmeli (built-in skip)
   - Temp agent için promote çalışmalı: `.tasks/agents/temp-my-agent/` dizini oluştur, agent.json yaz (source: 'temp'), `promote('my-agent', 'agent')` → `true` dönmeli. Sonra temizle.
   - Import: `import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js'`
   - afterEach'de geçici dizini temizle: `rmSync(tmpDir, { recursive: true, force: true })`

2. `tsc --noEmit` çalıştır → temiz olmalı
3. `npx vitest run tests/orchestra/promotion-guard.test.ts` çalıştır → geçmeli

**Kanıt:** `npx vitest run tests/orchestra/promotion-guard.test.ts` → tüm testler geçer
**Test:** 3+ test (promote skip builtin, demote skip builtin, promote works for temp)

---

## Task 3: Sprint Controller İkili Spawn Prevention Testi
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: test-writer
- Files: tests/orchestra/spawn-prevention.test.ts
- Scope: tests/orchestra/, tests/, src/orchestra/

### Description
spawnWorkers() fonksiyonunun backend verildiğinde SADECE backend kullandığını doğrula.

1. `tests/orchestra/spawn-prevention.test.ts` oluştur ve şu testleri yaz:
   - `vi.mock('../../src/orchestra/sprint-controller.js')` ile spawnWorkers'ı mock'lamak yerine, sprint-controller.ts'in kaynak kodunu oku ve `spawnWorkers` fonksiyonunun if/else yapısını doğrula:
     - Kaynak kodda `if (backend)` ilk koşul olmalı (adapter'dan önce)
     - `else if (!isTmuxProvider(taskProvider))` ikinci koşul (adapter path)
     - `else` son koşul (legacy tmux)
   - VEYA: spawnWorkers'ı doğrudan test et — minimal Sprint ve Task mock'ları ile:
     - Mock SpawnBackend: `{ name: 'mock', spawn: vi.fn(), kill: vi.fn(), list: vi.fn(() => []), isAvailable: vi.fn(async () => true) }`
     - `spawnWorkers(projectRoot, sprint, config, { spawnBackend: mockBackend })` çağır
     - `mockBackend.spawn` çağrılmış olmalı
     - Eski tmux `spawnWorker` fonksiyonu çağrılmamış olmalı (vi.mock ile mock'la)
   - İKİNCİ yaklaşımı tercih et — runtime davranış testi daha güvenilir

2. `tsc --noEmit` çalıştır → temiz olmalı  
3. `npx vitest run tests/orchestra/spawn-prevention.test.ts` çalıştır → geçmeli

**Kanıt:** `npx vitest run tests/orchestra/spawn-prevention.test.ts` → tüm testler geçer
**Test:** 3+ test (backend spawn called, legacy NOT called when backend exists, adapter NOT called when backend exists)

---

## Quality Rules
- `npx tsc --noEmit` temiz olmalı
- `npx vitest run tests/smoke/` geçmeli
- `npx vitest run tests/orchestra/promotion-guard.test.ts` geçmeli
- `npx vitest run tests/orchestra/spawn-prevention.test.ts` geçmeli
- FIX fazı tetiklenmemeli — tüm testler ilk seferde geçmeli
- Yeni dosyalar oluşturulacak — mevcut dosyalar DEĞİŞTİRİLMEMELİ
