# Auditor + RBAC — 30s Tarama Döngüsü ve Yetki Matrisi

> Sprint boyunca her 30 saniyede bir çalışan bağımsız gözetmen: heartbeat'leri izler, sınır ihlallerini yakalar, yetki matrisini uygular — kaynak kodu ASLA yazmaz.

## Ne işe yarar?

- Her **30 saniyede** bir in-process tarama döngüsü çalıştırır (varsayılan `30_000ms`).
- **Heartbeat izleme:** worker `.hb` dosyalarını okur; çok sinyal stale tespiti yapar (timestamp + `.result` + process canlılık + sequence monotonicity).
- **Sınır ihlali tespiti:** `git diff --stat` ile worker'ların kendi scope'u dışına çıkıp çıkmadığını denetler.
- **Stale lock tespiti:** `.locks/` dizinindeki kilitli dosyalarda zaman aşımı kontrolü.
- **ADR-037 RBAC:** Brain / Auditor / Worker rollerinin yetki matrisini `authority-enforcer.ts` üzerinden çalıştırır.
- Her tarama sonrası `.dashboard` dosyasını günceller (sprint durumu, alertler, phase).

## Neden önemli?

- Brain veya Worker'dan bağımsız — **tamamen izole denetim katmanı** (ADR-037 separation of concerns).
- Worker'ın sahte GO_WITH_TECH_DEBT rapor ettiği durumları yakalayarak Brain'e iletir.
- Kaynak kod yazmak Auditor rolünde **kesinlikle yasak** — kod tabanına karışmaz.

## Nasıl çalışır?

```
startScanLoop(projectRoot, sprintId, 30_000ms)
  │
  ├── scanHeartbeats()
  │     multi-sinyal stale tespiti:
  │       1. HB timestamp taze?        → canlı (birincil sinyal)
  │       2. .result DONE/GWT var mı?  → tamamlandı (stale değil)
  │       3. Process/container çalışıyor mu? (docker/tmux backend)
  │       4. Sequence artıyor mu?      → canlı
  │     → hepsi negatif = STALE alert
  │
  ├── checkBoundaryViolations()   ← git diff --stat, scope.filesWrite dışı?
  ├── scanStaleLocks()            ← .locks/ >5dk = stale lock
  ├── checkAuthority(role, action, target)  ← ADR-037 RBAC matrix
  └── writeFile(.dashboard)       ← sprint state snapshot
```

**ADR-037 Yetki Matrisi (V1.0):**

| Rol | Yazabilir | Yazamaz |
|-----|-----------|---------|
| Brain | `.tasks/**`, `.brain/**` | `src/**`, `tests/**`, `.dashboard` |
| Auditor | `.dashboard`, event log | `src/**`, `tests/**`, `.tasks/*.json` |
| Worker | `scope.filesWrite` listesi | Dışarısı tümü |

**Uygulama modu — dürüst bilgi:**
- V1.0 (şu an): **`soft` mod** — ihlaller event stream'e yazılır ve uyarı loglanır, **eylem bloke edilmez**.
- V2 (post-GA): `hard` mod — ihlaller anında durdurulur (sprint takviminde).

## Komut / Örnek

```bash
# Sprint sırasında canlı dashboard dosyasını oku (Auditor her 30s günceller)
cat .dashboard | jq '{phase, activeWorkers, alerts}'

# Örnek çıktı
# {
#   "phase": "EXECUTE",
#   "activeWorkers": 4,
#   "alerts": [
#     { "level": "WARNING", "message": "worker w-225-003: heartbeat stale (142s)", "source": "auditor" }
#   ]
# }

# Sprint sonrası boundary violation loglarını gör
deckent status --json | jq '.alerts[] | select(.source == "auditor")'
```

## Nervous System Authority Matrix (ayrı sistem)

`src/nervous/authority-matrix.ts` burada anlatılan sprint RBAC'ından **farklı** bir sistemdir.
Nervous System'ın otonom eylem yönetişimini yönetir: 4 preset mod (strict / balanced / autopilot / full-auto) ve 5 kilitli **safety floor** aksiyonu:

| Safety Floor Aksiyonu | Açıklama |
|----------------------|----------|
| `KILL_LIVE_SPRINT` | Canlı sprint'i durdurma |
| `MANUAL_FILE_DELETE` | Manuel dosya silme |
| `COST_OVER_THRESHOLD` | Bütçe eşiği aşımı |
| `DESTRUCTIVE_GIT` | Zararlı git operasyonu |
| `ADR_DEPRECATE_ACCEPTED` | Kabul edilmiş ADR'yi iptal etme |

Bu 5 aksiyon full-auto dahil hiçbir modda autonomous çalıştırılamaz.

## Durum

- Olgunluk: ✅ canlı — `startScanLoop()` tüm sprint'lerde aktif; `authority-enforcer.ts` her taramada çağrılır
- ADR-037 V1.0 `soft` mod aktif; `hard` mod 🔜 post-GA V2 hedefi
- İlgili: ADR-037 · ADR-035 · `src/monitor/auditor.ts` · `src/orchestra/authority-enforcer.ts` · `src/nervous/authority-matrix.ts`
