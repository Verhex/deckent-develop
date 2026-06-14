# Agents — Dikey Uzmanlar, Görev Yönlendirme Motoru

> Deckent'in 15 yerleşik agent'ı, her görevi en uygun uzmana otomatik olarak yönlendirir — tek satır konfigürasyon gerekmez.

## Ne işe yarar?
- Bir görev oluşturulduğunda Brain, aktivasyon kurallarını değerlendirip en yüksek skorlu agent'ı seçer.
- Her agent **dikey** uzman: kendi alanında derin bilgi + sistem promptu taşır.
- Agent seçimi model seçiminden bağımsızdır — aynı agent farklı modellerde çalışabilir.
- Persistent agent'lar `.deckent/agents/` altında JSON + PROMPT.md ile tanımlıdır.
- LRU eviction: temp agent'lar 50 sınırına ulaşınca en eski kullanılmayanlar atılır.

## Neden önemli?
- Görev-agent eşleşmesi otomatik olduğundan kullanıcı her seferinde hangi uzmanın çağrılacağını düşünmek zorunda kalmaz.
- Öğrenen sistem: her sprint sonrası `successRate` ve `avgCoverage` güncellenir; daha başarılı agent'lar yüksek öncelik kazanır.
- ADR-041: "Agents are vertical, skills are horizontal" — net rol ayrımı, çakışma yok.

## Nasıl çalışır?
- **Aktivasyon motoru:** Her agent `activation.rules[]` bloğu taşır; kural `when` koşuluna skor atanır.
- **Skor yarışması:** Görevin TaskDNA'sı tüm agent kurallarına karşı değerlendirilir; en yüksek skor kazanır.
- **Intent örnekleri:**
  - `security-auditor`: `intent.primary === "security"` → 10 puan
  - `api-builder`: `domains.$contains("api")` → 8 puan
  - `refactorer`: `intent.primary === "implementation"` → 7 puan (genel kod görevleri)
- **Fallback:** Eşleşme yoksa `generic` agent devreye girer.

## Komut / Örnek

```bash
# Tüm agent'ları listele (CLI)
deckent agent list

# Örnek çıktı:
# Name                  Type     Status    Uses  Success  Model
# Security Auditor      builtin  enabled   142   91%      opus
# API Builder           builtin  enabled   287   88%      sonnet
# Refactorer            builtin  enabled   201   85%      sonnet
# Doc Writer            builtin  enabled   176   94%      sonnet
# ...

# JSON çıktısı
deckent agent list --json

# Belirli bir agent hakkında detay
deckent agent info security-auditor
```

**MCP eşdeğeri:**
```
deckent_agent_list → { root: "/projem" }
```

## Durum
- Olgunluk: ✅ canlı (15 built-in + 2 custom temp, kaynak: `.deckent/agents/` + `BUILTIN_AGENT_DOMAINS` in `src/core/agent-pool.ts`)
- İlgili: ADR-041 · ADR-072 (multi-signal scoring) · `src/core/agent-pool.ts` · `src/orchestra/task-router.ts`

---

### Yerleşik Agent Kataloğu (15 built-in)

| Agent | Uzmanlık | Aktivasyon (trigger keywords) |
|-------|----------|-------------------------------|
| `security-auditor` | OWASP, auth, vuln analizi | security / auth / jwt / csrf / xss |
| `doc-writer` | README, JSDoc, API docs | docs / readme / jsdoc / documentation |
| `bug-fixer` | Hata ayıklama, regression | fix / bug / error / crash / regression |
| `code-reviewer` | Kalite, best practices | review / refactor / quality / lint |
| `refactorer` | Yeniden yapılandırma, temizlik | refactor / rename / extract / split |
| `api-builder` | REST, OpenAPI, endpoint | api / endpoint / route / controller |
| `performance-analyzer` | Profiling, optimizasyon | performance / optimize / speed / memory |
| `ci-guardian` | CI/CD, test regresyon | ci / test / build / lint / regression |
| `architect` | Sistem tasarımı, bağımlılık | architecture / design / module / dependency |
| `architecture-planner` | ADR yazımı, yol haritası | architecture / design / blueprint / refactor |
| `accessibility-auditor` | WCAG, a11y | accessibility / a11y / wcag / aria |
| `data-engineer` | Pipeline, ETL, veri modeli | database / schema / query / sql / migration |
| `devops-engineer` | CI/CD, Docker, deployment | docker / ci / cd / pipeline / deploy |
| `frontend-designer` | UI/UX, component | component / layout / responsive / css / tailwind |
| `migration-specialist` | Framework migration | migrate / migration / upgrade / breaking-change |
