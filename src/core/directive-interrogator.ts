// ─── Directive Interrogator (PLAN-INT-1) ─────────────────────────────────────
//
// Pre-PLAN "directive-interrogation": before Brain plans a sprint, challenge the
// DIRECTIVES with structural, adversarial questions (gstack /office-hours pattern)
// so a wrong problem is caught BEFORE any code is written. Pure & LLM-free — the
// structural questions are enough; optional LLM enrichment is a later, separate step.
//
// i18n-FIRST: questions are i18n-key based. This module holds NO hardcoded
// user-facing sentences — only `interrogate.*` getMessage keys + parametric values
// extracted from the DIRECTIVES content. The en+tr templates live in
// `src/cli/helpers/messages.ts` (added by Sprint 276 Task 2). `getMessage` falls back
// to the key itself when a template is missing, so this module is decoupled from the
// message dictionary and resolves gracefully either way.
//
// ADR-008: importing the pure-leaf `messages.ts` i18n utility into core is safe —
// the enforced check only flags `core/ → orchestra/`. No cycle (messages.ts is a leaf).

import { getMessage } from '../cli/helpers/messages.js';

/** The five structural interrogation lenses (gstack /office-hours pattern). */
export type InterrogationCategory =
  | 'pain' // (a) is this a real pain or a feature-request?
  | 'wedge' // (b) the narrowest shippable wedge
  | 'hidden' // (c) hidden / assumed capabilities
  | 'premise' // (d) premises that should be questioned
  | 'effort'; // (e) effort alternatives

/**
 * A single structural interrogation question. The module is string-free by design:
 * it carries the i18n `messageKey` + parametric `params` (the source of truth) and a
 * `text` convenience field resolved via getMessage for callers that just want to render.
 */
export interface InterrogationQuestion {
  /** Stable identifier — equals `category` for the base questions. */
  id: string;
  category: InterrogationCategory;
  /** i18n key resolved by getMessage (e.g. 'interrogate.q_pain'). */
  messageKey: string;
  /** Parametric values extracted from the DIRECTIVES (injected into the template). */
  params: Record<string, string>;
  /** Resolved text via getMessage(messageKey, lang, params). Falls back to the key. */
  text: string;
  /** Effective language used to resolve `text` ('en' | 'tr'). */
  lang: string;
}

/** A user's answer to an interrogation question, keyed by question `id`. */
export interface InterrogationAnswer {
  /** Matches {@link InterrogationQuestion.id}. */
  id: string;
  answer: string;
}

export interface BuildInterrogationOptions {
  /** UI language for the resolved `text` field. Default 'en'. */
  lang?: string;
}

/**
 * Single source of truth for the i18n keys this feature uses. Sprint 276 Task 2 adds
 * the en+tr templates for exactly these keys to `messages.ts`; Task 3/Task 9 resolve them.
 */
export const INTERROGATION_MESSAGE_KEYS = [
  'interrogate.intro',
  'interrogate.q_pain',
  'interrogate.q_wedge',
  'interrogate.q_hidden',
  'interrogate.q_premise',
  'interrogate.q_effort',
  'interrogate.draft_header',
] as const;

/**
 * Document-structure marker for the refinements block. This is a CONTRACT literal (like
 * `## Goal`), not a user-facing UI string — `applyInterrogationAnswers` and the CLI rely
 * on it to locate and idempotently update the section. Intentionally NOT i18n.
 */
export const REFINEMENTS_MARKER = '## Interrogation Refinements';

const DEFAULT_LANG = 'en';

interface ParsedDirectives {
  title: string;
  goal: string;
  tasks: { num: number; title: string }[];
  featureCodes: string[];
}

/** Map each category to its i18n key. */
const CATEGORY_KEY: Record<InterrogationCategory, string> = {
  pain: 'interrogate.q_pain',
  wedge: 'interrogate.q_wedge',
  hidden: 'interrogate.q_hidden',
  premise: 'interrogate.q_premise',
  effort: 'interrogate.q_effort',
};

/** Stable category order — questions are always emitted in this sequence. */
const CATEGORY_ORDER: InterrogationCategory[] = ['pain', 'wedge', 'hidden', 'premise', 'effort'];

function normalizeLang(lang?: string): string {
  return lang === 'tr' ? 'tr' : DEFAULT_LANG;
}

/**
 * Parse a DIRECTIVES markdown document into its structural parts. Tolerant of empty or
 * malformed input — every field has a safe default.
 */
function parseDirectives(directives: string): ParsedDirectives {
  const text = typeof directives === 'string' ? directives : '';
  const lines = text.split('\n');

  // Title: first single-hash heading.
  let title = '';
  for (const line of lines) {
    const m = /^#\s+(.+)$/.exec(line);
    if (m && !line.startsWith('##')) {
      title = (m[1] ?? '').trim();
      break;
    }
  }

  // Goal: '## Goal[:] ...' heading, plus following lines until a '---' or next '## '.
  let goal = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const gm = /^##\s+Goal\b\s*:?\s*(.*)$/i.exec(line);
    if (!gm) continue;
    const collected: string[] = [];
    const inline = (gm[1] ?? '').trim();
    if (inline) collected.push(inline);
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? '';
      if (/^---\s*$/.test(next) || /^##\s/.test(next)) break;
      if (next.trim()) collected.push(next.trim());
    }
    goal = collected.join(' ').trim();
    break;
  }

  // Tasks: '## Task N: title'.
  const tasks: { num: number; title: string }[] = [];
  const taskRe = /^##\s+Task\s+(\d+)\s*:\s*(.+)$/gim;
  let tm: RegExpExecArray | null;
  while ((tm = taskRe.exec(text)) !== null) {
    const num = Number.parseInt(tm[1] ?? '', 10);
    const tTitle = (tm[2] ?? '').trim();
    if (!Number.isNaN(num) && tTitle) tasks.push({ num, title: tTitle });
  }

  // Feature codes: uppercase hyphenated tokens containing at least one digit
  // (e.g. PLAN-INT-1, XVER-1, F1-CB) — these are the Goal's "key names" to inject.
  const codeSource = goal || title;
  const rawCodes = codeSource.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g) ?? [];
  const featureCodes: string[] = [];
  for (const c of rawCodes) {
    if (/\d/.test(c) && !featureCodes.includes(c)) featureCodes.push(c);
  }

  return { title, goal, tasks, featureCodes };
}

