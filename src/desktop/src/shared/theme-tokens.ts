/**
 * D4-1 (SURF-4) — «Köprüüstü» theme-token SSOT: the three-layer CSS-variable
 * architecture behind the Desktop app's watch (vardiya) theme system.
 *
 * Approved art-direction (D4-0, docs/analysis/surf4-d4-0-art-direction-2026-07-16.md):
 * deckent = DECK — the app is a ship's bridge. Themes are WATCHES, not
 * decoration: `day-watch` (chart-buff paper), `night-watch` (the bridge's
 * real red-light discipline — night vision is preserved by red-shifted
 * accents and suppressed blue), `open-sea` (deep-water dark blue). The accent
 * is magenta because paper nautical charts REALLY print lights/routes in
 * magenta — it stays readable under red night-lighting. Physics, not metaphor.
 *
 * Three layers, all materialized as CSS custom properties:
 *   1. primitives  `--dk-p-<name>`  — raw hex ink values (chart-world names)
 *   2. semantic    `--dk-s-<name>`  — role tokens; each POINTS at a primitive
 *                                     (`var(--dk-p-…)`), so a watch switch is
 *                                     just re-pointing this layer
 *   3. component   `--dk-c-<name>`  — per-part tokens; each points at a
 *                                     semantic token (grows with D4-4 shells)
 *
 * User customization (D4-1 "custom" criterion): a persisted partial
 * `customTokens` map (semantic-token → hex) is applied ON TOP of the selected
 * watch by overriding `--dk-s-*` values directly — the component layer keeps
 * following automatically.
 *
 * Electron-free + DOM-free by design (types, zod, pure builders/validator):
 * unit-tested from vitest.desktop.config.ts. The renderer applies the output
 * of buildCssVariables() via style.setProperty (theme-runtime.ts); the main
 * process persists DesktopPreferences (preferences-store.ts).
 */
import { z } from 'zod';

// ─── Watches (vardiyalar) ────────────────────────────────────────────────────

/** Theme ids are language-neutral mechanism slugs; user-facing labels come
 *  from i18n (`desktop.theme.watch.*` keys in src/cli/helpers/messages.ts). */
/** 589-REBORN (Alperen-seçimi «NOVA»): tek-koyu Jarvis-kimliği BİRİNCİL;
 *  eski vardiyalar motor-mirası olarak kalır (mimarî korunur, anayasa E1). */
export const WATCH_NAMES = ['nova', 'day-watch', 'night-watch', 'open-sea'] as const;
export type WatchName = (typeof WATCH_NAMES)[number];

export const DEFAULT_WATCH: WatchName = 'nova';

// ─── Layer 1 — primitives (chart-world ink values) ──────────────────────────

/** Raw palette. Names come from the nautical-chart world of the approved
 *  direction; every semantic token must resolve to one of these. */
export const PRIMITIVES = {
  // ── NOVA (589 tek-kimlik: derin-uzay + ışıma) ──
  novaDeep: '#04080D',
  novaRaised: '#0A141D',
  novaLine: '#14242F',
  novaText: '#D7E7EE',
  novaTextMuted: '#6E8A98',
  novaGlow: '#38D3FF',
  // 589-A sahnesinin bright-glow'u; kimlik-turu 2026-07-31'de CAM GÖBEĞİ
  // ailesi (main+bright) kalıcı seçilince primitive olarak kaydedildi.
  novaGlowBright: '#7BE8FF',
  novaGlowDeep: '#04202B',
  novaAmber: '#E8B34C',
  novaGo: '#43E39A',
  novaAbort: '#FF6B5E',
  // paper & land
  buff: '#F2EDDC',
  buffRaised: '#FBF8EC',
  buffLine: '#DDD5BC',
  // water
  shallowWater: '#BDD7E2',
  deepSea: '#0E2430',
  deepSeaRaised: '#13303F',
  deepSeaLine: '#235064',
  seaText: '#D8E4E9',
  seaTextMuted: '#7FA3B2',
  seaAccentText: '#0E2430',
  // night bridge (red-light discipline)
  night: '#12151A',
  nightRaised: '#181C23',
  nightLine: '#2A303A',
  nightText: '#E3DAD2',
  nightTextMuted: '#9B948B',
  nightAccent: '#E2766B',
  nightAccentText: '#1C0F0D',
  // inks
  ink: '#2B2F33',
  // 2026-08-01 a11y koyulaştırması (#6B6F72 idi): buff üstünde 4.33 → 4.87 (AA;
  // buffRaised 5.37) — DESIGN-SYSTEM-001 settings-customize denetimi, Alperen onayı.
  inkMuted: '#63676a',
  // One shade inkier than the D4-0 comp's #C2447C: the validator measured
  // paper-on-#C2447C at 4.47:1 (just under AA 4.5) — chart identity intact.
  magenta: '#BD4278',
  magentaSea: '#E88FB9',
  brass: '#A98F54',
  paperOnMagenta: '#FBF8EC',
  // states (chart-honest: gündüz mürekkepleri; gece varyantları kırmızıya kaçar)
  go: '#2F7D46',
  // 2026-07-31 a11y ölçümü (DESIGN-SYSTEM-001): #A8741A idi; caution-text (buffRaised)
  // 3.81:1 ve bg-üstü 3.46:1 kalıyordu — #8F6212 ikisini de AA'ya çıkarır (5.03 / 4.57).
  caution: '#8F6212',
  abort: '#C0453E',
  nightGo: '#7FA06A',
  nightCaution: '#C99A55',
  nightAbort: '#E2766B',
  seaGo: '#7FC78F',
  seaCaution: '#E0B368',
  seaAbort: '#F08A80',
} as const;

