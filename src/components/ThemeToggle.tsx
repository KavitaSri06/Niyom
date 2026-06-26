import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Global dark/light switch. Rendered once at the app root as a fixed,
 * always-visible control so it appears on every surface (public site, CRM,
 * client portal) without editing each page's header. Styled with the theme
 * CSS variables so it looks correct in both modes.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        position: 'fixed',
        right: '18px',
        bottom: '18px',
        zIndex: 2147483000,
        width: '44px',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '9999px',
        background: 'var(--app-surface)',
        color: 'var(--app-accent)',
        border: '1px solid var(--app-line)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
        cursor: 'pointer',
      }}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
