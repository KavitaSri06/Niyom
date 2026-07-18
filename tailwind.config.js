/** @type {import('tailwindcss').Config} */

// Build a Tailwind color that reads an "R, G, B" CSS-variable triplet and still
// supports the `/opacity` modifier (e.g. `bg-success-soft/10`).
//
// The triplets are COMMA-separated ("201, 184, 150") because the app also
// composites them inline as `rgba(var(--accent-rgb), 0.1)`. That means the
// alpha form must use legacy `rgba(r, g, b, a)` syntax — emitting
// `rgb(var(--x) / a)` expands to `rgb(201, 184, 150 / 1)`, which mixes comma
// and slash syntax, is invalid CSS, and silently drops the color.
const rgbVar = (name) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `rgb(var(${name}))`
    : `rgba(var(${name}), ${opacityValue})`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Drive the `dark:` variant off the same attribute the ThemeProvider sets.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // Type families. Deliberately does NOT redefine `sans` or `mono` —
      // `font-mono` has 55 existing usages and the sans default is the CRM's
      // UI face; overriding either would restyle the app implicitly.
      // Follow the CSS tokens so a brand type change lives in one place
      // (src/theme/tokens.css). display = Space Grotesk, body/sans = Inter.
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        sans: ['var(--font-body)'],
      },
      // Target radius scale (see --radius-* in tokens.css). Exposed under a
      // `token-` prefix so the stock rounded-* utilities keep working while
      // call sites migrate onto the scale.
      borderRadius: {
        'token-sm': 'var(--radius-sm)',
        'token-md': 'var(--radius-md)',
        'token-lg': 'var(--radius-lg)',
        'token-xl': 'var(--radius-xl)',
      },
      transitionTimingFunction: {
        'token-out': 'var(--ease-out)',
        'token-in-out': 'var(--ease-in-out)',
      },
      colors: {
        // ---- Surfaces (solid) ----
        'bg-base': 'var(--bg-base)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-surface': 'var(--bg-surface)',
        'bg-raised': 'var(--bg-raised)',
        card: 'var(--card-bg)',
        modal: 'var(--modal-bg)',
        sidebar: 'var(--sidebar-bg)',
        header: 'var(--header-bg)',
        input: 'var(--input-bg)',

        // ---- Borders (solid) ----
        border: {
          DEFAULT: 'var(--border)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          stronger: 'var(--border-stronger)',
        },
        divider: 'var(--divider)',

        // ---- Text (solid) ----
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
          bright: 'var(--text-bright)',
          'on-accent': 'var(--text-on-accent)',
        },

        // ---- Brand accent (alpha-capable) ----
        accent: {
          DEFAULT: rgbVar('--accent-rgb'),
          soft: rgbVar('--accent-soft-rgb'),
          'soft-deep': rgbVar('--accent-soft-deep-rgb'),
          strong: 'var(--accent-strong)',
        },

        // ---- Semantic state: solid (alpha-capable) ----
        success: rgbVar('--success-rgb'),
        danger: rgbVar('--danger-rgb'),
        warning: rgbVar('--warning-rgb'),
        info: rgbVar('--info-rgb'),

        // ---- Semantic state: soft / status (alpha-capable) ----
        'success-soft': rgbVar('--success-soft-rgb'),
        'danger-soft': rgbVar('--danger-soft-rgb'),
        'warning-soft': rgbVar('--warning-soft-rgb'),
        'info-soft': rgbVar('--info-soft-rgb'),

        // ---- Category / chart palette (alpha-capable) ----
        'c-emerald': rgbVar('--c-emerald-rgb'),
        'c-red': rgbVar('--c-red-rgb'),
        'c-blue': rgbVar('--c-blue-rgb'),
        'c-amber': rgbVar('--c-amber-rgb'),
        'c-orange': rgbVar('--c-orange-rgb'),
        'c-pink': rgbVar('--c-pink-rgb'),
        'c-cyan': rgbVar('--c-cyan-rgb'),
        'c-violet': rgbVar('--c-violet-rgb'),
      },
      backgroundColor: {
        overlay: 'var(--bg-overlay)',
        hover: 'var(--hover-bg)',
        selected: 'var(--selected-bg)',
        disabled: 'var(--disabled-bg)',
      },
      textColor: {
        'on-accent': 'var(--text-on-accent)',
        placeholder: 'var(--text-placeholder)',
        disabled: 'var(--disabled-text)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      ringColor: {
        focus: 'var(--focus-ring)',
      },
      boxShadow: {
        'token-sm': 'var(--shadow-sm)',
        'token-md': 'var(--shadow-md)',
        'token-lg': 'var(--shadow-lg)',
        'token-card': 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
};