export type PrimitiveName = keyof typeof PRIMITIVES;

// ─── Layer 2 — semantic roles ────────────────────────────────────────────────

/** The role vocabulary every watch must fully define (completeness is
 *  enforced by validateThemeTokens + the TS Record type below). */
export const SEMANTIC_TOKEN_NAMES = [
  'bg',           // app background (chart paper / bridge night / deep sea)
  'surface',      // raised panel
  'border',       // hairline instrument lines
  'text',         // primary ink
  'text-muted',   // secondary ink
  'accent',       // the magenta route ink (red-shifts at night — physics)
  'accent-text',  // text ON accent
  'brass',        // instrument-brass secondary accent
  'go',           // state: underway/ok
  'caution',      // state: tech-debt/warn
  'abort',        // state: failed/danger
  'go-text',      // ink ON go surfaces (pills/badges) — Alperen-onaylı rol, 2026-07-31
  'caution-text', // ink ON caution surfaces
  'abort-text',   // ink ON abort surfaces
  'focus-ring',   // keyboard focus indicator
] as const;

export type SemanticTokenName = (typeof SEMANTIC_TOKEN_NAMES)[number];

export type WatchDefinition = Record<SemanticTokenName, PrimitiveName>;

/** The three watches. Each entry POINTS at a primitive — the semantic layer
 *  is pure indirection, which is what makes the runtime switch cheap and the
 *  validator able to reason about every pairing. */
export const WATCHES: Record<WatchName, WatchDefinition> = {
  nova: {
    bg: 'novaDeep',
    surface: 'novaRaised',
    border: 'novaLine',
    text: 'novaText',
    'text-muted': 'novaTextMuted',
    accent: 'novaGlow',
    'accent-text': 'novaGlowDeep',
    brass: 'novaAmber',
    go: 'novaGo',
    caution: 'novaAmber',
    abort: 'novaAbort',
    'go-text': 'novaDeep',
    'caution-text': 'novaDeep',
    'abort-text': 'novaDeep',
    'focus-ring': 'novaGlow',
  },
  'day-watch': {
    bg: 'buff',
    surface: 'buffRaised',
    border: 'buffLine',
    text: 'ink',
    'text-muted': 'inkMuted',
    accent: 'magenta',
    'accent-text': 'paperOnMagenta',
    brass: 'brass',
    go: 'go',
    caution: 'caution',
    abort: 'abort',
    'go-text': 'buffRaised',
    'caution-text': 'buffRaised',
    'abort-text': 'buffRaised',
    'focus-ring': 'magenta',
  },
  'night-watch': {
    bg: 'night',
    surface: 'nightRaised',
    border: 'nightLine',
    text: 'nightText',
    'text-muted': 'nightTextMuted',
    accent: 'nightAccent',
    'accent-text': 'nightAccentText',
    brass: 'brass',
    go: 'nightGo',
    caution: 'nightCaution',
    abort: 'nightAbort',
    'go-text': 'night',
    'caution-text': 'night',
    'abort-text': 'night',
    'focus-ring': 'nightAccent',
  },
  'open-sea': {
    bg: 'deepSea',
    surface: 'deepSeaRaised',
    border: 'deepSeaLine',
    text: 'seaText',
    'text-muted': 'seaTextMuted',
    accent: 'magentaSea',
    'accent-text': 'seaAccentText',
    brass: 'brass',
    go: 'seaGo',
    caution: 'seaCaution',
    abort: 'seaAbort',
    'go-text': 'deepSea',
    'caution-text': 'deepSea',
    'abort-text': 'deepSea',
    'focus-ring': 'magentaSea',
  },
};

