// Bond Master data access — React Query hooks over Supabase.
// Staff read the client-safe bm_bonds_public projection; the importer calls the
// bm_import_prices RPC (create-or-price-update by ISIN).

import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { BondPublic, ImportRow, ImportSummary } from './bondTypes';

export const bondQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

export const bondKeys = {
  list: (search: string) => ['bm_bonds', 'list', search] as const,
  detail: (id: string) => ['bm_bonds', 'detail', id] as const,
};

const LIST_COLUMNS =
  'id, isin, bond_name, issuer_name, coupon_rate, coupon_frequency, maturity_date, rating, ' +
  'rating_agency, latest_price, selling_price, price_updated_at, active_status, ' +
  'verification_status, data_quality_score, updated_at';

export function useBonds(search: string) {
  return useQuery({
    queryKey: bondKeys.list(search),
    queryFn: async (): Promise<BondPublic[]> => {
      let q = supabase.from('bm_bonds_public').select(LIST_COLUMNS)
        .order('updated_at', { ascending: false }).limit(2000);
      const s = search.trim();
      if (s) q = q.or(`isin.ilike.%${s}%,bond_name.ilike.%${s}%,issuer_name.ilike.%${s}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as BondPublic[]) ?? [];
    },
  });
}

export function useImportPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ImportRow[]): Promise<ImportSummary> => {
      const { data, error } = await supabase.rpc('bm_import_prices', { p_rows: rows });
      if (error) throw error;
      return data as ImportSummary;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bm_bonds'] }); },
  });
}
