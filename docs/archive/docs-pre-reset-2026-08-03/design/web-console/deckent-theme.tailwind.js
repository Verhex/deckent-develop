// ============================================================================
// deckent Web Console — Tailwind theme extension (fonts + brand/gold colors)
// Merge this into your tailwind.config.{js,ts} under theme.extend.
// Pairs with deckent-theme.css (CSS variables for the shadcn semantic tokens).
// ============================================================================

/** @type {import('tailwindcss').Config['theme']} */
const deckentThemeExtend = {
  fontFamily: {
    // load the families (see fonts note in HANDOFF.md / README.md)
    sans: ['"Hanken Grotesk"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
    mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  },
  colors: {
    // brand teal — replaces blue-500/600 usages
    brand: {
      DEFAULT: "#54A89C",
      50:  "#EAF4EF",
      100: "#D9ECE5",
      200: "#B6D8CE",
      300: "#8FCDBE",
      400: "#6FBCAE",
      500: "#54A89C", // primary accent
      600: "#3E9384", // hover
      700: "#2F7568",
      800: "#246060",
      900: "#1A4A45",
    },
    // gold — secondary highlight / ornament
    gold: {
      DEFAULT: "#C0B46C",
      soft: "#D6CB8C",
      deep: "#9A8736",
      tint: "#1E1B0E",
    },
  },
};

module.exports = { deckentThemeExtend };
// ESM: export { deckentThemeExtend };

/* In tailwind.config.js:

   const { deckentThemeExtend } = require("./deckent-theme.tailwind");
   module.exports = {
     // …
     theme: { extend: { ...deckentThemeExtend } },
   };

   Then, blue → brand find/replace across the dashboard components:
     blue-500            → brand-500
     blue-600            → brand-600 (filled CTAs, send button, user bubble)
     blue-400 / blue-300 → brand-300 (light accent text: chat head, slash hints)
     bg-blue-900         → bg-[hsl(var(--brand-bg))]   (info badge / bot avatar)
     text-blue-100       → text-[hsl(var(--brand-fg))]
     ring-blue-500       → ring-ring
   Add gold where the design now uses it:
     active nav link  → border-l-2 border-[hsl(var(--gold))]
     worker tier label→ text-[hsl(var(--gold))]
     terminal tab(active) icon, "skill of the week" accents → gold
*/
