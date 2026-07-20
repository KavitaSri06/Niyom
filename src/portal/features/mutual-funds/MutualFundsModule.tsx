import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { NWHolding } from '../../../crm/types';
import { Segmented } from '../../components/Segmented';
import { useFundCatalog } from '../../hooks/useFundCatalog';
import type { OrderType } from '../../types/funds';
import { FundDiscoveryPage } from './discovery/FundDiscoveryPage';
import { FundDetailsPage } from './details/FundDetailsPage';
import { InvestFlow } from './invest/InvestFlow';
import { MyFundsPage } from './holdings/MyFundsPage';
import { RedeemFlow } from './redeem/RedeemFlow';
import { SwitchFlow } from './switch/SwitchFlow';
import { mapMfHoldings } from './mappers';

interface Props {
  clientId: string;
  /** Client's holdings (mutual-fund rows are used for My Funds / Redeem / Switch). */
  holdings: NWHolding[];
  holdingsLoading: boolean;
}

type Tab = 'explore' | 'my-funds';

type Screen =
  | { name: 'list' }
  | { name: 'details'; schemeCode: string }
  | { name: 'invest'; schemeCode: string; orderType: OrderType }
  | { name: 'redeem'; holdingId: string }
  | { name: 'switch'; holdingId: string };

/**
 * Self-contained Mutual Fund module. Owns an Explore | My Funds tab and a screen
 * machine (list → details → invest, and holdings → redeem / switch). Loads the
 * BSE scheme master once; the portal's outer router only knows `mutual-funds`.
 */
export function MutualFundsModule({ clientId, holdings, holdingsLoading }: Props) {
  const { schemes, facets, loading, error } = useFundCatalog();
  const [tab, setTab] = useState<Tab>('explore');
  const [screen, setScreen] = useState<Screen>({ name: 'list' });

  const mfHoldings = useMemo(() => mapMfHoldings(holdings, schemes), [holdings, schemes]);
  const schemeOf = (code: string) => schemes.find((s) => s.schemeCode === code) ?? null;
  const holdingOf = (id: string) => mfHoldings.find((h) => h.id === id) ?? null;

  const goList = () => setScreen({ name: 'list' });

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

  // --- Detail / flow screens take over the whole view ---------------------

  if (screen.name === 'details') {
    const scheme = schemeOf(screen.schemeCode);
    if (scheme) {
      return (
        <FundDetailsPage
          scheme={scheme}
          onBack={goList}
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
          onDone={goList}
        />
      );
    }
  }

  if (screen.name === 'redeem') {
    const holding = holdingOf(screen.holdingId);
    if (holding) {
      return <RedeemFlow holding={holding} clientId={clientId} onBack={goList} onDone={goList} />;
    }
  }

  if (screen.name === 'switch') {
    const holding = holdingOf(screen.holdingId);
    if (holding) {
      return (
        <SwitchFlow
          holding={holding}
          schemes={schemes}
          clientId={clientId}
          onBack={goList}
          onDone={goList}
        />
      );
    }
  }

  // --- List view: Explore / My Funds tabs ---------------------------------

  return (
    <div className="space-y-5">
      <Segmented<Tab>
        options={[
          { value: 'explore', label: 'Explore' },
          { value: 'my-funds', label: 'My Funds', count: mfHoldings.length || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'explore' ? (
        <FundDiscoveryPage
          schemes={schemes}
          facets={facets}
          onOpenFund={(schemeCode) => setScreen({ name: 'details', schemeCode })}
          onInvest={(schemeCode) => setScreen({ name: 'invest', schemeCode, orderType: 'lumpsum' })}
        />
      ) : (
        <MyFundsPage
          holdings={mfHoldings}
          loading={holdingsLoading}
          onRedeem={(holdingId) => setScreen({ name: 'redeem', holdingId })}
          onSwitch={(holdingId) => setScreen({ name: 'switch', holdingId })}
          onExplore={() => setTab('explore')}
        />
      )}
    </div>
  );
}
