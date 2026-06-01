/**
 * Central design token system — dark/light consistent color, spacing, radius, shadow.
 * Components consume these tokens for visual consistency across the dashboard.
 */

export type ThemeMode = "dark" | "light";

/** Color tokens aligned with CSS @theme variables in index.css (dark-first). */
export interface ColorTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

/** Spacing scale (4px base grid). */
export interface SpacingTokens {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
}

/** Border radius tokens. */
export interface RadiusTokens {
  sm: string;
  md: string;
  lg: string;
  full: string;
}

/** Shadow tokens. */
export interface ShadowTokens {
  sm: string;
  md: string;
  lg: string;
}

export interface ThemeTokens {
  color: ColorTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadow: ShadowTokens;
}

/** Dark mode color tokens (matches CSS @theme in index.css). */
const darkColorTokens: ColorTokens = {
  background: "#09090b",
  foreground: "#fafafa",
  card: "#09090b",
  cardForeground: "#fafafa",
  primary: "#fafafa",
  primaryForeground: "#18181b",
  secondary: "#27272a",
  secondaryForeground: "#fafafa",
  muted: "#27272a",
  mutedForeground: "#a1a1aa",
  accent: "#27272a",
  accentForeground: "#fafafa",
  destructive: "#7f1d1d",
  destructiveForeground: "#fafafa",
  border: "#27272a",
  input: "#27272a",
  ring: "#d4d4d8",
};

/** Light mode color tokens (zinc/slate light palette). */
const lightColorTokens: ColorTokens = {
  background: "#ffffff",
  foreground: "#09090b",
  card: "#ffffff",
  cardForeground: "#09090b",
  primary: "#18181b",
  primaryForeground: "#fafafa",
  secondary: "#f4f4f5",
  secondaryForeground: "#18181b",
  muted: "#f4f4f5",
  mutedForeground: "#71717a",
  accent: "#f4f4f5",
  accentForeground: "#18181b",
  destructive: "#ef4444",
  destructiveForeground: "#fafafa",
  border: "#e4e4e7",
  input: "#e4e4e7",
  ring: "#18181b",
};

/** Shared spacing scale — same for dark and light. */
const spacingScale: SpacingTokens = {
  xs: "0.25rem",
  sm: "0.5rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
  "2xl": "3rem",
};

/** Shared radius tokens — same for dark and light. */
const radiusScale: RadiusTokens = {
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  full: "9999px",
};

/** Dark shadow tokens. */
const darkShadowTokens: ShadowTokens = {
  sm: "0 1px 2px rgba(0,0,0,0.5)",
  md: "0 4px 6px rgba(0,0,0,0.4)",
  lg: "0 10px 15px rgba(0,0,0,0.5)",
};

/** Light shadow tokens. */
const lightShadowTokens: ShadowTokens = {
  sm: "0 1px 2px rgba(0,0,0,0.06)",
  md: "0 4px 6px rgba(0,0,0,0.07)",
  lg: "0 10px 15px rgba(0,0,0,0.1)",
};

export const darkTokens: ThemeTokens = {
  color: darkColorTokens,
  spacing: spacingScale,
  radius: radiusScale,
  shadow: darkShadowTokens,
};

export const lightTokens: ThemeTokens = {
  color: lightColorTokens,
  spacing: spacingScale,
  radius: radiusScale,
  shadow: lightShadowTokens,
};

/** Returns theme tokens for the given mode. */
export function getThemeTokens(mode: ThemeMode): ThemeTokens {
  return mode === "dark" ? darkTokens : lightTokens;
}

/**
 * Tailwind CSS class mappings for dark/light consistent component styling.
 * Use these instead of raw color utilities to stay token-consistent.
 */
export const themeClasses = {
  /** Page/card background */
  background: "bg-background dark:bg-background",
  /** Primary text */
  foreground: "text-foreground dark:text-foreground",
  /** Card surface */
  card: "bg-card dark:bg-card text-card-foreground dark:text-card-foreground",
  /** Secondary surfaces (sidebar, panels) */
  secondary: "bg-secondary dark:bg-secondary text-secondary-foreground dark:text-secondary-foreground",
  /** Muted text (descriptions, labels) */
  mutedText: "text-muted-foreground dark:text-muted-foreground",
  /** Input / border lines */
  border: "border-border dark:border-border",
  /** Destructive / error */
  destructive: "bg-destructive dark:bg-destructive text-destructive-foreground dark:text-destructive-foreground",
} as const;
