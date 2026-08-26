# Lane/Audit Branch Ledger — karışıklık-önleme kaydı

> Owner talebi 2026-08-26: yan-şerit branch'leri sonradan unutulup kafa karıştırmasın,
> kayıp yaşanmasın. Bu ledger her yan-şerit/audit branch'inin NE olduğunu, NEREDE
> yaşadığını ve İŞ Mİ / REFERANS MI olduğunu kayıt altında tutar. Yeni lane açılış ve
> admission'larında güncellenir (parallel-lane-protocol §6 kapanış-adımı).

| Branch | Origin | Durum | İçerik / nerede erimiş | İş mi? |
|---|---|---|---|---|
| `lane/descriptor-registry-20260826` | ✓ | **ADMITTED-KAPALI** (Faz-A 2026-08-26 + Faz-B aynı gün; bağımsız 20/20 eşitlik) | Analiz `docs/audits/descriptor-registry-2026-08-26/`, prototip `lab/descriptor-registry/` (branch'te); MASTER-eritme satır 470 evidence | HAYIR — referans-kanıt; G1B ürünleştirme-dalgasının şablonu. Ürünleştirme ayrı owner-onaylı dalga |
| `lane/approval-audit-20260826` | ✓ | **ADMITTED-KAPALI** (2026-08-26; validator 227/227, allowlist %100) | APR-001..009 korpusu branch'te `docs/audits/approval-surface-2026-08-26/`; MASTER-eritme 4050/4054/4056/4130/475/4210/6120 | HAYIR — referans-kanıt; 4056-D5 uygulama-dalgalarının exact-diff girdisi |
| `audit/config-completion-20260825` | ✓ (2026-08-26 push'landı — kayıp-önleme) | **ADMITTED-KAPALI** (2026-08-26 admission-turu; 24 bulgu → 23 satır) | Korpus branch'te `docs/audits/config-completion-2026-08-25/`; kalıcı memo `docs/archive/evidence-2026-08/config-completion-audit-2026-08-26.md` | HAYIR — referans-kanıt |
| `agent/design-lane` | ✗ (yalnız-lokal) | **MERGED-main** (`6935f255c`; worktree 2026-08-26 silindi) | Design-skill paketi + desktop/terminal operating-model'leri main'de; kararlar `docs/design/` | HAYIR — branch silinebilir (owner-onayıyla) |
| `codex/cli-surface-truth` | ✗ (yalnız-lokal) | MERGED-main; worktree `/tmp/deckent-cli-surface-truth` hâlâ diskte | İçeriği main'de | HAYIR — worktree+branch temizlik-adayı (owner-onayıyla) |
| `agent/dev-operating-contract` | ✓ | MERGED-main; worktree `.claude/worktrees/` altında duruyor | Operating-policy işi main'de | HAYIR — worktree temizlik-adayı |

## Kayıp-riski listesi (YALNIZ-LOKAL + main-dışı — owner-disposition bekler)
`backup/pre-recommit-20260802` · `feat/docs-json-ai-author` · `goal/release-gate-truth` ·
`master` (muhtemel artık) · `train-2026-08-08-g`. Bunlar bu turda push'lanmadı (çöp-olasılığı
remote-karışıklığı yaratmasın diye); owner "push'la" derse tek komutla kalıcılaştırılır,
"sil" derse silinir.

## Kurallar (tekrar)
- Admission bitince worktree SİLİNİR, branch origin'de yaşar (protokol §2) — silme veri kaybetmez.
- Bu ledger'da **İş mi? = HAYIR** olan hiçbir branch gelecekte "bekleyen iş" sanılmaz;
  bekleyen işin tek otoritesi `docs/MASTER-PLAN.md`dir.


## 2026-08-26 büyük-temizlik kaydı (owner emri: "maine merge bekleyen yoksa hepsini silelim")
- SİLİNDİ (lokal, 62 branch): agent/design-lane · codex/cli-surface-truth ·
  agent/dev-operating-contract · fix/postmerge-main-truth-closure · goal/m1-graceful-budget-landing ·
  sp1-native-agent-finish · backup/pre-recommit-20260802 · feat/docs-json-ai-author ·
  goal/release-gate-truth · master · checkpoint/d16-approval-20260720 · train-2026-08-* (51 adet).
  Tüm tip-SHA'ları temizlik-anında kaydedildi (scratchpad branch-tips; reflog ~90 gün kurtarma-penceresi).
- KALDIRILAN worktree'ler: .claude/worktrees/agent+dev-operating-contract ·
  /tmp/deckent-cli-surface-truth · /tmp/deckent-competitive-watch-analysis (hatalı-session artığı,
  yalnız analysis-output untracked'ı vardı; teslimi zaten relay edilmişti).
- **HOLD — recovery/d4-609:** worktree'sinde 116 değişik dosya (işlenmemiş gerçek iş olabilir,
  API/approval yüzeyleri) — owner-incelemesi olmadan SİLİNMEDİ.
- **Origin-silmeleri TAMAMLANDI (owner-eliyle, 2026-08-26):** 53 origin-branch silindi
  (train-* 50 + agent/dev-operating-contract + fix/postmerge-main-truth-closure +
  checkpoint/d16-approval-20260720); lokal remote-ref'ler prune'landı.
- KORUNAN: main · release/0.100.0-rebaseline · lane/approval-audit · lane/descriptor-registry ·
  audit/config-completion (üçü referans-kanıt, İş-değil) · recovery/d4-609 (HOLD).
