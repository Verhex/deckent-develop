# Analysis: src/agents/agent-retirement.ts
**Task ID:** 141-005-fix | **LoC:** 206

## 1. Amacı
Düşük performanslı agent'ları emekli eden sistem. successRate < %30, totalUses >= 10, sprintsParticipated >= 5 kriterlerini karşılayan temp/user agent'ları `.deckent/agents/.retired/`'a taşır. Built-in agent'lar emekli edilemez.

## 2. Public API (export listesi)
- `RetirementStats`, `RetirementConfig`, `RetirementResult`, `RetiredAgentRecord` interfaces
- `AgentRetirement` class (evaluateForRetirement, retire, reinstate, listRetired)

## 3. İç + Dış Bağımlılıklar
- `node:fs`, `node:path` — dosya I/O

## 4. Complexity
- Düşük — CRUD pattern, config merge

## 5. Type Safety
- `agentData.source as 'builtin' | 'user' | 'learned' ?? 'user'` — operator precedence riski: `as` cast önce, `??` sonra uygulanır. Değer undefined olduğunda 'user' fallback çalışır ama as cast önceden yapılmış. Potansiyel yanlış davranış.
- `agentData.stats as Record<string, unknown>` — cast zincirleri; biraz kırılgan

## 6. ADR Compliance
- ADR-006/008: OK — spawn yok.

## 7. Test Coverage
- `tests/agents/agent-retirement.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- Yok.

## 9. Dead Code Candidates
- `reinstate` — aktif çağrıcı var mı belirsiz. CLI komutunda kullanılıyor olabilir.

## 10. Security Findings
- `fs.rmSync` ile dizin silme — recursive:true ile — sadece `.retired/` altında ✓

## 11. Memory V2 Uyumu
- Dosya-tabanlı — DB'ye taşınma adayı değil.

## 12. Öneriler
- `agentData.source as ... ?? 'user'` satırını düzeltin: `(agentData.source as string | undefined) ?? 'user'`

## 13. Verdict: ANALYZED
