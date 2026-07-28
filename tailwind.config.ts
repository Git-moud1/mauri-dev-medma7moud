import type { Config } from 'tailwindcss';

/**
 * Design system: "Mauri-Dev · electric violet → cyan" (Liquid-glass inspired,
 * kept performant). All colors are exposed as CSS variables in globals.css so
 * light/dark mode swap happens by re-mapping tokens — not by inverting values.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (mapped to CSS vars — see globals.css)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        // Accent (kept named `gold` for backwards-compat — now brand violet)
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          soft: 'rgb(var(--gold-soft) / <alpha-value>)',
        },
        brand: {
          1: 'rgb(var(--brand-1) / <alpha-value>)',
          2: 'rgb(var(--brand-2) / <alpha-value>)',
          3: 'rgb(var(--brand-3) / <alpha-value>)',
        },
      },
      // Nested var() fallbacks, not side-by-side families: only the active
      // locale's variables are defined, and one undefined var() invalidates the
      // entire font-family declaration. See the note in globals.css.
      fontFamily: {
        display: ['var(--font-display, var(--font-arabic))', 'serif'],
        sans: ['var(--font-sans, var(--font-arabic))', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic, var(--font-sans))', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 10px 40px -12px rgb(var(--gold) / 0.45)',
        card: '0 8px 30px -10px rgb(0 0 0 / 0.35)',
      },
      backgroundImage: {
        'gold-grad':
          'linear-gradient(135deg, rgb(var(--brand-1)) 0%, rgb(var(--brand-2)) 50%, rgb(var(--brand-3)) 100%)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-rtl': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        marquee: 'marquee 32s linear infinite',
        'marquee-rtl': 'marquee-rtl 32s linear infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
