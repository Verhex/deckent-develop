# Voice Maturation — WS3.A: Code-switching & Natural Reading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Turkish replies that contain English tech/brand/literature terms ("build", "API", "deckent", "ChatGPT", "GitHub") read **naturally** — not broken — when spoken by the Turkish-referenced VoxCPM2; plus correct Turkish reading of numbers and abbreviations.

**Architecture:** A TTS **text-preprocessing layer** in the wrapper, applied to the reply text *before* synthesis, gated on the (WS1-threaded) TTS language being Turkish: (1) an English-term → Turkish-phonetic **respelling** map (VoxCPM reads Turkish, so the respelling sounds like the English word), seeded from the dogfood `pronunciation.json` + deckent terms, **user-extensible**; (2) Turkish **number/abbreviation** normalization. Spec: `docs/superpowers/specs/2026-06-25-voice-maturation-design.md` (WS3). This is WS3's codeable, highest-impact pillar (3.A); 3.B (prosody params/reference, auditory) and 3.C (per-user voice enrollment) are separate.

**Tech Stack:** Python (wrapper) + stdlib `unittest`. Python `re` `\b` is Unicode-aware for `str` (Turkish-safe — verified: "yazılım" does NOT match `\byaz\b`), so `\b` boundaries are safe here (unlike JS).

## Global Constraints
- Preprocessing applies **only when the TTS language is Turkish** (`/tts/raw` `body.language` — WS1 threads the reply language). Other languages → unchanged text (no respelling). A `TTS_TEXT_NORMALIZE=0` env disables the whole layer (escape hatch).
- **Respelling matching:** longest-term-first; `\b`-bounded (case-insensitive match, but the replacement is the curated respelling); never replace inside a larger word. The map is **human-curated** + **user-extensible** via a JSON file (seed `pronunciation.json` + `PRONUNCIATION_FILE` env to point at a custom/extended dict).
- Wrapper tests use stdlib `unittest` via the dogfood venv python `/home/alperen/youtube-plan/services/tts/.venv/bin/python`; FAKE-mode friendly (text preprocessing is pure, no model). New dep `num2words` (small, pure-python) added to `requirements.txt` + installed via `uv pip install --python <venv> num2words`.
- Surgical. No deckent-side code change required (WS1 already passes the language); deckent docs only.

---

### Task 1: Pronunciation respelling map + apply

**Files:** Create `examples/voice-wrapper/tts_text.py`, `examples/voice-wrapper/pronunciation.json`, `examples/voice-wrapper/test_tts_text.py`

**Interfaces:**
- `examples/voice-wrapper/pronunciation.json` — seed from `/home/alperen/youtube-plan/services/tts/pronunciation.json` (ChatGPT→"Çet Ci Pi Ti", API→"Ey Pi Ay", GitHub→"Githab", Claude→"Klod", Google→"Gugıl", …) + add **deckent/dev terms**: `deckent`→"Dekent", `sprint`→"Sprint", `build`→"Bild", `commit`→"Komit", `merge`→"Merc", `restart`→"Ristart", `bot`→"Bot", `Telegram`→"Telegram", `Discord`→"Diskord", `WhatsApp`→"Vatsap", `token`→"Tokın", `prompt`→"Prompt", `dashboard`→"Daşbord", `repo`→"Repo", `branch`→"Branç", `merge`→"Merc", `pull request`→"Pul Rikuest", `LLM`→"El El Em", `MCP`→"Em Ci Pi". (Keep the `_comment` documenting the convention: c=İng. j, ç=İng. ch.)
- `tts_text.py`:
  - `load_pronunciation(path: str | None) -> dict[str, str]` — load the JSON (default: the wrapper's `pronunciation.json`; `path`/`PRONUNCIATION_FILE` env overrides/extends), drop `_`-prefixed keys.
  - `apply_pronunciation(text: str, table: dict[str,str]) -> str` — replace each term with its respelling, **longest-key-first**, `\b`-bounded, case-insensitive match (e.g. "api"/"API" → "Ey Pi Ay"); preserve surrounding text/punctuation; do NOT replace inside a larger word ("APIler" handling — document: match `API` with `\b` so "APIler" → respell "API" + keep "ler"? decide + document the suffix rule; Turkish appends suffixes to English terms — prefer matching the term then keeping the suffix, e.g. `\bAPI` with a following Turkish suffix → "Ey Pi Ay" + suffix; document the exact rule).

- [ ] **Step 1: Failing test** (`test_tts_text.py`, unittest): `apply_pronunciation("deckent'in API yanıtı", table)` → contains "Ey Pi Ay" and "Dekent"; longest-first ("ChatGPT" not split into "Chat"+"GPT"); no replace inside an unrelated word; case-insensitive ("api" → "Ey Pi Ay"); `_comment` key ignored.
- [ ] **Step 2: Run → FAIL** (`PYW=/home/alperen/youtube-plan/services/tts/.venv/bin/python; cd examples/voice-wrapper && "$PYW" -m unittest test_tts_text -v`).
- [ ] **Step 3: Implement** `tts_text.py` (load + apply) + `pronunciation.json`.
- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice-wrapper): English→Turkish-phonetic pronunciation map + apply (ws3a t1)"`

---

### Task 2: Turkish number + abbreviation normalization

**Files:** Modify `examples/voice-wrapper/tts_text.py`, `examples/voice-wrapper/test_tts_text.py`, `examples/voice-wrapper/requirements.txt`

