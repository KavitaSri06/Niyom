// Bond Security Master — module container. Scopes React Query to the module and
// switches between the master list, the price importer, and a bond profile.

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { NWEmployee, CRMPage } from '../types';
import { bondQueryClient } from './bondClient';
import BondMasterList from './BondMasterList';
import BondImport from './BondImport';
import BondProfile from './BondProfile';

interface Props {
  employee: NWEmployee;
  onNavigate?: (page: CRMPage, params?: Record<string, string>) => void;
  pageParams?: Record<string, string>;
}

type View = { name: 'list' } | { name: 'import' } | { name: 'profile'; id: string };

export default function Bonds({ employee }: Props) {
  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';
  const [view, setView] = useState<View>({ name: 'list' });

  return (
    <QueryClientProvider client={bondQueryClient}>
      {view.name === 'list' && (
        <BondMasterList isAdmin={isAdmin}
          onUpload={() => setView({ name: 'import' })}
          onOpen={id => setView({ name: 'profile', id })} />
      )}
      {view.name === 'import' && isAdmin && (
        <BondImport onBack={() => setView({ name: 'list' })} onDone={() => setView({ name: 'list' })} />
      )}
      {view.name === 'profile' && (
        <BondProfile bondId={view.id} isAdmin={isAdmin} onBack={() => setView({ name: 'list' })} />
      )}
    </QueryClientProvider>
  );
}
