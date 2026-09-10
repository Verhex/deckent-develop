# Worktree temizliği ve devam haritası — 2026-09-10

UTC: 2026-09-10T10:32:52.055291+00:00. Owner yalnız işi bitmiş/gereksiz worktree ve tmp temizliğini istedi. Yeni ürün işi açılmadı.

## Yapılan temizlik

- 7 mevcut worktree kaldırıldı; farklı tracked ürün dosyaları main ile byte/digest düzeyinde eşleşti. Tasarım-only worktree için özgün iki proof dosyası arşivlendi.
- 65 diskte bulunmayan kayıt prune edildi; hepsinin HEAD commit’i main geçmişinde doğrulandı. Branch veya commit silinmedi.
- 33 boş test tmp dizini yalnız rmdir ile kaldırıldı. Dolu /tmp test/kanıt dizinleri topluca silinmedi.
- Kaldırılan worktree’lerde process cwd/exe/open-fd referansı görülmedi. İlgili değişiklik/proof/ignored dosyaları, binary diff ve HEAD metadata arşivlendi; arşiv içeriği byte düzeyinde doğrulandı. node_modules symlink hedefleri izlenmedi.
- memory.db içeren ağaçlar, ana runtime/auth ve .tasks içeriği korunuyor.

Arşiv: `/home/alperen/deckent-worktree-archives-20260910/`. Her worktree için `.tar.gz`, `.patch`, `.json`. Bunlar yerel kalıcı dizindedir; remote’a yedeklendiği iddia edilmez. Digest/exit kanıtı: [worktree-cleanup-20260910.json](worktree-cleanup-20260910.json).

| Kaldırılan worktree | Korunan arşiv |
|---|---|
| `/home/alperen/deckent-cursor-effect-diag` | `/home/alperen/deckent-worktree-archives-20260910/deckent-cursor-effect-diag.tar.gz` |
| `/home/alperen/deckent-cursor-receipt-t4` | `/home/alperen/deckent-worktree-archives-20260910/deckent-cursor-receipt-t4.tar.gz` |
| `/home/alperen/deckent-lane-archived-absence` | `/home/alperen/deckent-worktree-archives-20260910/deckent-lane-archived-absence.tar.gz` |
| `/tmp/claude-1000/-home-alperen-deckent-dev/07fc0ae1-e110-4816-9c56-e7e7d44be175/scratchpad/review-7108/base-f655` | `/home/alperen/deckent-worktree-archives-20260910/base-f655.tar.gz` |
| `/home/alperen/deckent-lane-7111` | `/home/alperen/deckent-worktree-archives-20260910/deckent-lane-7111.tar.gz` |
| `/home/alperen/deckent-lane-7111c` | `/home/alperen/deckent-worktree-archives-20260910/deckent-lane-7111c.tar.gz` |
| `/tmp/deckent-7113-design-astra-20260909` | `/home/alperen/deckent-worktree-archives-20260910/deckent-7113-design-astra-20260909.tar.gz` |

## Devam için öncelikli korunanlar

| Yol | İş / durum |
|---|---|
| `/home/alperen/deckent-dev` | Canonical main; yeni P0–P8 planı burada. Dirty envanter çözülmeden tüm çalışma ağacı HEAD ile eşit sayılmaz. |
| `/tmp/deckent-7107-schema-cursor-20260910` | Cursor acceptance collector/proof; son kaynak teslimi main’de, devam incelemesi ve özgün proof korunuyor. |
| `/tmp/deckent-7113-e-interim-opus-20260910` | Opus son D0/D1/D2 teslimi; D3/D4 başlamadı, yeni plan P5/P6 ile yeniden eşlenecek. |
| `/tmp/deckent-terminal-integration-astra-20260910` | Eski gerçek binary/benchmark config ve runtime kanıtı; memory.db var, silinmez. Normal güncel kullanım dizini olarak önerilmez. |
| `/home/alperen/deckent-cursor-7109c` | Teslim main’e taşındı; sonraki main değişiklikleri nedeniyle bütün dosyalar birebir değil. Parity incelemesi için korundu. |
| `/home/alperen/deckent-lane-7109d` | Retention teslimi ve geniş yerel proof/build farkları; kör silinmez. |
| `/tmp/astra-main-landing-backup-20260910` | Landing öncesi main yedeği; dirty çalışma çözülmeden silinmez. |

