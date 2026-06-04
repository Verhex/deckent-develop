# Sprint Backlog — Ready-to-Run DIRECTIVES

Bu dizin, **Completion Roadmap** (MASTER-PLAN §10A) sprint'lerinin koşulabilir DIRECTIVES task tanımlarını tutar.

## Konvansiyon (gotcha: `deckent plan` tüm DIRECTIVES.md'yi okur)
- **Live `DIRECTIVES.md` (repo kökü) = o an koşulan TEK sprint.** Şu an: **Sprint 227 (S-INT — Brain-integrity fix, §4F)**. *(Sprint 226 autonomous KOŞTU+DONE → `.brain/archive/DIRECTIVES-sprint-226-autonomous-DONE.md`.)*
- **Backlog (bu dizin) = sıradaki sprint'ler**, hazır ama henüz koşulmuyor.
- **Geçmiş (`.brain/archive/`) = koşulmuş/eski sprint'ler** (gitignored, on-disk).

## Bir backlog sprint'ini koşmak (swap)
```bash
# 1. Mevcut live DIRECTIVES'i arşivle (koşulduysa) veya backlog'a geri koy
# 2. Hedef sprint'i live DIRECTIVES.md'ye taşı:
cp docs/sprints/<sprint>.md DIRECTIVES.md
# 3. commit (self-git-mutation güvenliği) → build:all + /mcp restart (kod değiştiyse)
# 4. WSL terminalinden:
deckent plan && deckent start
```

## Hazır backlog (Completion Roadmap §10A)
| Roadmap | Dosya | Alt-sistem | Maliyet | Durum |
|---------|-------|------------|---------|-------|
| **S1** | `.brain/archive/…226-autonomous-DONE.md` | Sprint 226 — Otonom Runtime (AS-6) | subs | ✅ **KOŞTU/DONE 7/7** |
| **S-INT** | `DIRECTIVES.md` (live) + `S-INT-brain-integrity.md` | Sprint 227 — Brain RETRO/export/decay fix (§4F, P0) | subs | ✅ **live, run-ready** |
| **S2** | `.brain/archive/DIRECTIVES-sprint-227-platform.md` | Sprint 227 — Platform/Dormant (AS-1) | subs | ✅ arşivde, swap-ready |
| **S3** | `S3-AS5-P1-mcp-client.md` | AS-5·P1 MCP-client broker+REPL+CLI | local/free | ✅ hazır |
| **S4** | `S4-AS4-P1-capability-layer.md` | AS-4·P1 Capability Realization Layer | subs | ✅ hazır |
| **S7** | `S7-AS3-P1-i18n-zerohardcode.md` | AS-3·P1 i18n catalog + zero-hardcode guard | subs | ✅ hazır |
| **S5** | _(TODO)_ | AS-2·P1 Ollama agentic-worker | local/free | hafta sonu Ollama sonrası |
| **S6** | _(TODO)_ | AS-1·ext hardening (Job-Object, worker-attach, RBAC-hard, 429-switch, cost-billing, auditor-async, docker-parallel, planDispatch) | subs | 21-task merge |
| **S8-S10** | _(TODO)_ | AS-5·P2/P3 + AS-4·P2/P3 + AS-2·P2-P4 | subs/API | sonraki fazlar |

Derin tasarımlar: MASTER-PLAN §4A (AS-2) · §4C (AS-5) · §4D (AS-4) · §4E (AS-3) · §4B map · §10A roadmap.
