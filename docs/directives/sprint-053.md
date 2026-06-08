# DIRECTIVES — Sprint 053: SWE-bench Benchmark

## Goal: Deckent'i SWE-bench Lite üzerinde test et, sonuçları belgele ve README'ye ekle. Rakiplerle karşılaştırılabilir metrik.

---

## Task 1: SWE-bench Runner Setup
- Model: opus
- Effort: high
- Files: benchmarks/swe-bench/runner.ts (new), benchmarks/swe-bench/config.ts (new)
- Scope: benchmarks/

### Description
SWE-bench Lite dataset'ini indir (300 issue). Her issue için: 1) Repo clone, 2) `deckent run "Fix: {issue_description}"`, 3) `git diff` çıktısını kaydet, 4) Gold patch ile karşılaştır. Parallel execution (max 4). Timeout per issue: 10dk.
8+ test.

---

## Task 2: Issue-to-Sprint Adapter
- Model: opus
- Effort: high
- Files: src/cli/commands/bench.ts (new), src/orchestra/issue-adapter.ts (new)
- Scope: src/cli/, src/orchestra/

### Description
`deckent bench --dataset swe-bench-lite` komutu. GitHub issue formatını DIRECTIVES.md'ye çevir. Repo context'i (test file, failing test) otomatik ekle. Single-task sprint mode (hızlı, overhead yok).
10+ test.

---

## Task 3: Results Analyzer
- Model: sonnet
- Effort: normal
- Files: benchmarks/swe-bench/analyzer.ts (new), benchmarks/results/ (new)
- Scope: benchmarks/

### Description
SWE-bench sonuçlarını analiz et: Pass@1 oranı, kategori bazlı (Django, Flask, sympy, etc.), model bazlı (opus vs sonnet), ortalama süre. JSON + Markdown rapor oluştur. Karşılaştırma tablosu: Deckent vs OpenHands vs Devin vs SWE-agent.
5+ test.

---

## Task 4: README Badge Update
- Model: haiku
- Effort: low
- Files: README.md
- Scope: ./

### Description
SWE-bench sonucunu README'ye badge olarak ekle: `![SWE-bench Lite](https://img.shields.io/badge/SWE--bench_Lite-XX%25-green)`. Results section ekle.
3+ test.

---

## Quality Rules
- Benchmark runner reproducible
- Results JSON schema validated
- README badge reflects actual results
