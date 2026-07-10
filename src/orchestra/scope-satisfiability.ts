// ─── Scope Satisfiability Lint (G1b) ────────────────────────────────
// Cross-checks a task's declarative text (description/goCriteria/proofCommands)
// against its declared write authority (filesWrite/directories/trackedFiles).
// Pure, orchestra-type-free: callers own how a task JSON maps onto
// SatisfiabilityInput. See tests/fixtures/prompt-contract-397/ for the
// sprint-397 incidents (typo-path, silently-dropped root file, unchanged∩WRITE)
// this module is a regression base for.

export interface SatisfiabilityInput {
  description: string;
  goCriteria: string;
  proofCommands?: string[];
  filesWrite: string[];
  directories: string[];
  trackedFiles: readonly string[];
}

export type SatisfiabilityFindingCode =
  | 'MENTIONED_NOT_WRITABLE'
  | 'PROOF_PATH_MISSING'
  | 'UNCHANGED_IN_WRITE';

export interface SatisfiabilityFinding {
  severity: 'BLOCK' | 'WARN';
  code: SatisfiabilityFindingCode;
  path: string;
  message: string;
}

// ─── Path-mention extraction ─────────────────────────────────────────

// Slash-qualified path with an extension: "src/orchestra/planner.ts". Intermediate
// segments deliberately exclude "." so a shorthand like "agents.md/cli.md" resolves
// to the single clean match "docs/reference/agents.md" instead of greedily
// swallowing the trailing "/cli.md" fragment. The final segment's extension is
// `(?:\.[A-Za-z0-9]+)+` (one-or-more), not a single group, so multi-part
// extensions like ".test.ts" / ".spec.ts" aren't truncated to ".test".
const PRIMARY_PATH_RE = /(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)+/g;

// Bare "name.ext" token with no directory prefix — candidate for the root-file
// OR-clause (e.g. "README.md") and for the looser UNCHANGED_IN_WRITE resolution
// (e.g. "ci-baseline-detect.test" as a truncated mention of "...ci-baseline-detect.test.ts").
const BARE_FILENAME_RE = /\b[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)+\b/g;

interface Mention {
  token: string;
  kind: 'primary' | 'bare';
  start: number;
  end: number;
}

function findSpans(re: RegExp, text: string): Array<{ token: string; start: number; end: number }> {
  const out: Array<{ token: string; start: number; end: number }> = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // m[0] (the full match) is always present on a successful exec() — the
    // index signature just can't express that under noUncheckedIndexedAccess.
    const token = m[0]!;
    out.push({ token, start: m.index, end: m.index + token.length });
    if (token.length === 0) re.lastIndex++;
  }
  return out;
}

/** Extract path-like mentions from text: slash-qualified paths, plus bare
 * "name.ext" tokens that are not already covered by a slash-qualified match. */
function extractMentions(text: string): Mention[] {
  const primary = findSpans(PRIMARY_PATH_RE, text);
  const bare = findSpans(BARE_FILENAME_RE, text).filter(
    b => !primary.some(p => b.start >= p.start && b.end <= p.end),
  );
  return [
    ...primary.map(p => ({ token: p.token, kind: 'primary' as const, start: p.start, end: p.end })),
    ...bare.map(b => ({ token: b.token, kind: 'bare' as const, start: b.start, end: b.end })),
  ];
}

// ─── Sentence scoping ─────────────────────────────────────────────────
// Dots inside a matched path/bare token (".ts", ".mjs"...) must not be read as
// sentence terminators, so those spans are masked before boundary search.

function maskPathSpans(text: string): string {
  const spans = [...findSpans(PRIMARY_PATH_RE, text), ...findSpans(BARE_FILENAME_RE, text)];
  const chars = text.split('');
  for (const { start, end } of spans) {
    for (let i = start; i < end; i++) {
      if (chars[i] === '.' || chars[i] === '!' || chars[i] === '?') chars[i] = '_';
    }
  }
  return chars.join('');
}

/** A '.'/'!'/'?' only terminates a sentence when followed by whitespace or
 * end-of-string — this keeps a hidden-path dot like ".brain/archive" (no space
 * after the dot) from being misread as a sentence break. ';' also terminates a
 * clause: DIRECTIVES-style prose chains "(a) ...; (b) ...; (c) ..." under a
 * single trailing period, and treating the whole chain as one sentence would
 * blur unrelated file mentions together. */
function isSentenceBoundary(text: string, i: number): boolean {
  const c = text[i];
  if (c === '\n') return true;
  if (c === ';') return true;
  if (c === '.' || c === '!' || c === '?') {
    const next = text[i + 1];
    return next === undefined || /\s/.test(next);
  }
  return false;
}

