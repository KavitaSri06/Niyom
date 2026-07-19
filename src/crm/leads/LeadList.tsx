import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { NWEmployee } from '../types';
import {
  Search, Plus, SlidersHorizontal, X, ChevronLeft, ChevronRight, UserPlus,
  Pencil, Layers, Users2, Sparkles, Inbox, RefreshCw,
} from 'lucide-react';
import { NWLead, LeadListFilters, LeadStatus, LeadPriority, LeadOrigin } from './leadTypes';
import { LEAD_STATUSES, PRIORITIES, INTERESTED_PRODUCTS, LEAD_SOURCES, LEAD_ORIGIN_LABEL, PAGE_SIZE } from './leadConstants';
import { StatusBadge, PriorityBadge, ScoreBadge, Input, Select } from './leadUi';
import { isAdminRole, formatMoney, formatDate, initials, relativeTime } from './leadUtils';

const LEAD_SELECT =
  '*, owner:nw_employees!nw_leads_owner_employee_id_fkey(full_name, employee_code), ' +
  'created_by:nw_employees!nw_leads_created_by_employee_id_fkey(full_name, employee_code)';

const EMPTY_FILTERS: LeadListFilters = {
  search: '', status: '', priority: '', lead_origin: '', owner_employee_id: '',
  scope: 'all', city: '', product: '', source: '', min_investment: '', max_investment: '',
  date_from: '', date_to: '', include_archived: false,
};

interface Props {
  employee: NWEmployee;
  onNew: () => void;
  onOpen: (lead: NWLead) => void;
  onEdit: (lead: NWLead) => void;
  onAssign: (leads: NWLead[]) => void;
  refreshKey: number;               // bump to force a reload from the container
}