**Interfaces:**
- Add `num2words` to `requirements.txt`; install it into the dogfood venv: `uv pip install --python /home/alperen/youtube-plan/services/tts/.venv/bin/python num2words`.
- `normalize_numbers_abbr(text: str) -> str` in `tts_text.py`:
  - Numbers → Turkish words via `num2words(n, lang='tr')`: integers ("200" → "iki yüz"), decimals ("3.5"/"3,5" → "üç virgül beş" — handle both `.` and `,` as the Turkish decimal sep; document the choice).
  - Unit/abbr map (applied with `\b`): `GB`→"gigabayt", `MB`→"megabayt", `KB`→"kilobayt", `TB`→"terabayt", `ms`→"milisaniye", `sn`→"saniye", `dk`→"dakika", `vs`→"vesaire", `vb`→"ve benzeri", `%`→"yüzde" (prefix: "%50" → "yüzde elli"). Keep it a curated, extensible map.
  - Order: normalize `%n`/units adjacent to numbers sensibly (e.g. "50%" → "yüzde elli", "3.5GB" → "üç virgül beş gigabayt").

- [ ] **Step 1: Failing test** — "200" → "iki yüz"; "3.5 GB" → "üç virgül beş gigabayt"; "%50" → "yüzde elli"; "5 dk" → "beş dakika"; plain text with no numbers unchanged.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** (+ install num2words + requirements).
- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice-wrapper): Turkish number + abbreviation normalization (num2words) (ws3a t2)"`

---

### Task 3: Wire normalize-for-TTS into the wrapper synth path

**Files:** Modify `examples/voice-wrapper/tts_text.py` (the combined entry), `examples/voice-wrapper/server.py` (`/tts/raw`), `examples/voice-wrapper/test_server.py`

**Interfaces:**
- `normalize_for_tts(text: str, language: str | None, table: dict) -> str` in `tts_text.py` — when `language` starts with `"tr"` (and `TTS_TEXT_NORMALIZE != "0"`): `apply_pronunciation(normalize_numbers_abbr(text), table)` (order: numbers/abbr first, then pronunciation — document); else return `text` unchanged.
- `server.py` `/tts/raw`: load the pronunciation table once at startup; in the handler, `text = normalize_for_tts(body.text, body.language, table)` before `manager.tts().synthesize(text, language)`. FAKE mode: still apply normalization (it's pure, no model) so tests can assert it.

- [ ] **Step 1: Failing test** (`test_server.py`, FAKE) — `POST /tts/raw {"text":"deckent API yanıtı 200 döndü","language":"tr"}` → the text that reaches synthesis (assert via a spy/seam OR a FAKE that echoes the normalized text) contains "Ey Pi Ay" + "iki yüz" + "Dekent"; `language:"en"` → unchanged ("API" stays "API"); `TTS_TEXT_NORMALIZE=0` → unchanged.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** the wire (startup load + per-request normalize, language-gated).
- [ ] **Step 4: Run → PASS** + full wrapper unittest.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice-wrapper): apply Turkish TTS text normalization in /tts/raw (ws3a t3)"`

---

### Task 4: Docs + extensibility + verification

**Files:** Modify `examples/voice-wrapper/README.md`, `docs/voice.md`

- [ ] **Step 1:** `README.md` — document the **text-normalization layer**: the pronunciation respelling (English→Turkish-phonetic, the `pronunciation.json`, `PRONUNCIATION_FILE` env to extend, the `_comment` convention), the number/abbr normalization, the `TTS_TEXT_NORMALIZE=0` escape, and that it is **Turkish-language-gated**. `docs/voice.md` — a short user note: code-switching is handled; each deployment can extend the pronunciation map. No placeholders; real examples.
- [ ] **Step 2:** Verify: wrapper unittest (`"$PYW" -m unittest discover -s examples/voice-wrapper -p 'test_*.py'`) all pass; `examples/voice-wrapper/server.py` imports cleanly. (deckent connector suite is unaffected — no deckent code change — but run `npx tsc --noEmit` as a sanity check.)
- [ ] **Step 3: Commit** — `git commit -m "docs(voice-wrapper): TTS text-normalization + pronunciation extensibility (ws3a t4)"`

---

## Manual proof-of-function (dogfood, after WS3.A)
1. Restart the wrapper from this branch. `curl` `/tts/raw` `{"text":"deckent'in build'i başarılı, API yanıtı 200 döndü, GitHub'a merge ettim.","language":"tr"}` → listen: "build", "API", "GitHub", "merge", "200" read naturally (Turkish-phonetic), not broken. Telegram: a Turkish reply with English terms speaks cleanly.

## Plan Self-Review
**Spec coverage:** WS3 3.A (code-switching pronunciation + Turkish normalization) → T1–T3; extensibility + docs → T4. 3.B (auditory params/reference) + 3.C (enrollment) are out of this plan (need the user's ears/voice). ✅
**Placeholder scan:** none — the seed map is concrete (from the dogfood file + deckent terms), signatures + tests concrete; the suffix-rule + decimal-sep are flagged for explicit decision+documentation. ✅
**Type consistency:** `load_pronunciation`/`apply_pronunciation` T1 → `normalize_numbers_abbr` T2 → `normalize_for_tts` T3 (composes both) → server wire T3. ✅
