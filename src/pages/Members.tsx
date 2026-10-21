import { useMemo, useState } from "react";
import { FilterGroup } from "../components/FilterGroup";
import { RegistrationLinkModal } from "../components/RegistrationPanel";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SearchBox } from "../components/SearchBox";
import { Avatar, Badge, Button } from "../components/ui";
import { type Member } from "../data/types";
import { diffDays, digitsOnly, formatDate, formatMoney, formatPhone, initialsOf } from "../lib/format";
import { answerGroup, GOAL_FILTERS, HEARD_FILTERS, matchesNeed, memberNeeds, NEED_FILTERS, TIME_FILTERS } from "../lib/intake";
import { isExpiringSoon, memberStatus, paymentState, paymentTone, statusTone } from "../lib/members";
import { type Screen } from "../navigation";
import { useStore } from "../store/store";

export const MEMBER_PAGE_SIZE = 10;

export const EXPIRY_OPTIONS = ["Any", "Next 7 days", "Next 30 days"];

export const PAYMENT_OPTIONS = ["All", "Paid", "Has dues", "Partial", "Unpaid"];

/** How the member was added. "Registration form" = they filled in the gym's public link. */
export const SOURCE_OPTIONS = ["All", "Registration form", "Added in app"];

// Kept in App so filters survive opening a member and coming back.
// need / goal / time / heard come from the joining-form answers (what the member wants, how they found the gym).
export type MemberView = { status: string; plan: string; payment: string; expiry: string; source: string; need: string; goal: string; time: string; heard: string; page: number; showFilters: boolean };

/** Every filter (not the status tab) back to "All". */
const NO_FILTERS = { plan: "All", payment: "All", expiry: "Any", source: "All", need: "All", goal: "All", time: "All", heard: "All" };

export const defaultMemberView: MemberView = { status: "All", ...NO_FILTERS, page: 0, showFilters: false };

export function matchesPayment(m: Member, filter: string) {
  if (filter === "All") return true;
  if (m.pending) return false; // nothing charged yet
  if (filter === "Has dues") return m.balance > 0;
  return paymentState(m) === filter;
}

const matchesSource = (m: Member, filter: string) => filter === "All" || (filter === "Registration form") === (m.source === "form");

export type FilterChip = { label: string; clear: Partial<MemberView> };

/** What the member wants (from the joining form), as small tags. `max` keeps table rows short. */
export function NeedTags({ member, max = 3 }: { member: Member; max?: number }) {
  const tags = memberNeeds(member.intake);
  if (tags.length === 0) return <span className="need-none">—</span>;
  return <span className="need-tags">{tags.slice(0, max).map((t) => <Badge key={t.label} tone={t.tone}>{t.label}</Badge>)}{tags.length > max && <Badge>+{tags.length - max}</Badge>}</span>;
}

/** Opens the activation (first membership) without also opening the member's profile. */
function ActivateButton({ member }: { member: Member }) {
  const { openRenew } = useStore();
  return <button type="button" className="row-action" onClick={(e) => { e.stopPropagation(); openRenew(member.id); }}>Activate</button>;
}

