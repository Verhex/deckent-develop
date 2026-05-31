---
name: feedback-prompt-completeness-over-brevity
description: "Worker prompt'larında brevity (kısalık) için içerik kesme YASAK — Karpathy + ADR + Skills + tüm context full inject edilmeli; token cost prompt cache ile çözülür, kesme ile değil."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kural:** Worker prompt boyutu için **brevity (kısalık) optimization YASAK** — Karpathy 4-discipline, tüm relevant ADR, tüm skill prompt'ları, task description full inject edilmeli. **Token cost prompt cache ile çözülür** ([[feedback_worker_prompt_engineering_god_level]] WP-5 9× save kanıt), kesme ile değil.

**Why:** Prompt'tan içerik çıkarmak (Karpathy section'ı kısalt, ADR'lerin sadece bir kısmı, skill prompt'ları truncate) → worker discipline bozulur → NO_GO oranı artar. Sprint 182 W-F1..F8 worker prompt quality refactor öğrenimi: completeness > brevity.

**How to apply:**
- Worker prompt build (`task-builder.ts:buildWorkerPrompt`):
  * Karpathy 4-discipline FULL inject (Sprint 191 191-013)
  * Tüm relevant ADR'ler FULL inject (ADR-001..064, sprint context'ine göre)
  * Skill prompt'lar FULL (yalnız relevant olanlar, ama kısaltma yok)
  * Task description, scope, goCriteria, evidence command'lar FULL
- Token cost concern → Sprint 196 196-003 WP-5 Anthropic prompt cache wire (frozen section cache_control)
- Prompt cache hit → 9× cost save (Sprint 195 195-002-fix cacheReadTokens 85K kanıt)

**Anti-pattern:**
- "Karpathy section çok uzun, kısalt" → ✗ discipline tam inject
- "ADR'lerden sadece bu task'a relevant olanı" → ✗ tümü mandatory constraint, hepsi inject
- "Skill prompt'u özet versiyon yeter" → ✗ full pattern
- "Truncate to fit token budget" → ✗ prompt cache wire ile çöz

**Sprint 195 195-002-fix kanıt:**
```
inputTokens: 85000 (cacheReadTokens),  # 9× save
outputTokens: 4500
```

İlgili: [[feedback_worker_prompt_engineering_god_level]], [[project_karpathy_skill_discipline]]