// ─── Layer 3 — component tokens ──────────────────────────────────────────────

/** Component-level tokens point at semantic roles. This set covers the parts
 *  the CURRENT pre-daemon shell already renders (buttons, cards, inputs) and
 *  grows with the D4-4 shells — always via this map, never ad-hoc vars. */
export const COMPONENT_TOKENS = {
  'btn-bg': 'accent',
  'btn-text': 'accent-text',
  'card-bg': 'surface',
  'card-border': 'border',
  'input-bg': 'surface',
  'input-border': 'border',
  'input-text': 'text',
  'statuspill-go': 'go',
  'statuspill-caution': 'caution',
  'statuspill-abort': 'abort',
  'statuspill-go-text': 'go-text',
  'statuspill-caution-text': 'caution-text',
  'statuspill-abort-text': 'abort-text',
  // 2026-08-01 progress ailesi (Alperen onayı). 'progress-arc' BİLİNÇLİ eksik:
  // accent-bright semantic rolü ister (per-watch bright değerleri ayrı tasarım kararı).
  'progress-track': 'border',
  'progress-fill': 'accent',
  'progress-fill-done': 'go',
  'progress-fill-abort': 'abort',
} as const satisfies Record<string, SemanticTokenName>;

export type ComponentTokenName = keyof typeof COMPONENT_TOKENS;

// ─── Preferences schema (persisted by main/preferences-store.ts) ────────────

export const DESKTOP_PREFERENCES_VERSION = 1;

/** Hex color: #RGB or #RRGGBB (custom overrides are colors only in v1). */
const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const desktopPreferencesSchema = z.object({
  version: z.literal(DESKTOP_PREFERENCES_VERSION),
  watch: z.enum(WATCH_NAMES),
  /** Partial semantic-token overrides ("custom" theming) applied on top of
   *  the selected watch. Keys outside SEMANTIC_TOKEN_NAMES are rejected. */
  customTokens: z.record(z.enum(SEMANTIC_TOKEN_NAMES), hexColorSchema),
});

export type DesktopPreferences = z.infer<typeof desktopPreferencesSchema>;

/** What a caller may pass to preferences.set — version is store-owned. */
export type DesktopPreferencesInput = Partial<Omit<DesktopPreferences, 'version'>>;

export const DEFAULT_PREFERENCES: DesktopPreferences = {
  version: DESKTOP_PREFERENCES_VERSION,
  watch: DEFAULT_WATCH,
  customTokens: {},
};

// ─── CSS-variable builder (consumed by renderer/theme-runtime.ts) ───────────

export const CSS_VAR_PREFIX = { primitive: '--dk-p-', semantic: '--dk-s-', component: '--dk-c-' } as const;

/**
 * Flatten the three layers into a CSS-variable map for one watch (+ optional
 * custom overrides). Layering is preserved in the OUTPUT: primitives carry
 * hex, semantic tokens carry `var(--dk-p-…)` references (or a raw hex when
 * custom-overridden), component tokens carry `var(--dk-s-…)` references —
 * so devtools show the chain and an override cascades automatically.
 */
export function buildCssVariables(
  watch: WatchName,
  customTokens: Partial<Record<SemanticTokenName, string>> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, hex] of Object.entries(PRIMITIVES)) {
    out[`${CSS_VAR_PREFIX.primitive}${name}`] = hex;
  }
  const definition = WATCHES[watch];
  for (const token of SEMANTIC_TOKEN_NAMES) {
    const override = customTokens[token];
    out[`${CSS_VAR_PREFIX.semantic}${token}`] =
      override !== undefined ? override : `var(${CSS_VAR_PREFIX.primitive}${definition[token]})`;
  }
  for (const [component, semantic] of Object.entries(COMPONENT_TOKENS)) {
    out[`${CSS_VAR_PREFIX.component}${component}`] = `var(${CSS_VAR_PREFIX.semantic}${semantic})`;
  }
  // Accent as an "R, G, B" triplet so CSS can layer literal glow alphas on the
  // token base — rgba(var(--dk-s-accent-rgb), .14) — without raw hex in rules.
  // A custom accent override that isn't plain hex falls back to the watch's
  // primitive so the key exists for every watch (pinned key-set invariant).
  const accentOverride = customTokens.accent;
  const accentHex = accentOverride !== undefined && HEX_RE.test(accentOverride)
    ? accentOverride
    : PRIMITIVES[definition.accent];
  const [r, g, b] = hexChannels(accentHex);
  out[`${CSS_VAR_PREFIX.semantic}accent-rgb`] = `${r}, ${g}, ${b}`;
  return out;
}

