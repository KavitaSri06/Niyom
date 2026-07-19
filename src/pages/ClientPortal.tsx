/**
 * ClientPortal — thin mount point for the NIYOM Wealth Portal.
 * -----------------------------------------------------------------------------
 * The full experience (sidebar shell, wealth dashboard, services/hooks) lives in
 * the isolated `src/portal` feature tree. This wrapper preserves the exact props
 * the host router in App.tsx already passes, so nothing else in the app changes.
 */
import PortalApp from '../portal/PortalApp';

interface Props {
  clientId: string;
  onLogout: () => void;
}

export default function ClientPortal({ clientId, onLogout }: Props) {
  return <PortalApp clientId={clientId} onLogout={onLogout} />;
}
