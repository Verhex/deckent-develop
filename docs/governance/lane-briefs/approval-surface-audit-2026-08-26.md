# LANE-BRIEF — APPROVAL-SURFACE DERİN-AUDIT · lane/approval-audit-20260826

> Protokol: `docs/governance/parallel-lane-protocol.md` — ÖNCE eksiksiz oku ve birebir uygula.
> Şerit sahibi: Codex (salt-analiz; ÜRETİM KODU DEĞİŞTİRİLMEZ). Ana-şerit: Claude.
> Emsal kalite çıtası: config-completion audit (branch `audit/config-completion-20260825`,
> koruma-commit `d2e9a1247`) — aynı derinlik, aynı dürüstlük, aynı doğrulanabilirlik.

## 0. Kurulum (worktree'ni KENDİN aç — protokol §2)

```
git -C /home/alperen/deckent-dev fetch origin
git -C /home/alperen/deckent-dev worktree add /tmp/deckent-lane-approval-audit -b lane/approval-audit-20260826 origin/main
cd /tmp/deckent-lane-approval-audit
```

Her oturum başı: `git fetch origin && git rebase origin/main` (çakışırsa DUR, raporla).
Her oturum sonu: commit (`lane(approval-audit): …`) + `git push -u origin lane/approval-audit-20260826`
+ `LANE-STATUS.md` güncelle.

## 1. Görev — approval/decision yüzeyinin uçtan-uca kod-gerçeği denetimi

Konu evreni: onay/karar üreten ve tüketen HER yüzey. Ana kaynaklar (salt-oku):
`src/core/approval-*.ts` (broker, rules-engine, decision-ingress/authority/federation),
`src/orchestra/approval-decision-federation.ts`, `src/mcp/tools/{approvals,checkpoint,autonomous}.ts`,
`src/cli/commands/{approvals,checkpoint,autonomous}.ts`, `src/api/server.ts` approvals/checkpoint
route'ları, connector relay'leri (telegram/slack/teams kartları), VS Code decide uçları,
`src/core/{cost,prompt,scope}-gate.ts` ack-akışları, pairing/runflow-consent, nervous onay köprüsü.
Bağlam-satırları (MASTER'dan salt-oku): 4050, 4053, 4054, 4056 (D-serisi durumu), 4060, 475,
4130, 4210; config-audit CFG-004/017 bulguları.

### Özel doğrulama hedefleri (bunlar exact cevap ister)
1. **4050 açık-residual'ının disk-hükmü:** config-audit "API approvals GET'i expiry/policy
   transition'ı read sırasında persist ediyor" dedi; 4056-D4 discovery-purity pending-read'i
   saf-projection yaptı. API route'ları DAHİL bugün read-yolunda HERHANGİ bir state-mutasyonu
   kaldı mı? file:line ile kanıtla (kaldıysa exact yol, kalmadıysa kapanış-kanıtı).
2. **Checkpoint bypass'ının güncel yüzölçümü** (CFG-004): CLI/MCP checkpoint approve/reject
   bugün hâlâ doğrudan JSON mu mutate ediyor; federation-seam'e
   (`approval-decision-federation.ts:590-602` sınıfı) bağlanma maliyeti/dokunuş-haritası ne?
3. **Karar-üreticisi envanteri:** 4056 başlığındaki 10+ üretici sınıfının (cnf-, nervous+panic,
   autonomous-trigger, checkpoint, gate-ack'ler, bot act-park, runflow-consent,
   gateway-pairing, settlement-review) HER biri için bugün: broker'a bağlı mı / legacy mi /
   origin-zarfı + riskTier taşıyor mu / TTL-disposition'ı var mı — tek matris.
4. **MCP read-only sınırının negatif-kanıtı:** MCP üzerinden protected allow/deny/decide
   üretebilecek HERHANGİ bir dolaylı yol var mı (isim-değiştirmiş tool, capability sızıntısı)?
5. **Rules-engine + kanal-authenticator'larının** sökülebilirlik/fail-closed iddialarının
   kod-doğrulaması (D2b-2a/D3 mühürlerindeki davranışlar hâlâ yerinde mi — drift?).
6. **TTL/SLA (D4) kapsam boşlukları:** süresiz-pending üretebilen kalan sınıf var mı?

## 2. Çıktılar (hepsi WRITE-ALLOWLIST içinde)

`docs/audits/approval-surface-2026-08-26/` altında:
- `SURFACE-MATRIX.md` — üretici×kanal×zarf×TTL×audit-receipt matrisi (madde-3'ün tablosu)
- `DRIFT-REGISTER.md` — dedup bulgular (APR-001…), severity + product-disposition +
  exact file:line + ana-şeridin uygulayacağı önerilen diff; critic-geçişli (zayıf iddia taşınmaz)
- `COMPLETION-PLAN.md` — mevcut MASTER satırlarına closure-dilimi bağlama planı (YENİ satır
  önerme; owner-admission gereken şeyi ayrı listele)
- `VERIFICATION.md` — yöntem + koşulan komutlar + HOLD listesi (koşamadığını dürüst yaz)
- `verify-artifacts.mjs` — fail-closed öz-doğrulayıcı (dosya varlığı + sayımlar + digest'ler);
  **ders:** MASTER'a satır-numarası PIN'leme (main ilerleyince kırılıyor) — satır-içeriği
  digest'i veya WorkID-referansı kullan
- `HANDOFF.md` — versioned receipt (baseSha/headSha/digest'ler/openActions)
- Kök: `LANE-STATUS.md`

## 3. WRITE-ALLOWLIST (tek istisna yok)
- `docs/audits/approval-surface-2026-08-26/**` · `LANE-STATUS.md`
YASAK: `src/**`, `tests/**`, `scripts/**`, `package.json`, `docs/MASTER-PLAN.md`, diğer docs/**,
`.deckent/**`, `.brain/**`, DIRECTIVES.md, lab/**. Üretim değişikliği ihtiyacı = FINDING (exact
diff önerisiyle), edit ASLA. Deckent sprint/run/state mutasyonu YASAK; canlı onay/karar üretme
(approvals decide / checkpoint approve) YASAK — salt-okuma + kod-analizi + en fazla read-only
CLI çıktısı gözlemi.

## 4. Teslim
Tek fazlı (analiz). Bitince: push + HANDOFF + tek-mesaj özet (digest'ler + bulgu sayıları +
madde-1..6 exact cevap durumu). Admission ana-şerittedir; admission sonrası bu worktree
protokol §2 gereği silinir (branch origin'de yaşar).
