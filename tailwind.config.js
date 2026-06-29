/** @type {import('tailwindcss').Config} */

// Build a Tailwind color that reads an "R, G, B" CSS-variable triplet and still
// supports the `/opacity` modifier (e.g. `bg-success-soft/10`).
const rgbVar = (name) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `rgb(var(${name}))`
    : `rgb(var(${name}) / ${opacityValue})`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Drive the `dark:` variant off the same attribute the ThemeProvider sets.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
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
