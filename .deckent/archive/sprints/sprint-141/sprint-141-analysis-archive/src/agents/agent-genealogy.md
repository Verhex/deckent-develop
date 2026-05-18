# Analysis: src/agents/agent-genealogy.ts
**Task ID:** 141-005-fix | **LoC:** 187

## 1. Amacı
Agent'lar arasındaki parent-child ilişkilerini takip eden genealoji sistemi. `.deckent/agents/genealogy.json` dosyasına yazıp okur. Ağaç gezintisi, ortak ata bulma, torun listeleme gibi operasyonlar sağlar.

## 2. Public API (export listesi)
- `GenealogyNode` interface
- `FamilyTree` interface
- `AgentGenealogy` class (registerAgent, removeAgent, buildFamilyTree, findCommonAncestor, getDescendants, getChildren, getParent, hasAgent)

## 3. İç + Dış Bağımlılıklar
- `node:fs`, `node:path` — dosya I/O

## 4. Complexity
- BFS algoritması `getDescendants` için, DFS benzeri `_getAncestorChain` için
- Potansiyel sonsuz döngü riski: `_getAncestorChain` visited set var — sonsuz döngü korunmalı ✓

## 5. Type Safety
- `raw as Record<string, GenealogyNode>` JSON cast — kaçınılmaz
- `any` yok

## 6. ADR Compliance
- ADR-006: spawn yok. OK.
- Dosya I/O: `node:fs` direct — DB-first kapsamı dışında (genealogy özel dosya)

## 7. Test Coverage
- `tests/agents/agent-genealogy.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- Yok.

## 9. Dead Code Candidates
- `findCommonAncestor` — MCP/CLI'da kullanılıyor mu? Belirsiz.

## 10. Security Findings
- JSON parse safe try/catch ✓
- `.deckent/agents/` scope içinde yazma — ok.

## 11. Memory V2 Uyumu
- Genealogy özel alan — DB'ye taşınma adayı değil şu an.

## 12. Öneriler
- Genealogy'yi SQLite'a taşımak node sayısı artarsa avantajlı olabilir.

## 13. Verdict: ANALYZED