## Diğer korunan kayıtlar

Aşağıdaki farklar **yeni veya kayıp iş kanıtı değildir**: eski sürüm, superseded implementation, proof veya incelenmemiş içerik olabilir. Semantik diff/closure incelemesi yapılmadan silinmedi. İleride gerekli olanlar main üstündeki yeni scope’a alınmalı; eski patch’ler kör uygulanmamalı.

| Yol | Koruma nedeni |
|---|---|
| `/home/alperen/deckent-cursor-7105b` | 6 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-cursor-7107` | 22 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-cursor-7109` | 13 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-cursor-7109b` | 11 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-cursor-admission-t3` | 10 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-cursor-mcp-checkpoint` | 12 changed/untracked path; 2730 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-dev/.deckent/recovery-snapshots/7099-catalog-YLr6iwUC/checkout` | 13 changed/untracked path; 2759 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-dev/.deckent/recovery-snapshots/7099-status-1DleJjO4/checkout` | 5 changed/untracked path; 2 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-lane-7108` | 24 changed/untracked path; 1 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-lane-7110` | 21 changed/untracked path; 1 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-lane-7114` | HEAD main geçmişinde değil; ayrı branch korunuyor |
| `/home/alperen/deckent-lane-contain-hold` | 11 changed/untracked path; 2 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-lane-goal-custody-t1t2` | 36 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-lane-native-terminal-fable51-20260902` | memory.db/runtime korunuyor |
| `/home/alperen/deckent-lane-populate-race` | 8 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/home/alperen/deckent-release-0.100.0` | 1 changed/untracked path; 2301 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/claude-1000/-home-alperen-deckent-dev/07fc0ae1-e110-4816-9c56-e7e7d44be175/scratchpad/fanin-dry` | 8 changed/untracked path; 3 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7105-context-astra-20260909` | 68 changed/untracked path; 2726 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7106-preamble-astra-20260909` | 72 changed/untracked path; 2732 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7106-preamble-revised-20260909` | 93 changed/untracked path; 2732 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7107-c-astra-review-20260910` | 12 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7109c-astra-20260910` | 16 changed/untracked path; 2775 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7113-a-astra-20260909` | 23 changed/untracked path; 1 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7113-b-astra-20260909` | 130 changed/untracked path; 1322 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7113-c-astra-20260910` | 87 changed/untracked path; 2650 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7113-c-pin-opus-20260910` | 39 changed/untracked path; 0 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7113-d-opus-20260910` | 37 changed/untracked path; 2777 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7113-e-diag-opus-20260910` | 59 changed/untracked path; 2778 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7113-e-len-opus-20260910` | 64 changed/untracked path; 2778 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7113-e-schema-opus-20260910` | 82 changed/untracked path; 2658 ignored path — içerik/custody incelemesi gerekiyor |
| `/tmp/deckent-7114-b-opus-20260910` | 41 changed/untracked path; 2777 ignored path — içerik/custody incelemesi gerekiyor |

## Main ve build

Kontrolde local main `861b69feb`, gerçek remote main `aaf6bd681`: eşit değil; önceki plan commit’i push edilmemiş. Ayrıca LOCAL-UNCOMMITTED.md envanterindeki eski değişiklikler çalışma ağacında. Bu rapor için yeni docs commit’i oluşursa local fark artar.

Read-only build preflight exit0; admission HOLD: `E_CLEAN_BOT_ACTIVE`, telegram-bot OWNED, `.deckent/bot.pid`. `npm run build` NOT_RUN. Owner koşulu “main tamamen eşit ve güncelse” sağlanmadı. Bot durdurulmadı; tmp/worktree temizliği canlı botu durdurma yetkisi olarak yorumlanmadı.

Doğrulama: worktree remove exit0 (7), prune exit0, arşiv SHA ve içeriği PASS; kalan kayıt 37 (main dahil), prunable0. Ürün kodu/test değişmedi; yeni test/build koşusu yok.
