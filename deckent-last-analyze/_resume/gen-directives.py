#!/usr/bin/env python3
# Usage: python3 gen-directives.py <lo_cluster_idx> <hi_cluster_idx>
# Regenerates /home/alperen/deckent-dev/DIRECTIVES.md for cluster range [lo,hi] (Phase-2 audit).
import json, sys, os
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT="/home/alperen/deckent-dev/"
lo,hi=int(sys.argv[1]),int(sys.argv[2])
clusters=json.load(open(os.path.join(HERE,"deckent-clusters.json")))
def rel(f): return f.replace(ROOT,"")
sel=[c for c in clusters if lo<=c["index"]<=hi]
L=[]; W=L.append
W(f"# DIRECTIVES — Sprint: DECKENT-LAST-ANALYZE (clusters {lo}-{hi}) — full-code self-audit")
W("")
W(f"## Goal: Phase-2 deckent self-audit, cluster {lo}-{hi}. Phase-1 ile AYNI 5-kategori + rapor-formatı. Her task bir cluster'ı TAM okur -> deckent-last-analyze/cluster-NN.md kisa yapisal rapor.")
W("")
W("## Ortak kurallar (BAGLAYICI)")
W("- KOD-ONLY: her bulgu file:line + proving-snippet. docs/ cikarimi YASAK. zero-caller/dormant repo-grep ile dogrula (test+def haric).")
W("- filesRead'deki HER dosyayi TAM oku. Cikti SADECE deckent-last-analyze/cluster-NN.md (kaynak DEGISTIRME).")
W("- Format: '# <label> — <subsystem>' / '## Findings' / '- [category|severity] <title> — `file:line` — <evidence> — <desc>' / '## Summary'. cat: unwired|dormant|inconsistent|dead-test|root-cause.")
W("")
W("---")
W("")
for c in sel:
    idx=c["index"]; lbl=c["label"]; sub=c["subsystem"]
    report=f"deckent-last-analyze/cluster-{idx:02d}.md"
    files=[rel(f) for f in c["files"]]
    W(f"## Task {idx+1}: AUDIT {lbl} — {sub} code-audit (5 categories, code-only)")
    W(f"- Model: sonnet | Effort: medium | Agent: code-reviewer | Skills: security-specialist, typescript-expert")
    W(f"- Files: {', '.join(files)}, {report}")
    W(f"- Scope: src/{sub}/, deckent-last-analyze/")
    W("### Description")
    W(f"deckent **{sub}** cluster `{lbl}` kod-audit. TAM oku ({len(files)} dosya): {', '.join('`'+f+'`' for f in files)}. 5 kategori: unwired(zero-caller,grep-dogrula), dormant(tanimli-ama-okunmaz/no-op-gate), inconsistent(cakisan-default/duplicate/divergent), dead-test(skip/tautological/mock-only), root-cause(advisory-soft/trust-without-verify/silent-fallback/hardcoded-0-metric — soft yapan TAM satir). Her bulgu file:line+snippet. Rapor {report}'a yaz. Kaynak DEGISTIRME.")
    W(f"**Kanit:** {report} mevcut + finding-satirlari file:line tasiyor.")
    W("**Test:** Read-only (kod degismez).")
    W("")
open(os.path.join(ROOT,"DIRECTIVES.md"),"w").write("\n".join(L))
print(f"WROTE DIRECTIVES.md: {len(sel)} tasks (clusters {lo}-{hi})")
