import { useMemo } from "react";
import { FilterGroup } from "../components/FilterGroup";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SearchBox } from "../components/SearchBox";
import { Avatar, Badge, Button } from "../components/ui";
import { type Member } from "../data/types";
import { diffDays, digitsOnly, formatDate, formatMoney, formatPhone, initialsOf } from "../lib/format";
import { isExpiringSoon, memberStatus, paymentState, paymentTone, statusTone } from "../lib/members";
import { type Screen } from "../navigation";
import { useStore } from "../store/store";

export const MEMBER_PAGE_SIZE = 10;

export const EXPIRY_OPTIONS = ["Any", "Next 7 days", "Next 30 days"];

export const PAYMENT_OPTIONS = ["All", "Paid", "Has dues", "Partial", "Unpaid"];

// Kept in App so filters survive opening a member and coming back.
export type MemberView = { status: string; plan: string; payment: string; expiry: string; page: number; showFilters: boolean };

export const defaultMemberView: MemberView = { status: "All", plan: "All", payment: "All", expiry: "Any", page: 0, showFilters: false };

export function matchesPayment(m: Member, filter: string) {
  if (filter === "All") return true;
  if (filter === "Has dues") return m.balance > 0;
  return paymentState(m) === filter;
}

export type FilterChip = { label: string; clear: Partial<MemberView> };

