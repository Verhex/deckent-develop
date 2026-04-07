# Sprint 070-071 Retrospective

## Summary
Sprint 070: 8/8 tasks, 0 NO_GO — Init UX overhaul + 15 Windows dogfooding bug fix
Sprint 071: 8/8 tasks, 0 NO_GO — 7 runtime bug fix + upgrade --local + version bump

## What Went Well
- Vizetron dogfooding ilk gerçek sprint'i başarıyla tamamladı (PROJECT_ANALYSIS.md, 242 satır)
- 22 bug bulundu ve düzeltildi — 0 regression
- Stack-aware init: Python projede pytest/ruff/fastapi doğru algılanıyor
- Windows tam destek: spawn, heartbeat, log capture, encoding, ps guard
- `deckent upgrade --local` beta workflow'u kolaylaştırdı

## What Didn't Go Well
- Worker heartbeat sequence=1'de takılıyordu — subprocess backend periyodik update yoktu
- Doctor healthScore field mismatch (`ok` vs `passed`) — type safety eksikliği
- Review cleanup timing — task dosyaları review'dan ÖNCE siliniyordu
- Log dosyası Windows'ta boş — fd race condition (shell:true + closeSync timing)
- Scope parser explicit label'ları (`Files:`, `Scope:`) parse etmiyordu

## Key Learnings
- Windows subprocess: `shell: true` HER spawn/spawnSync çağrısında gerekli (.cmd wrapper)
- Heartbeat: Subprocess backend'de Claude CLI process heartbeat güncellemez — backend periyodik update yapmalı
- Empty string falsy: `if (value)` boş string için false — `!== undefined` kullan
- Review → cleanup sırası kritik: Task dosyaları cleanup'tan ÖNCE erişilebilir olmalı (archive fallback)
- Stack detection: JS framework detection dil guard'ı gerekli — aksi halde sub-project deps yanlış framework verir

## Metrics
| What | Value |
|------|-------|
| Total bugs found | 22 (Vizetron dogfooding) |
| Bugs fixed | 22 |
| Files changed | 21 |
| Lines added | ~1,100 |
| Test regression | 0 |
| Version | 0.2.0-beta.3 |

## Next Sprint Focus
- P1: Provider/tier generalizasyonu (performance/balanced/economic)
- P2: CHANGELOG + README güncellemesi
- P5: sprint-controller.ts god object split başlangıcı