function sentenceBounds(maskedText: string, start: number, end: number): { start: number; end: number } {
  let sentenceStart = 0;
  for (let i = start - 1; i >= 0; i--) {
    if (isSentenceBoundary(maskedText, i)) {
      sentenceStart = i + 1;
      break;
    }
  }
  let sentenceEnd = maskedText.length;
  for (let i = end; i < maskedText.length; i++) {
    if (isSentenceBoundary(maskedText, i)) {
      sentenceEnd = i;
      break;
    }
  }
  return { start: sentenceStart, end: sentenceEnd };
}

function sentenceAround(text: string, maskedText: string, start: number, end: number): string {
  const bounds = sentenceBounds(maskedText, start, end);
  return text.slice(bounds.start, bounds.end);
}

// ─── Lemma lists ────────────────────────────────────────────────────

const POSITIVE_VERB_LEMMAS = [
  'pinle', 'güncelle', 'yaz', 'oluştur', 'ekle', 'taşı', 'düzelt',
  'fix', 'update', 'write', 'create', 'add',
];

const NEGATION_LEMMAS = [
  'dokunma', 'değiştirme', 'dokunulmaz', 'do not touch', "don't modify",
];

const UNCHANGED_DECLARATION_RE = /değişmeyecek|unchanged|aynen kal|must remain/i;

function containsLemma(sentence: string, lemmas: string[]): boolean {
  const lower = sentence.toLowerCase();
  return lemmas.some(lemma => lower.includes(lemma));
}

// ─── Write-authority resolution ────────────────────────────────────

function normalizeDir(dir: string): string {
  return dir.endsWith('/') ? dir : `${dir}/`;
}

function isCoveredByDirectories(path: string, directories: string[]): boolean {
  return directories.some(dir => path.startsWith(normalizeDir(dir)));
}

function isRootTrackedFile(token: string, trackedFiles: readonly string[]): boolean {
  return trackedFiles.some(f => f === token && !f.includes('/'));
}

/** Loose match used by UNCHANGED_IN_WRITE: exact path, exact basename, or the
 * mention being a truncated prefix of the basename (missing its trailing
 * extension segment, e.g. "ci-baseline-detect.test" vs ".../ci-baseline-detect.test.ts"). */
function resolveAgainstFilesWrite(token: string, filesWrite: string[]): string | undefined {
  return filesWrite.find(fw => {
    if (fw === token) return true;
    const base = fw.split('/').pop() ?? fw;
    if (base === token) return true;
    if (base.startsWith(`${token}.`)) return true;
    return false;
  });
}

// ─── Rule 1: MENTIONED_NOT_WRITABLE ────────────────────────────────

function lintMentionedNotWritable(input: SatisfiabilityInput): SatisfiabilityFinding[] {
  const findings: SatisfiabilityFinding[] = [];
  const seen = new Set<string>();

  // sprint-399 wiring fix (fixture-012 false positive): a path inside a backticked
  // RUN command in goCriteria ("`node scripts/x.mjs` EXIT 0") is a run-target, not a
  // write requirement — rule 2 (PROOF_PATH_MISSING) governs its existence. Exempt it
  // from 1a ONLY when it is tracked (an untracked run-target still deserves rule 2's
  // BLOCK, and a prose mention like 397-007's test file is untouched by this).
  const runSpans: Array<{ start: number; end: number }> = [];
  for (const m of input.goCriteria.matchAll(/`([^`\n]+)`/g)) {
    const body = m[1] ?? '';
    if (/^(?:npx|npm|node|grep|find|cat|ls|go|cargo|pytest|vitest|deckent)\s/.test(body.trim())) {
      runSpans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  }
  const inRunSpan = (start: number, end: number): boolean =>
    runSpans.some(s => start >= s.start && end <= s.end);

  // (1a) goCriteria — unconditional, high-precision: goCriteria is the contract.
  const goMasked = maskPathSpans(input.goCriteria);
  for (const mention of extractMentions(input.goCriteria)) {
    if (mention.kind === 'bare' && !isRootTrackedFile(mention.token, input.trackedFiles)) continue;
    const writable =
      input.filesWrite.includes(mention.token) || isCoveredByDirectories(mention.token, input.directories);
    if (writable) continue;
    if (inRunSpan(mention.start, mention.end) && input.trackedFiles.includes(mention.token)) {
      // Tracked run-target. Silent for the dominant legitimate pattern (a regression
      // proof runs an UNCHANGED tracked test — the fixture-012 class). But when the
      // surrounding sentence carries a positive change-verb ("yeni case ekle / pinle /
      // genişlet"), the task likely must EXTEND the file it cannot write — the
      // 397-007 single-mention-in-backtick window (advisor, sprint-399 BEFORE-done):
      // surface a WARN instead of staying silent. Negation still suppresses.
      const sentence = sentenceAround(input.goCriteria, goMasked, mention.start, mention.end);
      if (containsLemma(sentence, POSITIVE_VERB_LEMMAS) && !containsLemma(sentence, NEGATION_LEMMAS)) {
        const key = `WARN-RUN:${mention.token}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({
            severity: 'WARN',
            code: 'MENTIONED_NOT_WRITABLE',
            path: mention.token,
            message:
              `goCriteria runs "${mention.token}" and the sentence implies changing it, ` +
              `but it is not in filesWrite or directories (run-only proofs of unchanged files are fine)`,
          });
        }
      }
      continue;
    }
    const key = `BLOCK:${mention.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      severity: 'BLOCK',
      code: 'MENTIONED_NOT_WRITABLE',
      path: mention.token,
      message: `goCriteria references "${mention.token}" but it is not in filesWrite or directories`,
    });
  }

  // (1b) description — low-precision: requires a same-sentence positive verb,
  // suppressed by a same-sentence negation ("DOKUNMA" etc).
  const masked = maskPathSpans(input.description);
  for (const mention of extractMentions(input.description)) {
    if (mention.kind === 'bare' && !isRootTrackedFile(mention.token, input.trackedFiles)) continue;
    const writable =
      input.filesWrite.includes(mention.token) || isCoveredByDirectories(mention.token, input.directories);
    if (writable) continue;
    const sentence = sentenceAround(input.description, masked, mention.start, mention.end);
    if (!containsLemma(sentence, POSITIVE_VERB_LEMMAS)) continue;
    if (containsLemma(sentence, NEGATION_LEMMAS)) continue;
    const key = `WARN:${mention.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      severity: 'WARN',
      code: 'MENTIONED_NOT_WRITABLE',
      path: mention.token,
      message: `description implies a change to "${mention.token}" but it is not in filesWrite or directories`,
    });
  }

  return findings;
}