// ─── Token validator (D4-1 done-criterion: "token-validator yeşil") ─────────

export interface TokenValidationIssue {
  watch: WatchName | 'all';
  token: string;
  problem: string;
}

/** `#RGB`/`#RRGGBB` → [r, g, b] 0-255 (shorthand expanded). */
function hexChannels(hex: string): [number, number, number] {
  const h = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** WCAG relative luminance (sRGB). */
function luminance(hex: string): number {
  const [r, g, b] = hexChannels(hex);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Alpha-composite `fgHex` at `alpha` over an opaque `bgHex` and return the
 * resulting opaque hex. This is what the eye actually sees for translucent
 * text — feed the result to contrastRatio() for EFFECTIVE contrast (the
 * nova-scene legibility gate measures breathe-min opacity this way).
 */
export function compositeOver(fgHex: string, bgHex: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  const [fr, fgc, fb] = hexChannels(fgHex);
  const [br, bgc, bb] = hexChannels(bgHex);
  const mix = (f: number, b: number): string =>
    Math.round(a * f + (1 - a) * b).toString(16).padStart(2, '0');
  return `#${mix(fr, br)}${mix(fgc, bgc)}${mix(fb, bb)}`;
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Contrast pairs every watch must honor (WCAG AA: body 4.5:1, large/ui 3:1).
 *  Dark watches are validated separately from light ones by construction —
 *  each watch resolves its own hex values. */
const CONTRAST_REQUIREMENTS: Array<{ fg: SemanticTokenName; bg: SemanticTokenName; min: number }> = [
  { fg: 'text', bg: 'bg', min: 4.5 },
  { fg: 'text', bg: 'surface', min: 4.5 },
  { fg: 'text-muted', bg: 'bg', min: 4.5 },  // 2026-08-01: 3→4.5 (4 vardiya da geçiyor)
  { fg: 'accent-text', bg: 'accent', min: 4.5 },
  { fg: 'go-text', bg: 'go', min: 4.5 },
  { fg: 'caution-text', bg: 'caution', min: 4.5 },
  { fg: 'abort-text', bg: 'abort', min: 4.5 },
];

/**
 * Validate the ENTIRE token system: hex validity of primitives, semantic
 * completeness + primitive existence per watch, component→semantic pointer
 * validity, and per-watch WCAG contrast pairs. Pure; returns every issue
 * (never throws) so the test can print an exact, actionable list.
 */
export function validateThemeTokens(
  watches: Record<WatchName, WatchDefinition> = WATCHES,
  primitives: Record<string, string> = PRIMITIVES,
): TokenValidationIssue[] {
  const issues: TokenValidationIssue[] = [];

  for (const [name, hex] of Object.entries(primitives)) {
    if (!HEX_RE.test(hex)) {
      issues.push({ watch: 'all', token: name, problem: `primitive is not a valid hex color: "${hex}"` });
    }
  }

  for (const watch of WATCH_NAMES) {
    const definition = watches[watch];
    for (const token of SEMANTIC_TOKEN_NAMES) {
      const primitive = definition?.[token];
      if (primitive === undefined) {
        issues.push({ watch, token, problem: 'semantic token is not defined for this watch' });
        continue;
      }
      if (!(primitive in primitives)) {
        issues.push({ watch, token, problem: `points at unknown primitive "${primitive}"` });
      }
    }

    for (const { fg, bg, min } of CONTRAST_REQUIREMENTS) {
      const fgHex = primitives[definition?.[fg] ?? ''];
      const bgHex = primitives[definition?.[bg] ?? ''];
      if (!fgHex || !bgHex || !HEX_RE.test(fgHex) || !HEX_RE.test(bgHex)) continue; // reported above
      const ratio = contrastRatio(fgHex, bgHex);
      if (ratio < min) {
        issues.push({
          watch,
          token: `${fg} on ${bg}`,
          problem: `contrast ${ratio.toFixed(2)}:1 is below the required ${min}:1`,
        });
      }
    }
  }

  for (const [component, semantic] of Object.entries(COMPONENT_TOKENS)) {
    if (!SEMANTIC_TOKEN_NAMES.includes(semantic)) {
      issues.push({ watch: 'all', token: component, problem: `component token points at unknown semantic "${semantic}"` });
    }
  }

  return issues;
}
