/**
 * useAdminRouter — internal view state for the MF Admin console.
 * Dependency-free (no react-router); syncs to `?v=` so refreshes survive.
 */
import { useCallback, useEffect, useState } from 'react';
import { ADMIN_VIEW_TITLES, type AdminView } from '../layout/adminNav';

const PARAM = 'v';
const DEFAULT: AdminView = 'dashboard';
const VALID = Object.keys(ADMIN_VIEW_TITLES) as AdminView[];

const readView = (): AdminView => {
  const v = new URLSearchParams(window.location.search).get(PARAM);
  return v && (VALID as string[]).includes(v) ? (v as AdminView) : DEFAULT;
};

export function useAdminRouter() {
  const [view, setView] = useState<AdminView>(readView);

  const navigate = useCallback((next: AdminView) => {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    params.set(PARAM, next);
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  useEffect(() => {
    const onPop = () => setView(readView());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return { view, navigate };
}
