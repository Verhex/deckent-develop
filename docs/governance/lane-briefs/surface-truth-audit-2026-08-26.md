# LANE-BRIEF — DESKTOP+TERMINAL SURFACE-TRUTH DERİN-AUDIT · lane/surface-audit-20260826

> Protokol: `docs/governance/parallel-lane-protocol.md` — ÖNCE eksiksiz oku, birebir uygula
> (sertleştirme dahil: ana-checkout'ta komut koşma; run/flow/sprint mutasyonu KESİN yasak).
> Şerit: Codex, salt-analiz. Emsal çıta: approval-surface audit (227/227, APR-001..009).

## 0. Kurulum
```
git -C /home/alperen/deckent-dev fetch origin
git -C /home/alperen/deckent-dev worktree add /tmp/deckent-lane-surface-audit -b lane/surface-audit-20260826 origin/main
cd /tmp/deckent-lane-surface-audit
```
Oturum-başı rebase, oturum-sonu push + LANE-STATUS.md (protokol §2/§5).

## 1. Görev — Desktop + Terminal yüzeylerinin kod-gerçeği denetimi

Kaynaklar (salt-oku): `src/desktop/**`, `src/cli/repl/**`, `src/dashboard/**` (karşılaştırma),
`src/api/server.ts` + `src/api/rpc-*` (surface-protokol tarafı), `src/extensions/vscode/**`,
`docs/design/DECKENT-DESKTOP-TERMINAL-NORTH-STAR.md` + `-RECONCILIATION.md` (owner-kabullü
hedef-doğrular), MASTER satırları 5000/6010/6020/6070/6120 (salt-oku bağlam).

### Exact doğrulama hedefleri
1. **Shell-ikiliği envanteri:** classic-shell vs NOVA-shell — hangi ekran/akış hangisinde,
   çakışan state/stil/komut var mı; file:line haritası.
2. **Embedded-terminal gerçeği:** Desktop içindeki terminalin nested-CLI durumu (child
   `deckent` süreci mi, in-process mi); same-runtime iddiasından sapmalar.
3. **Oturum/akış otoritesi:** Desktop chat-transcript'inin localStorage-authority durumu;
   `session.resume` unsupported ve pause→BLOCKED eşlemesinin bugünkü exact kod-yerleri.
4. **Protokol-yüzeyi boşluk-matrisi:** REST/SSE/WS/term-rpc karışımının bugünkü envanteri;
   el-aynalanmış TS tipleri; reconciliation §5-7 protocol/client sınırına aday exact seam'ler.
5. **Terminal (Ink REPL) kapsam-matrisi:** hangi canonical use-case'ler REPL'de var/yok;
   approval-card/at-ref gibi bileşenlerin decision-authority'ye bağlanma biçimi (APR-004
   side-entrance sınıfıyla kesişim — çapraz-referans ver, yeniden-bulgu ÜRETME).
6. **A11y/i18n taban-çizgisi:** iki yüzeyde hardcoded-string ve keyboard-only/focus
   ihlallerinin sınıf-bazlı sayımı (satır-satır liste değil, sınıf+örnek).

## 2. Çıktılar — `docs/audits/surface-truth-2026-08-26/`
SURFACE-INVENTORY.md (madde-1/2/5 matrisleri) · DRIFT-REGISTER.md (SRF-001… dedup,
severity + WorkID-bağı [5000/6010/6020/6070/6120] + exact file:line + önerilen-diff;
critic-geçişli) · PROTOCOL-SEAM-MAP.md (madde-4) · VERIFICATION.md · verify-artifacts.mjs
(fail-closed; MASTER'a satır-numarası PIN'leme — içerik-digest/WorkID kullan) · HANDOFF.md
(versioned receipt) · kök LANE-STATUS.md.

## 3. WRITE-ALLOWLIST
`docs/audits/surface-truth-2026-08-26/**` · `LANE-STATUS.md` — başka HİÇBİR yol yok.
Üretim değişikliği = FINDING. Deckent state/run mutasyonu ve canlı Desktop/daemon başlatma
YASAK (kod-analizi + en fazla read-only çıktı gözlemi; UI screenshot GEREKMEZ).

## 4. Teslim
Tek faz. Push + HANDOFF + tek-mesaj özet (digest'ler + bulgu-sayıları + madde-1..6 durum).
Admission ana-şeritte; sonrası worktree silinir, branch referans kalır (ledger'a işlenir).