// ─── Rule 2: PROOF_PATH_MISSING ────────────────────────────────────

function lintProofPathMissing(input: SatisfiabilityInput): SatisfiabilityFinding[] {
  const findings: SatisfiabilityFinding[] = [];
  const seen = new Set<string>();

  for (const command of input.proofCommands ?? []) {
    // Glob tokens (chat-tool-exec*.test.ts) are structurally unmatchable by
    // PRIMARY_PATH_RE (the "*" breaks the required "segment.ext" tail) and are
    // intentionally left unresolved rather than fuzzy-globbed — no finding either way.
    for (const { token } of findSpans(PRIMARY_PATH_RE, command)) {
      const tracked = input.trackedFiles.includes(token);
      const writable = input.filesWrite.includes(token);
      const covered = isCoveredByDirectories(token, input.directories);
      if (tracked || writable || covered) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      findings.push({
        severity: 'BLOCK',
        code: 'PROOF_PATH_MISSING',
        path: token,
        message: `proof command references "${token}" but it is not tracked, writable, or under a scoped directory`,
      });
    }
  }

  return findings;
}

// Max character gap between a declaration keyword ("AYNEN kalır", "unchanged")
// and the file mention it's judged to apply to. A same-sentence/clause scan is
// too coarse here — DIRECTIVES-style clauses often name several files for
// unrelated reasons ("restore the badge in README.md ... ci-baseline-detect.test
// AYNEN kalır"), and only the tightly-adjacent mention is the one actually
// being declared unchanged.
const UNCHANGED_ADJACENCY_GAP = 8;

// ─── Rule 3: UNCHANGED_IN_WRITE ────────────────────────────────────

function lintUnchangedInWrite(input: SatisfiabilityInput): SatisfiabilityFinding[] {
  const findings: SatisfiabilityFinding[] = [];
  const seen = new Set<string>();

  for (const text of [input.description, input.goCriteria]) {
    const masked = maskPathSpans(text);
    const mentions = extractMentions(text);
    const globalDeclRe = new RegExp(UNCHANGED_DECLARATION_RE.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = globalDeclRe.exec(text)) !== null) {
      const keywordStart = m.index;
      const keywordEnd = m.index + m[0]!.length;
      const bounds = sentenceBounds(masked, keywordStart, keywordEnd);
      const nearby = mentions.filter(mention => {
        if (mention.end <= keywordStart) {
          return mention.start >= bounds.start && keywordStart - mention.end <= UNCHANGED_ADJACENCY_GAP;
        }
        if (mention.start >= keywordEnd) {
          return mention.end <= bounds.end && mention.start - keywordEnd <= UNCHANGED_ADJACENCY_GAP;
        }
        return false;
      });
      for (const mention of nearby) {
        const hit = resolveAgainstFilesWrite(mention.token, input.filesWrite);
        if (!hit) continue;
        const key = `WARN:${hit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          severity: 'WARN',
          code: 'UNCHANGED_IN_WRITE',
          path: hit,
          message: `"${mention.token}" is declared unchanged but is also present in filesWrite ("${hit}")`,
        });
      }
    }
  }

  return findings;
}

// ─── Entry point ────────────────────────────────────────────────────

export function lintScopeSatisfiability(input: SatisfiabilityInput): SatisfiabilityFinding[] {
  return [
    ...lintMentionedNotWritable(input),
    ...lintProofPathMissing(input),
    ...lintUnchangedInWrite(input),
  ];
}
