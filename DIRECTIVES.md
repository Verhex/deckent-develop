# DIRECTIVES — D3+DE3 DALGA-5 (T11+T12; codex; 2026-08-21)

## Goal

D3 son kod-dalgası: VS Code istemci-ucu + governance-kapanışları. Dalga-2
dersi geçerli (görev-Test'inde tsc yok). Prose'da dosya-adı DAİMA tam-yol.

## Task 1: VS Code decide istemci-ucu (T11)

### Description
(1) src/extensions/vscode/src/rpc-bridge.ts'e `decideApproval(id, action,
reason?)` metodu — mevcut dört okuma-metodunun (getRunStatus/listSessions/
getLimits/listApprovals) çağrı-desenine birebir uyarak 'approval.decide'
RPC'sini çağırır; sunucu METHOD_NOT_IMPLEMENTED/api_decide_disabled dönerse
typed-sonuç (istemci fırlatmaz). (2) src/extensions/vscode/src/deckent-panel.ts
approval-listesi satırlarına Approve/Reject aksiyonları — kısa-kod görünümü
(#kod) + critical-risk satırda aksiyon YOK, 'CLI: deckent approvals decide
#<kod>' ipucu-metni (D3-delta critical-view-only). Panel mevcut render-desenini
korur (JSON-dump yerine satır-liste gerekiyorsa minimal-dönüşüm; büyük
UI-yeniden-yazımı YOK — cerrahi).
Test: extension test-altyapısı varsa ona ekle; yoksa rpc-bridge için hermetik
birim-test (mock-fetch/transport) YENİ oluştur: decide-çağrı şekli + disabled
typed-sonuç + critical-satır aksiyonsuz render pinleri.
- Files: src/extensions/vscode/src/rpc-bridge.ts, src/extensions/vscode/src/deckent-panel.ts, tests/extensions/vscode-rpc-bridge.test.ts
- Test: npx vitest run tests/extensions/vscode-rpc-bridge.test.ts
- Model: gpt-5.6-sol

### GO Criteria
decideApproval çağrı-şekli + disabled-typed-sonuç + critical-aksiyonsuz
pinli; okuma-metodları regresyonsuz; test yeşil.

## Task 2: orphan-delisting + kanal-matrisi i18n (T12)

### Description
(1) tests/governance/orphan-deliverables.test.ts:466-467 —
src/connectors/approval-clients-wire.ts ve src/connectors/approval-telegram.ts
artık üretim-bağlı (bot.ts relay-kurulumu, dalga-4): iki satır allowlist'ten
DÜŞÜRÜLÜR (test bunu zorlar; başka satıra DOKUNMA — verify-bind vb. ayrı
dilim). Testin kendisi gerçek-repoya karşı koşup yeşil kalmalı.
(2) src/cli/helpers/messages.ts — dalga-3/4'ün kanal-yanıt anahtarlarının
en+tr bütünlüğü taranır: eksik-dil varsa tamamlanır; kanal-matrisi
kullanıcı-metinleri (critical CLI-only ipucu, ambiguous-kod, nonce-tükenmiş)
katalogda ve İKİ dilde. Yeni davranış EKLENMEZ — yalnız katalog-bütünlüğü.
- Files: tests/governance/orphan-deliverables.test.ts, src/cli/helpers/messages.ts
- Test: npx vitest run tests/governance/orphan-deliverables.test.ts tests/cli/helpers/messages.test.ts
- Model: gpt-5.6-sol

### GO Criteria
İki orphan-satırı düştü ve test gerçek-repoda yeşil; kanal-anahtarları en+tr
tam (eksik-dil pin'i); testler yeşil.