export function Members({ setScreen, query, setQuery, view, setView }: { setScreen: (s: Screen) => void; query: string; setQuery: (q: string) => void; view: MemberView; setView: React.Dispatch<React.SetStateAction<MemberView>> }) {
  const { data, today, viewMember } = useStore();
  const planNames = Array.from(new Set([...data.plans.map((p) => p.name), ...data.members.map((m) => m.plan)]));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = digitsOnly(q);
    const expiryDays = view.expiry === "Next 7 days" ? 7 : view.expiry === "Next 30 days" ? 30 : null;
    return data.members.filter((m) =>
      (!q || m.name.toLowerCase().includes(q) || (qDigits.length > 0 && m.phone.includes(qDigits)) || m.code.toLowerCase().includes(q)) &&
      (view.status === "All" || memberStatus(m, today) === view.status) &&
      (view.plan === "All" || m.plan === view.plan) &&
      matchesPayment(m, view.payment) &&
      (expiryDays === null || (memberStatus(m, today) === "Active" && diffDays(m.expiryDate, today) <= expiryDays)));
  }, [data.members, query, view.status, view.plan, view.payment, view.expiry, today]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / MEMBER_PAGE_SIZE));
  const safePage = Math.min(view.page, pageCount - 1);
  const visible = filtered.slice(safePage * MEMBER_PAGE_SIZE, (safePage + 1) * MEMBER_PAGE_SIZE);
  const chips: FilterChip[] = [];
  if (view.plan !== "All") chips.push({ label: `Plan: ${view.plan}`, clear: { plan: "All" } });
  if (view.payment !== "All") chips.push({ label: `Payment: ${view.payment}`, clear: { payment: "All" } });
  if (view.expiry !== "Any") chips.push({ label: `Expires: ${view.expiry}`, clear: { expiry: "Any" } });
  const total = data.members.length;
  const active = data.members.filter((m) => memberStatus(m, today) === "Active").length;
  const expiringSoon = data.members.filter((m) => isExpiringSoon(m, today)).length;
  const outstanding = data.members.reduce((s, m) => s + m.balance, 0);
  // Any filter change goes back to page 1.
  const set = (patch: Partial<MemberView>) => setView((v) => ({ ...v, page: 0, ...patch }));
  const clearFilters = () => set({ plan: "All", payment: "All", expiry: "Any" });
  const showAll = () => { setQuery(""); set({ status: "All", plan: "All", payment: "All", expiry: "Any" }); };
  const stats: [string, string, string, () => void][] = [
    ["All members", String(total), "", showAll],
    ["Active", String(active), "green-text", () => set({ status: "Active", plan: "All", payment: "All", expiry: "Any" })],
    ["Expiring soon", String(expiringSoon), "amber-text", () => set({ status: "All", plan: "All", payment: "All", expiry: "Next 7 days", showFilters: true })],
    ["Outstanding", formatMoney(outstanding), "", () => set({ status: "All", plan: "All", payment: "Has dues", expiry: "Any", showFilters: true })],
  ];
  return <div className="page">
    <PageHeader eyebrow="MEMBERS" title="Your members" subtitle="Manage profiles, memberships, and payment status." action={<Button icon="plus" onClick={() => setScreen("member-form")}>Add member</Button>}/>
    <div className="mini-stats mini-stats-clickable">{stats.map(([label, value, tone, onClick]) => <div key={label} role="button" tabIndex={0} title={`Show ${label.toLowerCase()}`} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}><span>{label}</span><strong className={tone}>{value}</strong></div>)}</div>
    <section className="panel table-panel">
      <div className="toolbar"><SearchBox value={query} onChange={(v) => { setQuery(v); set({}); }} placeholder="Search by name or phone"/><div className="filter-tabs">{["All","Active","Expired","Suspended"].map((f) => <button className={view.status === f ? "active" : ""} onClick={() => set({ status: f })} key={f}>{f}</button>)}</div><button className={`filter-btn ${view.showFilters || chips.length > 0 ? "active" : ""}`} onClick={() => setView((v) => ({ ...v, showFilters: !v.showFilters }))} aria-expanded={view.showFilters}><Icon name="settings" size={16}/> Filters{chips.length > 0 ? ` (${chips.length})` : ""}</button></div>
      {view.showFilters && <div className="filter-bar">
        <FilterGroup label="Plan" options={["All", ...planNames]} value={view.plan} onChange={(v) => set({ plan: v })}/>
        <FilterGroup label="Payment" options={PAYMENT_OPTIONS} value={view.payment} onChange={(v) => set({ payment: v })}/>
        <FilterGroup label="Expires" options={EXPIRY_OPTIONS} value={view.expiry} onChange={(v) => set({ expiry: v })}/>
        {chips.length > 0 && <button className="text-btn" onClick={clearFilters}>Clear filters</button>}
      </div>}
      {!view.showFilters && chips.length > 0 && <div className="filter-bar filter-summary"><span className="filter-summary-label">Filtered by</span>{chips.map((c) => <button className="filter-chip" key={c.label} onClick={() => set(c.clear)} title="Remove filter">{c.label}<Icon name="close" size={12}/></button>)}<button className="text-btn" onClick={clearFilters}>Clear filters</button></div>}
      <div className="desktop-table">
        <div className="table-row table-header"><span>Member</span><span>Status</span><span>Plan</span><span>Joined</span><span>Expires</span><span>Payment</span><span/></div>
        {visible.map((m) => { const status = memberStatus(m, today); const pay = paymentState(m); return <button className="table-row" key={m.id} onClick={() => viewMember(m.id)}><span className="member-cell"><Avatar initials={initialsOf(m.name)} color={m.color} small/><span><strong>{m.name}</strong><small>{formatPhone(m.phone)}</small></span></span><span><Badge tone={statusTone(status)}>{status}</Badge></span><span>{m.plan}</span><span>{formatDate(m.joined)}</span><span>{formatDate(m.expiryDate)}</span><span><Badge tone={paymentTone(pay)}>{pay}</Badge>{m.balance > 0 && <small className="balance">{formatMoney(m.balance)} due</small>}</span><span><Icon name="chevron" size={17}/></span></button>; })}
      </div>
      <div className="mobile-member-list">{visible.map((m) => { const status = memberStatus(m, today); const pay = paymentState(m); return <button className="member-card" key={m.id} onClick={() => viewMember(m.id)}><div className="member-card-top"><Avatar initials={initialsOf(m.name)} color={m.color}/><span><strong>{m.name}</strong><small>{formatPhone(m.phone)}</small></span><Icon name="chevron" size={18}/></div><div className="member-card-meta"><span><small>Plan</small>{m.plan}</span><span><small>Expires</small>{formatDate(m.expiryDate)}</span></div><div className="member-card-badges"><Badge tone={statusTone(status)}>{status}</Badge><Badge tone={paymentTone(pay)}>{pay}{m.balance > 0 ? ` · ${formatMoney(m.balance)} due` : ""}</Badge></div></button>; })}</div>
      {filtered.length === 0 && <div className="search-empty"><p>No members match your search or filters.</p><button className="text-btn" onClick={showAll}>Show all members</button></div>}
      <Pagination page={safePage} pageSize={MEMBER_PAGE_SIZE} total={filtered.length} noun="members" onPage={(p) => setView((v) => ({ ...v, page: p }))}/>
    </section>
  </div>;
}
