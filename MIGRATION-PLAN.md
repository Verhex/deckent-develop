# REPO-MIGRATION PLANI — deckent-develop → deckent (#488)

> **Durum:** F0 (hazırlık) — 2026-07-06. Sahip: CC + Alperen. Doğrulama-defteri:
> `docs/analysis/ground-truth-snapshot-2026-07-06.md`.
> **Keşif:** `/home/alperen/deckent` ZATEN hedef-reponun klonu (`VerhexIO/deckent`,
> tek commit `7058705` "v1.0.0-beta.1", 31 Mayıs) — staging-klasörü budur, yenisi açılmaz.

## Hedef-durum
1. `deckent-develop` → **read-only arşiv** (GitHub ayarı, Alperen).
2. `deckent` → **yalnız-kod** temiz ürün-reposu (doc'suz snapshot).
3. Tüm dokümanlar yeni repoda **koddan-doğrulanarak** yeniden yazılır (ground-truth defteri rehber).
4. Claude-memory yeni proje-yoluna taşınır.

## Taşınan (kod-seti — git-izlenen)
| Küme | İçerik |
|---|---|
| `src/` (1077 dosya) | Tüm runtime kodu (builtins PROMPT/SKILL.md'leri dahil — bunlar prompt-contract, doc değil) |
| `tests/` (2009) | Tüm test-aileleri |
| `scripts/` (94) | Build/lint/validate araçları |
| `.github/` (18) | CI workflow'ları |
| `examples/` (17), `extensions/` (6) | Örnekler + VS Code ext |
| `deckent-hub/` (65) | Hub skill'leri — **KARAR-4'e bağlı** |
| Kök-config'ler | package.json, package-lock.json, tsconfig*, vitest*, Dockerfile*, docker-compose.yml, .gitignore, .npmignore, .npmrc, .dockerignore, .lintlinkignore, .pre-commit-config.yaml, .secrets-baseline, LICENSE |
| Bootstrap-doc'lar | Minimal yeni README.md + minimal CLAUDE.md (yalnız çalışma-kuralları çekirdeği; tam docs F5'te yeniden yazılır) |

## Taşınmayan (develop'ta kalır)
- `docs/` (683 izlenen dosya — F5'te koddan yeniden yazılacak; ground-truth defteri kaynak)
- Kök .md'leri: README-TR, DECKENT.md, CHANGELOG, CONTRIBUTING, SECURITY, AGENTS/GEMINI,
  DIRECTIVES, DESIGN-*, DECKENT-TRIAGE-PLAN, deneme.md, ideas.md
- `.claude/ .codex/ .cursor/ .gemini/` kural-dosyaları (yeni repoda yeniden yazılır)
- `.analysis/`, `.brain/` (memory.db ASLA silinmez — develop'ta kalır; bkz KARAR-1),
  `.deckent/` (runtime — yeni repoda `deckent init/sync` üretir), `.tasks/`
- `docs/MASTER-PLAN.md` (develop'un canlı-defteri; kapanış-analiziyle mühürlenir)

## 🔑 Alperen karar-noktaları
1. **ADR-bilgisi (`.brain/memory.db`):** yeni repoya (a) DB-kopyası mı, (b) curated ADR-export mu
   (41 ADR md zaten `docs/adr`'de — F5'te yeniden yazım sırasında DB'ye re-import), (c) develop'ta mı kalır?
   **Öneri: (b)** — temiz-repo ilkesiyle uyumlu; ADR-md'leri kod-doğrulamalı taşınır, DB yeni repoda sıfırdan dolar.
2. **Git-tarihi:** tek-snapshot-commit (temiz, develop-tarihi sızmaz — **öneri**) vs history-taşıma.
3. **Read-only zamanlaması:** F4'te (push-doğrulama sonrası) — erken kilitleme loop'u durdurur.
4. **deckent-hub/** taşınsın mı? (ürün-parçası ise evet — **öneri: evet**)
5. **11 gerçek-ölü orphan** (`docs/analysis/orphan-deliverables-2026-07.md` §3) göç-ÖNCESİ silinsin mi?
   **Öneri: evet** — ölü-kod temiz-repoya taşınmaz.

## Fazlar
| Faz | İş | Sahip | Durum |
|---|---|---|---|
| **F0** | Envanter + bu plan + dry-run manifest (`migration-manifest.txt`) + secrets-kontrol (.deck git-dışı ✓, history taşınmadığından sızıntı-yüzeyi yok) | CC | ✅ 2026-07-06 |
| **F1** | Kod-sync: develop→`~/deckent` klonuna küratörlü kopya (manifest'le, rsync --delete-benzeri temiz-senkron) + bootstrap README/CLAUDE + eski-içerik temizliği | CC | ⬜ (375-kapanışı sonrası — ağaç sabitken) |
| **F2** | Yeni klonda doğrulama: `npm ci && npm run build:all && vitest (bölünmüş) && validate:publish` — develop'a hiç bakmadan yeşil olmalı | CC | ⬜ |
| **F3** | Claude-memory kopyası: `~/.claude/projects/-home-alperen-deckent-dev/memory/` → `-home-alperen-deckent/memory/` (index + topic'ler; yol-referansları güncellenir) | CC | ⬜ |
| **F4** | Commit+push (`VerhexIO/deckent`) → Alperen doğrular → develop **read-only** | Alperen | ⬜ |
| **F5** | Docs yeniden-yazım sprintleri (YENİ repoda; ground-truth P0→P1→P2 kuyruğu) | Loop | ⬜ |

## Güvenlik-notları
- `.deck` git-dışı ✓; snapshot-commit'te tarih taşınmadığından geçmiş-sızıntı riski yok.
- Push-öncesi F2'de `validate:publish` no_internal_state_leak gate'i ikinci-bekçi.
- Geri-dönüş: develop dokunulmadan kalır; `deckent` klonundaki eski tek-commit `7058705` tag'lenir.