/** Derive a concise "subject" string for question interpolation. */
function deriveSubject(parsed: ParsedDirectives): string {
  if (parsed.featureCodes.length > 0) return parsed.featureCodes.join(' + ');
  const firstClause = parsed.goal.split(/[.\n]/)[0]?.trim() ?? '';
  if (firstClause) return firstClause.slice(0, 80).trim();
  if (parsed.title) return parsed.title.slice(0, 80).trim();
  return '';
}

/**
 * Build the structural interrogation questions for a DIRECTIVES document. Always returns
 * the five lenses (pain/wedge/hidden/premise/effort) with parametric values extracted from
 * the content. Text is resolved via getMessage so the output is i18n-clean and ready to
 * render; `messageKey` + `params` remain available for callers that resolve themselves.
 */
export function buildInterrogationQuestions(
  directives: string,
  opts: BuildInterrogationOptions = {},
): InterrogationQuestion[] {
  const lang = normalizeLang(opts.lang);
  const parsed = parseDirectives(directives);
  const subject = deriveSubject(parsed);
  const keyNames = parsed.featureCodes.join(', ') || subject;
  const taskCount = String(parsed.tasks.length);
  const taskTitles = parsed.tasks.map((t) => t.title).join('; ');

  const paramsFor = (category: InterrogationCategory): Record<string, string> => {
    switch (category) {
      case 'pain':
        return { subject, keyNames };
      case 'wedge':
        return { subject, taskCount };
      case 'hidden':
        return { subject };
      case 'premise':
        return { subject, tasks: taskTitles };
      case 'effort':
        return { taskCount };
    }
  };

  return CATEGORY_ORDER.map((category) => {
    const messageKey = CATEGORY_KEY[category];
    const params = paramsFor(category);
    return {
      id: category,
      category,
      messageKey,
      params,
      text: getMessage(messageKey, lang, params),
      lang,
    };
  });
}

/**
 * Remove an existing refinements section (from {@link REFINEMENTS_MARKER} to the next
 * `---` / `## ` heading / EOF) so re-applying answers updates rather than duplicates it.
 */
function stripRefinementsSection(directives: string): string {
  const lines = directives.split('\n');
  const start = lines.findIndex((l) => l.trim() === REFINEMENTS_MARKER);
  if (start === -1) return directives;

  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    const line = lines[j] ?? '';
    if (/^---\s*$/.test(line) || /^##\s/.test(line)) {
      end = j;
      break;
    }
  }
  const before = lines.slice(0, start);
  // Trim a trailing blank line in `before` to avoid blank-line accumulation.
  while (before.length > 0 && (before[before.length - 1] ?? '').trim() === '') {
    before.pop();
  }
  const after = lines.slice(end);
  const joined = [...before, ...after].join('\n');
  return joined;
}

/** Find the line index just after the Goal section (before its `---`/next `## `), or -1. */
function goalSectionEndIndex(lines: string[]): number {
  const goalStart = lines.findIndex((l) => /^##\s+Goal\b/i.test(l));
  if (goalStart === -1) return -1;
  for (let j = goalStart + 1; j < lines.length; j++) {
    const line = lines[j] ?? '';
    if (/^---\s*$/.test(line) || /^##\s/.test(line)) return j;
  }
  return lines.length;
}

/**
 * Apply user answers to the interrogation questions, producing a revised DIRECTIVES DRAFT.
 * Pure & content-preserving: the original is NEVER deleted — a `## Interrogation Refinements`
 * section is inserted after the Goal (or appended if no Goal heading). Empty/missing answers
 * are tolerated: with no valid answers the original is returned unchanged (no-op).
 */
export function applyInterrogationAnswers(
  directives: string,
  answers: InterrogationAnswer[],
): string {
  const source = typeof directives === 'string' ? directives : '';

  const valid = (Array.isArray(answers) ? answers : []).filter(
    (a): a is InterrogationAnswer =>
      !!a && typeof a.id === 'string' && a.id.length > 0 &&
      typeof a.answer === 'string' && a.answer.trim().length > 0,
  );

  // Tolerance: nothing to apply → preserve the original byte-for-byte.
  if (valid.length === 0) return source;

  const stripped = stripRefinementsSection(source);

  // The section header is the stable document-contract marker (English, language-independent)
  // so the section can be reliably re-found and idempotently updated regardless of UI language.
  // getMessage('interrogate.draft_header', 'en') equals this marker by design (Sprint 276 Task 2).
  const bodyLines = valid.map((a) => `- **${a.id}:** ${a.answer.trim()}`);
  const block = [REFINEMENTS_MARKER, '', ...bodyLines].join('\n');

  const lines = stripped.split('\n');
  const insertAt = goalSectionEndIndex(lines);

  if (insertAt === -1) {
    // No Goal heading — append at end, content-preserving.
    const base = stripped.replace(/\s*$/, '');
    return `${base}\n\n${block}\n`;
  }

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  // Ensure exactly one blank line separates the goal text from the block.
  while (before.length > 0 && (before[before.length - 1] ?? '').trim() === '') before.pop();
  return [...before, '', block, '', ...after].join('\n');
}
