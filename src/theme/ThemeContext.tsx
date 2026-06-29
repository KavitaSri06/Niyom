import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'niyom-theme';

interface ThemeContextValue {
  /** Current resolved theme. */
  theme: Theme;
  /** True when the user has not made an explicit choice (following the OS). */
  isSystem: boolean;
  /** Set an explicit theme (persisted to localStorage). */
  setTheme: (theme: Theme) => void;
  /** Toggle between light and dark (persists the result). */
  toggleTheme: () => void;
  /** Clear the saved preference and follow the OS again. */
  useSystemTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Resolve the initial theme using the same precedence as the anti-FOUC script
 * in index.html: saved preference -> OS preference -> dark (production default).
 * Reading the attribute the inline script already set keeps React in sync and
 * avoids a flash on hydration.
 */
function getInitialTheme(): { theme: Theme; isSystem: boolean } {
  if (typeof window === 'undefined') return { theme: 'dark', isSystem: false };

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return { theme: stored, isSystem: false };
  }

  // No saved choice — follow the attribute the inline script resolved, falling
  // back to a fresh system query / dark default.
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return { theme: attr, isSystem: true };

  const prefersDark =
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  return { theme: prefersDark ? 'dark' : 'light', isSystem: true };
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // Keep a class in sync so Tailwind's `dark:` variant works too.
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [{ theme, isSystem }, setState] = useState(getInitialTheme);

  // Apply theme to <html> whenever it changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow OS changes while the user is on the "system" preference.
  useEffect(() => {
    if (!isSystem || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) =>
      setState({ theme: e.matches ? 'dark' : 'light', isSystem: true });
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [isSystem]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'light' || e.newValue === 'dark') {
        setState({ theme: e.newValue, isSystem: false });
      } else {
        setState(getInitialTheme());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setState({ theme: next, isSystem: false });
  }, []);

  const toggleTheme = useCallback(() => {
    setState((prev) => {
      const next: Theme = prev.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return { theme: next, isSystem: false };
    });
  }, []);

  const useSystemTheme = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(getInitialTheme());
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, isSystem, setTheme, toggleTheme, useSystemTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
