/**
 * MF Admin navigation — single source of truth for the console sidebar.
 * The full BSE StAR MF operations surface, so employees never open BSE directly.
 */
import {
  LayoutDashboard,
  Users,
  Hash,
  ShieldCheck,
  ListChecks,
  ShoppingCart,
  CalendarClock,
  Undo2,
  ArrowLeftRight,
  Repeat,
  ArrowDownUp,
  FileText,
  Coins,
  Percent,
  ScrollText,
  Bell,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type AdminView =
  | 'dashboard'
  | 'clients'
  | 'ucc'
  | 'kyc'
  | 'orders'
  | 'purchase'
  | 'sip'
  | 'redeem'
  | 'switch'
  | 'stp'
  | 'swp'
  | 'reports'
  | 'brokerage'
  | 'commission'
  | 'audit'
  | 'notifications'
  | 'settings';

export interface AdminNavItem {
  view: AdminView;
  label: string;
  icon: LucideIcon;
}

export interface AdminNavGroup {
  heading?: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    items: [{ view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    heading: 'Onboarding',
    items: [
      { view: 'clients', label: 'Client Management', icon: Users },
      { view: 'ucc', label: 'UCC Management', icon: Hash },
      { view: 'kyc', label: 'KYC', icon: ShieldCheck },
    ],
  },
  {
    heading: 'Transactions',
    items: [
      { view: 'orders', label: 'Order Book', icon: ListChecks },
      { view: 'purchase', label: 'Purchase', icon: ShoppingCart },
      { view: 'sip', label: 'SIP', icon: CalendarClock },
      { view: 'redeem', label: 'Redeem', icon: Undo2 },
      { view: 'switch', label: 'Switch', icon: ArrowLeftRight },
      { view: 'stp', label: 'STP', icon: Repeat },
      { view: 'swp', label: 'SWP', icon: ArrowDownUp },
    ],
  },
  {
    heading: 'Revenue',
    items: [
      { view: 'brokerage', label: 'Brokerage', icon: Coins },
      { view: 'commission', label: 'Commission', icon: Percent },
      { view: 'reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    heading: 'System',
    items: [
      { view: 'audit', label: 'Audit Log', icon: ScrollText },
      { view: 'notifications', label: 'Notifications', icon: Bell },
      { view: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const ADMIN_VIEW_TITLES: Record<AdminView, string> = {
  dashboard: 'Operations Dashboard',
  clients: 'Client Management',
  ucc: 'UCC Management',
  kyc: 'KYC',
  orders: 'Order Book',
  purchase: 'Purchase',
  sip: 'SIP Book',
  redeem: 'Redemptions',
  switch: 'Switches',
  stp: 'Systematic Transfer Plan',
  swp: 'Systematic Withdrawal Plan',
  reports: 'Reports',
  brokerage: 'Brokerage',
  commission: 'Commission',
  audit: 'Audit Log',
  notifications: 'Notifications',
  settings: 'Settings',
};
