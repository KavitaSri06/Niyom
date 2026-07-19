import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useFundCatalog } from '../../hooks/useFundCatalog';
import type { OrderType } from '../../types/funds';
import { FundDiscoveryPage } from './discovery/FundDiscoveryPage';
import { FundDetailsPage } from './details/FundDetailsPage';
import { InvestFlow } from './invest/InvestFlow';

type Screen =
  | { name: 'discovery' }
  | { name: 'details'; schemeCode: string }
  | { name: 'invest'; schemeCode: string; orderType: OrderType };

/**
 * Self-contained Mutual Fund module with its own screen machine
 * (discovery → details → invest). Loads the BSE scheme master once and hands
 * selected schemes to each screen. The portal's outer router only knows the
 * single `mutual-funds` view exists.
 */
export function MutualFundsModule({ clientId }: { clientId: string }) {
  const { schemes, facets, loading, error } = useFundCatalog();
  const [screen, setScreen] = useState<Screen>({ name: 'discovery' });

  const schemeOf = (code: string) => schemes.find((s) => s.schemeCode === code) ?? null;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger" />
        <p className="text-sm text-text-primary">{error}</p>
      </div>
    );
  }

  if (screen.name === 'details') {
    const scheme = schemeOf(screen.schemeCode);
    if (scheme) {
      return (
        <FundDetailsPage
          scheme={scheme}
          onBack={() => setScreen({ name: 'discovery' })}
          onInvest={(orderType) =>
            setScreen({ name: 'invest', schemeCode: scheme.schemeCode, orderType })
          }
        />
      );
    }
  }

  if (screen.name === 'invest') {
    const scheme = schemeOf(screen.schemeCode);
    if (scheme) {
      return (
        <InvestFlow
          scheme={scheme}
          clientId={clientId}
          initialType={screen.orderType}
          onBack={() => setScreen({ name: 'details', schemeCode: scheme.schemeCode })}
          onDone={() => setScreen({ name: 'discovery' })}
        />
      );
    }
  }

  return (
    <FundDiscoveryPage
      schemes={schemes}
      facets={facets}
      onOpenFund={(schemeCode) => setScreen({ name: 'details', schemeCode })}
      onInvest={(schemeCode) => setScreen({ name: 'invest', schemeCode, orderType: 'lumpsum' })}
    />
  );
}