export default function LeadList({ employee, onNew, onOpen, onEdit, onAssign, refreshKey }: Props) {
  const isAdmin = isAdminRole(employee);
  const [leads, setLeads] = useState<NWLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LeadListFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [stats, setStats] = useState({ total: 0, today: 0, pool: 0, converted: 0 });

  const setF = (patch: Partial<LeadListFilters>) => { setFilters(f => ({ ...f, ...patch })); setPage(0); };

  // Debounce the free-text search box into the filter.
  useEffect(() => {
    const t = setTimeout(() => setF({ search: searchInput.trim() }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('nw_employees').select('id, full_name').eq('status', 'active').order('full_name')
      .then(({ data }) => setEmployees(data || []));
  }, [isAdmin]);

  const buildQuery = useCallback((forCount: boolean) => {
    let q = supabase.from('nw_leads').select(forCount ? 'id' : LEAD_SELECT,
      forCount ? { count: 'exact', head: true } : { count: 'exact' });

    if (!filters.include_archived) q = q.eq('is_archived', false);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.priority) q = q.eq('priority', filters.priority);
    if (filters.lead_origin) q = q.eq('lead_origin', filters.lead_origin);
    if (filters.product) q = q.eq('interested_product', filters.product);
    if (filters.source) q = q.eq('lead_source', filters.source);
    if (filters.city) q = q.ilike('city', `%${filters.city}%`);
    if (filters.min_investment) q = q.gte('investment_capacity', Number(filters.min_investment));
    if (filters.max_investment) q = q.lte('investment_capacity', Number(filters.max_investment));
    if (filters.date_from) q = q.gte('created_at', filters.date_from);
    if (filters.date_to) q = q.lte('created_at', `${filters.date_to}T23:59:59`);

    // Scope
    if (filters.scope === 'assigned') q = q.eq('owner_employee_id', employee.id);
    else if (filters.scope === 'self_generated') q = q.eq('created_by_employee_id', employee.id).eq('lead_origin', 'employee_manual');
    else if (filters.scope === 'pool') q = q.is('owner_employee_id', null);
    if (isAdmin && filters.owner_employee_id) q = q.eq('owner_employee_id', filters.owner_employee_id);

    if (filters.search) {
      const s = filters.search.replace(/[%,()]/g, ' ').trim();
      if (s) q = q.or(`lead_name.ilike.%${s}%,mobile.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%,lead_code.ilike.%${s}%`);
    }
    return q;
  }, [filters, isAdmin, employee.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const q = buildQuery(false)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data, count } = await q;
    setLeads((data as unknown as NWLead[]) || []);
    setTotal(count ?? 0);
    setSelected(new Set());
    setLoading(false);
  }, [buildQuery, page]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // KPI strip — independent lightweight counts.
  useEffect(() => {
    (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const [t, today, pool, conv] = await Promise.all([
        supabase.from('nw_leads').select('id', { count: 'exact', head: true }).eq('is_archived', false),
        supabase.from('nw_leads').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
        isAdmin ? supabase.from('nw_leads').select('id', { count: 'exact', head: true }).is('owner_employee_id', null).eq('is_archived', false)
                : Promise.resolve({ count: 0 } as any),
        supabase.from('nw_leads').select('id', { count: 'exact', head: true }).eq('status', 'Closed - Converted'),
      ]);
      setStats({ total: t.count ?? 0, today: today.count ?? 0, pool: pool.count ?? 0, converted: conv.count ?? 0 });
    })();
  }, [isAdmin, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount = useMemo(() =>
    (['status', 'priority', 'lead_origin', 'owner_employee_id', 'city', 'product', 'source',
      'min_investment', 'max_investment', 'date_from', 'date_to'] as (keyof LeadListFilters)[])
      .filter(k => filters[k]).length + (filters.include_archived ? 1 : 0),
    [filters]);

  const toggleSel = (id: string) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allOnPageSelected = leads.length > 0 && leads.every(l => selected.has(l.id));
  const toggleAll = () => setSelected(s => {
    const n = new Set(s);
    if (allOnPageSelected) leads.forEach(l => n.delete(l.id));
    else leads.forEach(l => n.add(l.id));
    return n;
  });
  const selectedLeads = leads.filter(l => selected.has(l.id));

  const scopeTabs: { key: LeadListFilters['scope']; label: string; icon: any; adminOnly?: boolean }[] = [
    { key: 'all', label: 'All Leads', icon: Layers },
    { key: 'assigned', label: 'My Assigned', icon: Users2 },
    { key: 'self_generated', label: 'Self-Generated', icon: Sparkles },
    { key: 'pool', label: 'Admin Pool', icon: Inbox, adminOnly: true },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>Lead Management</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Leads</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {isAdmin ? 'Full pipeline visibility across the team' : 'Your assigned & self-generated leads'}
          </p>
        </div>
        <button onClick={onNew}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-on-accent flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
          <Plus className="w-4 h-4" /> New Lead
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active Leads', value: stats.total },
          { label: "Today's Leads", value: stats.today },
          ...(isAdmin ? [{ label: 'In Admin Pool', value: stats.pool }] : [{ label: 'Converted', value: stats.converted }]),
          { label: isAdmin ? 'Converted' : 'Showing', value: isAdmin ? stats.converted : total },
        ].map(k => (
          <div key={k.label} className="rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{k.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{k.value.toLocaleString('en-IN')}</p>
          </div>
        ))}
      </div>

      {/* Scope tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {scopeTabs.filter(t => !t.adminOnly || isAdmin).map(t => {
          const active = filters.scope === t.key;
          return (
            <button key={t.key} onClick={() => setF({ scope: t.key })}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
              style={{
                background: active ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg-elevated)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Search + filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
          <Input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Search name, mobile, email, city, lead code…" style={{ paddingLeft: '2.25rem' }} />
        </div>
        <button onClick={() => setShowFilters(s => !s)}
          className="px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 relative"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <SlidersHorizontal className="w-4 h-4" /> Filters
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-on-accent" style={{ background: 'var(--accent)' }}>{activeFilterCount}</span>
          )}
        </button>
        <button onClick={load} className="p-2.5 rounded-xl" title="Refresh"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FilterSelect label="Status" value={filters.status} onChange={v => setF({ status: v as LeadStatus | '' })}
              options={LEAD_STATUSES.map(s => ({ value: s.label, label: s.label }))} />
            <FilterSelect label="Priority" value={filters.priority} onChange={v => setF({ priority: v as LeadPriority | '' })}
              options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))} />
            <FilterSelect label="Origin" value={filters.lead_origin} onChange={v => setF({ lead_origin: v as LeadOrigin | '' })}
              options={(Object.keys(LEAD_ORIGIN_LABEL) as LeadOrigin[]).map(o => ({ value: o, label: LEAD_ORIGIN_LABEL[o] }))} />
            {isAdmin && (
              <FilterSelect label="Owner" value={filters.owner_employee_id} onChange={v => setF({ owner_employee_id: v })}
                options={employees.map(e => ({ value: e.id, label: e.full_name }))} />
            )}
            <FilterSelect label="Product" value={filters.product} onChange={v => setF({ product: v })}
              options={INTERESTED_PRODUCTS.map(p => ({ value: p, label: p }))} />
            <FilterSelect label="Source" value={filters.source} onChange={v => setF({ source: v })}
              options={LEAD_SOURCES.map(s => ({ value: s, label: s }))} />
            <div>
              <FilterLabel>City</FilterLabel>
              <Input value={filters.city} onChange={e => setF({ city: e.target.value })} placeholder="City" />
            </div>
            <div>
              <FilterLabel>Min Investment</FilterLabel>
              <Input type="number" value={filters.min_investment} onChange={e => setF({ min_investment: e.target.value })} placeholder="₹" />
            </div>
            <div>
              <FilterLabel>Max Investment</FilterLabel>
              <Input type="number" value={filters.max_investment} onChange={e => setF({ max_investment: e.target.value })} placeholder="₹" />
            </div>
            <div>
              <FilterLabel>From Date</FilterLabel>
              <Input type="date" value={filters.date_from} onChange={e => setF({ date_from: e.target.value })} />
            </div>
            <div>
              <FilterLabel>To Date</FilterLabel>
              <Input type="date" value={filters.date_to} onChange={e => setF({ date_to: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2.5 cursor-pointer">
              <input type="checkbox" checked={filters.include_archived} onChange={e => setF({ include_archived: e.target.checked })} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Include archived</span>
            </label>
          </div>
          <div className="flex justify-end">
            <button onClick={() => { setFilters(EMPTY_FILTERS); setSearchInput(''); setPage(0); }}
              className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              <X className="w-3.5 h-3.5" /> Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* Bulk action bar (admin) */}
      {isAdmin && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{selected.size} selected</p>
          <div className="flex items-center gap-2">
            <button onClick={() => onAssign(selectedLeads)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg text-on-accent flex items-center gap-1.5"
              style={{ background: 'var(--accent)' }}>
              <UserPlus className="w-3.5 h-3.5" /> Assign
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {isAdmin && (
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} />
                  </th>
                )}
                {['Lead', 'Contact', 'Status', 'Priority', 'Score', 'Owner', 'Investment', 'Created', ''].map((h, i) => (
                  <th key={i} className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto" style={{ color: 'var(--accent)' }} />
                </td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-14">
                  <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No leads found</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>Try adjusting filters, or create a new lead.</p>
                </td></tr>
              ) : leads.map(l => (
                <tr key={l.id} className="transition-colors hover:bg-[var(--hover-bg)]" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {isAdmin && (
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSel(l.id)} />
                    </td>
                  )}
                  <td className="px-3 py-3 cursor-pointer" onClick={() => onOpen(l)}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
                        {initials(l.lead_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate max-w-[180px]" style={{ color: 'var(--text-primary)' }}>{l.lead_name}</p>
                        <p className="text-[11px] font-mono" style={{ color: 'var(--accent)' }}>{l.lead_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{l.mobile || '—'}</p>
                    <p className="text-[11px] truncate max-w-[160px]" style={{ color: 'var(--text-faint)' }}>{l.city || l.email || '—'}</p>
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={l.status} small /></td>
                  <td className="px-3 py-3"><PriorityBadge priority={l.priority} /></td>
                  <td className="px-3 py-3"><ScoreBadge score={l.lead_score} band={l.score_band} /></td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {l.owner ? <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{l.owner.full_name}</span>
                      : <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.12)', color: 'rgb(168,85,247)' }}>Admin Pool</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoney(l.investment_capacity)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(l.created_at)}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{relativeTime(l.created_at)}</p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onEdit(l)} className="p-1.5 rounded-lg" title="Edit"
                        style={{ color: 'var(--text-faint)' }}><Pencil className="w-3.5 h-3.5" /></button>
                      {isAdmin && (
                        <button onClick={() => onAssign([l])} className="p-1.5 rounded-lg" title="Assign"
                          style={{ color: 'var(--text-faint)' }}><UserPlus className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString('en-IN')}
            </p>
            <div className="flex items-center gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>{page + 1} / {totalPages}</span>
              <button disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>{children}</label>;
}

function FilterSelect({ label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <FilterLabel>{label}</FilterLabel>
      <Select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  );
}
