# Nervous System — Proaktif Meta-Orkestratör

> Deckent'in kendi kendini izleyen, tehlike sinyali algılayan ve kullanıcıya öneri sunan proaktif koruma katmanı.

## Ne işe yarar?

- **Proaktif algılama** — Sprint sırasında stale heartbeat, scope ihlali, stale lock ve kaynak tehditlerini 15 saniyede bir otomatik tarar.
- **Önerme & onay kapısı** — Tehlike tespitinde öneriyi `dispatcher` aracılığıyla kullanıcıya sunar; kullanıcı CLI veya dashboard üzerinden kabul/red eder.
- **8 action handler** — kill-worker, cleanup-stale-lock, emit-alert ve benzeri eylemleri hazır handler'larla gerçekleştirir.
- **Panic-gate protokolü** — Kritik olmayan eylemler advisory modda (anında PROCEED + görünür uyarı) çalışır; SAFETY_FLOOR eylemleri (KILL_LIVE_SPRINT vb.) asla otomatik geçmez.
- **Re-enable akışı** — `deckent nervous accept <id>` / `deckent nervous reject <id>` ile bekleyen öneriler CLI'dan yönetilir.
- **Dashboard entegrasyonu** — NervousPage'de bekleyen onay listesi, panic rozeti ve 30s canlı polling görünümü.

## Neden önemli?

- **Sprint'i korur** — Auditor'ın denetlediği sınır ihlalleri + stale lock'lar otomatik alarm üretir; Brain FIX fazına girmeden önce uyarı alırsın.
- **Kullanıcı onayı merkezi** — Tehlikeli aksiyonlar için insan-onay kapısı, ADR-040 ve ADR-037 RBAC ile uyumlu; sistem asla sessizce yıkıcı eylem yapmaz.
- **Genişletilebilir detector** — `detector-registry.ts` aracılığıyla yeni tehdit dedektörleri eklenebilir; mevcut pipeline değişmez.

## Nasıl çalışır?

1. **Observer** (`observer.ts`) — 15s döngüde `detectorRegistry` üzerinden tüm dedektörleri çalıştırır, `'detection'` event'i yayar.
2. **Pipeline** — `DecisionEngine` → `Proposer` → `Dispatcher` → `Executor` zinciri event'i işler; `History`'ye kaydeder.
3. **Panic-gate** (`panic-gate.ts`) — advisory: anında PROCEED + stderr uyarı; blocking-with-timeout: 10s hard deadline, süre dolunca TIMEOUT_AUTO_PROCEED; SAFETY_FLOOR eylemleri daima REJECTED (timeout bypass yok).
4. **Re-enable** — Kullanıcı `deckent nervous accept <id>` yazar → `.deckent/panic-ipc/resolved/<id>.json` işaret dosyası oluşur → executor APPROVED kararını okur.

## Komut / Örnek
```bash
# Nervous sistem geçmişini gör
deckent nervous history

# Raw log akışı
deckent nervous log

# Öneri kabul et
deckent nervous accept <proposal-id>

# Öneri reddet
deckent nervous reject <proposal-id>

# Panic-gate onayı (sprint spawn bloğunu açar)
deckent nervous accept-panic <task-id>
```

## Durum

- Olgunluk: 🔜 **aktivasyon yolunda** — detection pipeline + 8 action handler + panic-gate protokolü canlı (Sprint 220/223); panic-gate'in executor'a tam bağlanması (0-caller, W-K #1) ve otonom sprint-controller wire'ı roadmap. "Şu an otomatik düzeltiyor" DEĞİL — kullanıcı CLI/dashboard onayı gerekiyor.
- İlgili: ADR-040 · `src/nervous/` (observer, decision-engine, proposer, dispatcher, executor, panic-gate, authority-matrix, action-handlers — 15 modül)
