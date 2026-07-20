/**
 * useAdminDashboard
 * -----------------------------------------------------------------------------
 * Loads the MF Admin dashboard aggregate. UI reads { data, loading, error }.
 */
import { useCallback, useEffect, useState } from 'react';
import { AdminService } from '../services/AdminService';
import type { AdminDashboardData } from '../types';

export function useAdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await AdminService.getDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