export function Members({ setScreen, query, setQuery, view, setView }: { setScreen: (s: Screen) => void; query: string; setQuery: (q: string) => void; view: MemberView; setView: React.Dispatch<React.SetStateAction<MemberView>> }) {
  const { data, today, viewMember, account } = useStore();
  const [showLink, setShowLink] = useState(false);
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
      matchesSource(m, view.source) &&
      matchesNeed(m.intake, view.need) &&
      (view.goal === "All" || answerGroup("goal", m.intake.goal) === view.goal) &&
      (view.time === "All" || answerGroup("workoutTime", m.intake.workoutTime) === view.time) &&
      (view.heard === "All" || answerGroup("heardFrom", m.intake.heardFrom) === view.heard) &&
      (expiryDays === null || (memberStatus(m, today) === "Active" && diffDays(m.expiryDate, today) <= expiryDays)));
  }, [data.members, query, view.status, view.plan, view.payment, view.expiry, view.source, view.need, view.goal, view.time, view.heard, today]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / MEMBER_PAGE_SIZE));
  const safePage = Math.min(view.page, pageCount - 1);
  const visible = filtered.slice(safePage * MEMBER_PAGE_SIZE, (safePage + 1) * MEMBER_PAGE_SIZE);
  const chips: FilterChip[] = [];
  if (view.plan !== "All") chips.push({ label: `Plan: ${view.plan}`, clear: { plan: "All" } });
  if (view.payment !== "All") chips.push({ label: `Payment: ${view.payment}`, clear: { payment: "All" } });
  if (view.expiry !== "Any") chips.push({ label: `Expires: ${view.expiry}`, clear: { expiry: "Any" } });
  if (view.source !== "All") chips.push({ label: `Joined via: ${view.source}`, clear: { source: "All" } });
  if (view.need !== "All") chips.push({ label: `Needs: ${view.need}`, clear: { need: "All" } });
  if (view.goal !== "All") chips.push({ label: `Goal: ${view.goal}`, clear: { goal: "All" } });
  if (view.time !== "All") chips.push({ label: `Time: ${view.time}`, clear: { time: "All" } });
  if (view.heard !== "All") chips.push({ label: `Found us via: ${view.heard}`, clear: { heard: "All" } });
  const total = data.members.length;
  const active = data.members.filter((m) => memberStatus(m, today) === "Active").length;
  const pending = data.members.filter((m) => memberStatus(m, today) === "Pending").length;
  const expiringSoon = data.members.filter((m) => isExpiringSoon(m, today)).length;
  const outstanding = data.members.reduce((s, m) => s + m.balance, 0);
  // The Pending tab appears once someone has registered through the form (or is being looked at).
  const statusTabs = pending > 0 || view.status === "Pending" ? ["All", "Active", "Pending", "Expired", "Suspended"] : ["All", "Active", "Expired", "Suspended"];
  // Any filter change goes back to page 1.
  const set = (patch: Partial<MemberView>) => setView((v) => ({ ...v, page: 0, ...patch }));
  const clearFilters = () => set(NO_FILTERS);
  const showAll = () => { setQuery(""); set({ status: "All", ...NO_FILTERS }); };
  const stats: [string, string, string, () => void][] = [
    ["All members", String(total), "", showAll],
    ["Active", String(active), "green-text", () => set({ status: "Active", ...NO_FILTERS })],
    ["Expiring soon", String(expiringSoon), "amber-text", () => set({ status: "All", ...NO_FILTERS, expiry: "Next 7 days", showFilters: true })],
    ["Outstanding", formatMoney(outstanding), "", () => set({ status: "All", ...NO_FILTERS, payment: "Has dues", showFilters: true })],
  ];
  // Rows are focusable divs (not buttons) so pending members can have an Activate button inside.
  const rowProps = (m: Member) => ({
    role: "button",
    tabIndex: 0,
    onClick: () => viewMember(m.id),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); viewMember(m.id); } },
  });
  return <div className="page">
    <PageHeader eyebrow="MEMBERS" title="Your members" subtitle="Manage profiles, memberships, and payment status." action={<>{account.role === "owner" && <Button variant="secondary" icon="link" onClick={() => setShowLink(true)}>Registration link</Button>}<Button icon="plus" onClick={() => setScreen("member-form")}>Add member</Button></>}/>
    {showLink && <RegistrationLinkModal onClose={() => setShowLink(false)}/>}
    <div className="mini-stats mini-stats-clickable">{stats.map(([label, value, tone, onClick]) => <div key={label} role="button" tabIndex={0} title={`Show ${label.toLowerCase()}`} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}><span>{label}</span><strong className={tone}>{value}</strong></div>)}</div>
    <section className="panel table-panel">
      <div className="toolbar"><SearchBox value={query} onChange={(v) => { setQuery(v); set({}); }} placeholder="Search by name or phone"/><div className="filter-tabs">{statusTabs.map((f) => <button className={view.status === f ? "active" : ""} onClick={() => set({ status: f })} key={f}>{f}</button>)}</div><button className={`filter-btn ${view.showFilters || chips.length > 0 ? "active" : ""}`} onClick={() => setView((v) => ({ ...v, showFilters: !v.showFilters }))} aria-expanded={view.showFilters}><Icon name="settings" size={16}/> Filters{chips.length > 0 ? ` (${chips.length})` : ""}</button></div>
      {view.showFilters && <div className="filter-bar">
        <FilterGroup label="Plan" options={["All", ...planNames]} value={view.plan} onChange={(v) => set({ plan: v })}/>
        <FilterGroup label="Payment" options={PAYMENT_OPTIONS} value={view.payment} onChange={(v) => set({ payment: v })}/>
        <FilterGroup label="Expires" options={EXPIRY_OPTIONS} value={view.expiry} onChange={(v) => set({ expiry: v })}/>
        <FilterGroup label="Joined via" options={SOURCE_OPTIONS} value={view.source} onChange={(v) => set({ source: v })}/>
        <FilterGroup label="Needs" options={NEED_FILTERS} value={view.need} onChange={(v) => set({ need: v })}/>
        <FilterGroup label="Goal" options={GOAL_FILTERS} value={view.goal} onChange={(v) => set({ goal: v })}/>
        <FilterGroup label="Workout time" options={TIME_FILTERS} value={view.time} onChange={(v) => set({ time: v })}/>
        <FilterGroup label="Found us via" options={HEARD_FILTERS} value={view.heard} onChange={(v) => set({ heard: v })}/>
        {chips.length > 0 && <button className="text-btn" onClick={clearFilters}>Clear filters</button>}
      </div>}
      {!view.showFilters && chips.length > 0 && <div className="filter-bar filter-summary"><span className="filter-summary-label">Filtered by</span>{chips.map((c) => <button className="filter-chip" key={c.label} onClick={() => set(c.clear)} title="Remove filter">{c.label}<Icon name="close" size={12}/></button>)}<button className="text-btn" onClick={clearFilters}>Clear filters</button></div>}
      <div className="desktop-table">
        <div className="table-row table-header"><span>Member</span><span>Status</span><span>Needs</span><span>Plan</span><span>Joined</span><span>Expires</span><span>Payment</span><span/></div>
        {visible.map((m) => { const status = memberStatus(m, today); const pay = paymentState(m); return <div className="table-row" key={m.id} {...rowProps(m)}><span className="member-cell"><Avatar initials={initialsOf(m.name)} color={m.color} small/><span><strong>{m.name}</strong><small>{m.code} · {formatPhone(m.phone)}</small></span></span><span><Badge tone={statusTone(status)}>{status}</Badge></span><span><NeedTags member={m}/></span><span>{m.pending ? "—" : m.plan}</span><span>{formatDate(m.joined)}</span><span>{m.pending ? "—" : formatDate(m.expiryDate)}</span><span>{m.pending ? <ActivateButton member={m}/> : <><Badge tone={paymentTone(pay)}>{pay}</Badge>{m.balance > 0 && <small className="balance">{formatMoney(m.balance)} due</small>}</>}</span><span><Icon name="chevron" size={17}/></span></div>; })}
      </div>
      <div className="mobile-member-list">{visible.map((m) => { const status = memberStatus(m, today); const pay = paymentState(m); return <div className="member-card" key={m.id} {...rowProps(m)}><div className="member-card-top"><Avatar initials={initialsOf(m.name)} color={m.color}/><span><strong>{m.name}</strong><small>{m.code} · {formatPhone(m.phone)}</small></span><Icon name="chevron" size={18}/></div><div className="member-card-meta">{m.pending ? <><span><small>Registered</small>{formatDate(m.joined)}</span><span><small>Membership</small>Not started</span></> : <><span><small>Plan</small>{m.plan}</span><span><small>Expires</small>{formatDate(m.expiryDate)}</span></>}</div>{memberNeeds(m.intake).length > 0 && <div className="member-card-needs"><NeedTags member={m} max={4}/></div>}<div className="member-card-badges"><Badge tone={statusTone(status)}>{status}</Badge>{m.pending ? <ActivateButton member={m}/> : <Badge tone={paymentTone(pay)}>{pay}{m.balance > 0 ? ` · ${formatMoney(m.balance)} due` : ""}</Badge>}</div></div>; })}</div>
      {filtered.length === 0 && <div className="search-empty"><p>No members match your search or filters.</p><button className="text-btn" onClick={showAll}>Show all members</button></div>}
      <Pagination page={safePage} pageSize={MEMBER_PAGE_SIZE} total={filtered.length} noun="members" onPage={(p) => setView((v) => ({ ...v, page: p }))}/>
    </section>
  </div>;
}
