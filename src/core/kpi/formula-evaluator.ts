// ─── Sandboxed Formula Evaluator (SSOT) ───────────────────────────────────────
// A tiny, side-effect-free arithmetic DSL for KPI derived formulas. This single
// evaluator feeds BOTH the live (active-sprint) and rollup (historical) paths,
// so the two can never drift (spec §4 architecture-C, §6 DSL).
//
// Security model (this module is security-critical — see DIRECTIVES "SANDBOX-
// EVALUATOR" + spec §6/§11): a formula may reference ONLY (a) numeric literals
// and (b) identifiers that are OWN properties of the supplied `measures` map.
// The grammar permits nothing else — operators are limited to `+ - * /`,
// parentheses, and a leading unary `-`. There is NO function call, member
// access, indexing, or any path into host code, and `eval` / `Function` /
// `new Function` are NEVER used. This keeps formula evaluation safe even when
// formulas are user-defined in a multi-tenant context (sandboxed analog of
// Cube's `{a}/{b}`): arbitrary-code / prototype-pollution injection is zero.
//
// Null semantics: division-by-zero yields `null` ("no data" — e.g. a rate over
// zero completed tasks) rather than NaN/Infinity or a throw, and `null`
// propagates through every operator so the whole expression resolves to `null`.

// ─── Error ─────────────────────────────────────────────────────────────────────

/** Thrown when a formula is syntactically invalid, references an unknown
 *  identifier, or attempts a disallowed construct (function call, member access,
 *  indexing, stray token). Carries a stable `code` for programmatic handling. */
export class FormulaError extends Error {
  readonly code = 'FORMULA_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, FormulaError.prototype);
  }
}

// ─── Tokenizer ─────────────────────────────────────────────────────────────────

type TokenKind = 'number' | 'ident' | 'op';

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  /** Zero-based index of the token's first character, for error messages. */
  readonly pos: number;
}

/** The only single-character tokens the grammar recognises. Every other
 *  character (`. , [ ] { } % ^ & | ! < > = : ; '`, etc.) is rejected at
 *  tokenize time — which is what bars member-access, indexing, and call args. */
const OPERATOR_CHARS = new Set(['+', '-', '*', '/', '(', ')']);

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  const n = formula.length;
  let i = 0;

  while (i < n) {
    const ch = formula.charAt(i);

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    if (OPERATOR_CHARS.has(ch)) {
      tokens.push({ kind: 'op', value: ch, pos: i });
      i++;
      continue;
    }

    if (isDigit(ch)) {
      let j = i + 1;
      let seenDot = false;
      while (j < n) {
        const c = formula.charAt(j);
        if (isDigit(c)) {
          j++;
          continue;
        }
        if (c === '.' && !seenDot) {
          seenDot = true;
          j++;
          continue;
        }
        break;
      }
      tokens.push({ kind: 'number', value: formula.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentPart(formula.charAt(j))) {
        j++;
      }
      tokens.push({ kind: 'ident', value: formula.slice(i, j), pos: i });
      i = j;
      continue;
    }

    throw new FormulaError(`Unexpected character '${ch}' at position ${i}`);
  }

  return tokens;
}

// ─── Recursive-descent parser-evaluator ─────────────────────────────────────────
//
// Grammar (standard arithmetic precedence):
//   expr   := term   (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := '-' factor | '(' expr ')' | number | identifier
//
// Evaluation is single-pass over the token stream; `null` (div-by-zero / no
// data) is a first-class value that short-circuits any operator it touches.

