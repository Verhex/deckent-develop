---
name: project-system-risk-inventory
description: "2026-05-26 derinleşme keşfinde tespit edilen 11 sistem riski (backend matrisi, multi-project isolation, MCP stale, recovery race, npm publish image gap, WrongStack pre-beta durum); öncelikli fix'ler Sprint 195+ planlanırken bu listeden seçilir."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kapsam:** Brain dishonest NO_GO ana keşfinin ortogonal alanlarında bulunan riskler. Adım 1 derinleşmesi (2026-05-26) çıktısı.

### Yüksek risk (pre-beta blocker adayı)

1. **Brain recovery sentetik NO_GO** — `sprint-checkpoint.ts:596-607`: stale EXECUTING → inline NO_GO writeFileSync, mid-write crash JSON corruption riski. **Sentetik NO_GO'nun 4. kaynağı.**
2. **MCP stale config → SPAWN_FAILED** — Long-running MCP process singleton state (config, model registry, memory store) stale kalır. Worker hiç çağrılmadan Brain "fail" yazar. **Sentetik NO_GO'nun 5. kaynağı.**
3. **npm publish Dockerfile.worker image push test edilmiyor** — `validate-publish` sadece binary test, image build/push otomasyonu yok. Kullanıcı `npm i -g deckent` sonrası worker image bulamayabilir.
4. **Multi-project container isim çakışması** — `deckent-w-${taskId}` projeler arası unique değil. İki paralel proje aynı sprint'te başlarsa Docker `--name` collision → ikinci spawn fail.
5. **Symlink scope bypass** — `isWithinScope()` realpathSync yapmıyor. ADR-034 Sprint 132 MEDIUM #10 hâlâ open. Security marketing claim ama implementation incomplete.
6. **Subprocess backend `.timeout` marker yazmıyor** — Brain infinite stall riski (sentetik NO_GO yazımı bile yapılamaz, sonsuz wait).

### Orta risk

7. **Brain crash + worker alive + recovery race** — `cleanOrphanIpcDirs` hanging PID dead göremez → concurrent spawn → file lock deadlock.
8. **SQLite wal-mode multi-process** — `.brain/memory.db-wal` lock contention test edilmedi (2 paralel proje aynı user'da).
9. **Credential encryption key project path'e bağlı** — AES-256-GCM key derivation project path hash'inden. Rename/move → decrypt fail → credentials lost.
10. **MCP server post-build restart automation yok** — CLAUDE.md gotcha bilinen, ama build hook'tan SIGHUP gönderecek mekanizma yok.
11. **`prepublishOnly` hook order** — docs:stats:check → docs:ref:check → build sırası (build docs üretirse check stale).

### Henüz hiç test edilmemiş

- macOS Docker Desktop osxfs fsync semantiği vs WSL2
- Cross-OS subprocess backend stall durumu
- Container'da Codex/Gemini install sonrası auth credentials pattern (mount vs env)
- `cursor-agent` CLI npm package adı + auth model'i
- `CI=true` ortam davranışı (GitHub Actions / CircleCI)
- 2 paralel proje aynı kullanıcıda sprint çalıştırırsa container/memory.db/lock isolation

### Pre-beta master plan W-A blocker durumu (WrongStack)

- ✅ **WS-Z1** (Coverage threshold) — FIXED: `vitest.config.ts:28-32` thresholds 82/89/80/82
- ⚠ **WS-Z2** (CHANGELOG backfill) — PARTIAL: son giriş Sprint 156, 30 sprint geride
- ⚠ **WS-Z3** (SECURITY.md) — INCOMPLETE: threat model yok, versiyon "0.1.x" hâlâ (`1.0.0-beta.1` olmalı)

### How to apply

- Sprint 195+ planlanırken bu listeden yüksek-risk maddesi(leri) seç
- Pre-beta scope için: 1, 2, 3 öncelikli (sentetik NO_GO kaynakları + publish blocker)
- 5 (symlink) security claim'i etkilediği için 1 Haziran beta'da disclosure olmazsa kötü PR
- 4 (container collision) tek-kullanıcı tek-proje pre-beta için low priority

İlgili: [[feedback_brain_synthetic_nogo_disk_verify]], [[feedback_container_auth_precedence]], [[project_deckent_core_model_and_provider]]
