# DECKENT-LAST-STANDING — RESUME RUNBOOK (4h-later, fresh-context safe)

## STATE (2026-06-20, ~93% session limit reached — handoff)
- **PHASE 1 (CC audit) ✅ DONE** → `/deckent-last-standing.md` (1950 satır, 692 confirmed finding, 8 root-cause). Full JSON: `_resume/phase1-result.json`.
- **PHASE 2 (deckent self-audit / dogfood) — IN PROGRESS:**
  - sprint 312 → clusters **0-43** raporları yazıldı (30dk timeout capped).
  - sprint 313 (handoff anında RUNNING) → clusters **44-69**.
  - **ROUND-3 PENDING → clusters 70-94** (henüz başlamadı).
- Raporlar: `deckent-last-analyze/cluster-NN.md`.

## NEDEN sprint ~44/30dk'da takılıyor (kök-neden, kod-doğrulanmış)
`result-collector.ts:530` hardcoded 30dk `waitForResults` default; `config.sprint_timeout_minutes`(=0) thread EDİLMİYOR (`sprint-controller.ts:1115` `opts.timeoutMs` geçiyor, config değil) → dormant-knob (audit R3 canlı). **Bu yüzden sprint başına ≤26 cluster** (max_workers=4 ile 30dk'ya sığar). [Fix adayı: sprint_timeout_minutes→timeoutMs thread et.]

## RESUME ADIMLARI
1. Eksik cluster'ları bul:
   `python3 -c "import glob,re; h={int(re.search(r'cluster-(\d+)',f).group(1)) for f in glob.glob('deckent-last-analyze/cluster-*.md')}; print([i for i in range(95) if i not in h])"`
2. Throttle garanti: `env -u ANTHROPIC_API_KEY node dist/cli/entry.js config set max_workers 4`
3. Her ≤26'lık eksik-batch [lo..hi] için:
   - `python3 deckent-last-analyze/_resume/gen-directives.py <lo> <hi>`
   - `env -u ANTHROPIC_API_KEY node dist/cli/entry.js plan --structured --yes`
   - `nohup env -u ANTHROPIC_API_KEY node dist/cli/entry.js start --auto-approve > /tmp/deckent-sprint-<n>.log 2>&1 &`
   - monitor: `until [ $(ls deckent-last-analyze/cluster-*.md|wc -l) -ge <hedef> ]; do sleep 90; done` veya PID-exit.
4. 95 rapor tamamlanınca **CROSS-CHECK** (Phase-1 vs Phase-2):
   - 95 deckent-raporunu parse et (finding satırı: `- [cat|sev] title — file:line — ...`).
   - `_resume/phase1-result.json` (692 CC-finding) ile kıyasla.
   - Saf havuz: AGREE (ikisi de) / CC-only (deckent kaçırdı) / deckent-only (CC kaçırdı veya false) / conflict-flag.
   - `deckent-last-standing.md` formatına getir (veya `-crosscheck.md`).
5. Sonra: havuzdan iş-bitirme. **EN ACİL: live-IDOR** — `b525d679` ENT-3-SEC fix DEAD (server.ts:820,861 `req` geçmiyor → IDOR origin/main'de canlı). Fix = server.ts 2 callsite + enterprise :824'e `req` thread.

## NOTLAR
- `deckent-last-standing.md` + `deckent-last-analyze/` UNCOMMITTED (working tree, kalıcı). Commit yalnız Alperen isteyince.
- `max_workers=4` .deckent/config.json:240'ta.
- Sprint kill / `rm .tasks/*` YASAK (Alperen onayı). Monitor'lerdeki `kill -0` = probe (öldürmez).
- DIRECTIVES.md her batch'te overwrite olur (sprint plan'a yakalanır, sorun değil).