class Evaluator {
  private pos = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly measures: Record<string, number>,
  ) {}

  evaluate(): number | null {
    if (this.tokens.length === 0) {
      throw new FormulaError('Empty formula');
    }
    const result = this.parseExpr();
    const leftover = this.peek();
    if (leftover !== undefined) {
      // A complete expression was parsed but tokens remain — e.g. `2 3`,
      // `a b`, or the `(` of a disallowed function call `cost(lines)`.
      throw new FormulaError(`Unexpected trailing token '${leftover.value}' at position ${leftover.pos}`);
    }
    return result;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private parseExpr(): number | null {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t === undefined || t.kind !== 'op' || (t.value !== '+' && t.value !== '-')) {
        break;
      }
      this.pos++;
      const right = this.parseTerm();
      if (left === null || right === null) {
        left = null;
      } else {
        left = t.value === '+' ? left + right : left - right;
      }
    }
    return left;
  }

  private parseTerm(): number | null {
    let left = this.parseFactor();
    for (;;) {
      const t = this.peek();
      if (t === undefined || t.kind !== 'op' || (t.value !== '*' && t.value !== '/')) {
        break;
      }
      this.pos++;
      const right = this.parseFactor();
      if (left === null || right === null) {
        left = null;
      } else if (t.value === '*') {
        left = left * right;
      } else {
        // Division — div-by-zero is the legitimate "no data" signal → null.
        left = right === 0 ? null : left / right;
      }
    }
    return left;
  }

  private parseFactor(): number | null {
    const t = this.peek();
    if (t === undefined) {
      throw new FormulaError('Unexpected end of formula');
    }

    // Unary minus.
    if (t.kind === 'op' && t.value === '-') {
      this.pos++;
      const operand = this.parseFactor();
      return operand === null ? null : -operand;
    }

    // Parenthesised sub-expression.
    if (t.kind === 'op' && t.value === '(') {
      this.pos++;
      const inner = this.parseExpr();
      const close = this.peek();
      if (close === undefined || close.kind !== 'op' || close.value !== ')') {
        throw new FormulaError(`Expected ')' at position ${close?.pos ?? t.pos}`);
      }
      this.pos++;
      return inner;
    }

    if (t.kind === 'number') {
      this.pos++;
      return Number(t.value);
    }

    if (t.kind === 'ident') {
      this.pos++;
      return this.resolveIdentifier(t);
    }

    // A stray operator in factor position (`* 3`, `)`, `+ 2`).
    throw new FormulaError(`Unexpected token '${t.value}' at position ${t.pos}`);
  }

  /**
   * Resolve an identifier strictly against the OWN properties of `measures`.
   * Using `Object.prototype.hasOwnProperty.call` (never the `in` operator or a
   * truthiness check) is the core whitelist guarantee: inherited prototype
   * members such as `constructor`, `__proto__`, `toString`, `valueOf`, and
   * `hasOwnProperty` are NOT own properties, so they resolve to "unknown
   * identifier" rather than leaking a function/object into evaluation.
   */
  private resolveIdentifier(token: Token): number {
    if (!Object.prototype.hasOwnProperty.call(this.measures, token.value)) {
      throw new FormulaError(`Unknown identifier '${token.value}'`);
    }
    const value = this.measures[token.value];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      // A whitelisted measure with a non-finite/non-number value is bad data,
      // not "no data" — surface it instead of silently producing NaN.
      throw new FormulaError(`Identifier '${token.value}' is not a finite number`);
    }
    return value;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate a sandboxed arithmetic formula over a map of measure values.
 *
 * @param formula  An arithmetic expression over `+ - * /`, parentheses, unary
 *                 minus, numeric literals, and identifiers present in `measures`.
 * @param measures Map of identifier → finite numeric value. Only OWN properties
 *                 are reachable; everything else is an "unknown identifier".
 * @returns The numeric result, or `null` when a division-by-zero occurs anywhere
 *          in the expression (null propagates through every operator).
 * @throws  {FormulaError} on an empty/invalid formula, an unknown identifier, a
 *          disallowed construct (function call, member access, indexing), a
 *          stray/trailing token, or unbalanced parentheses.
 */
export function evaluateFormula(formula: string, measures: Record<string, number>): number | null {
  if (typeof formula !== 'string') {
    throw new FormulaError('Formula must be a string');
  }
  const tokens = tokenize(formula);
  return new Evaluator(tokens, measures).evaluate();
}
