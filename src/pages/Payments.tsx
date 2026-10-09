import { useState } from "react";
import { ChangeText } from "../components/ChangeText";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SearchBox } from "../components/SearchBox";
import { Avatar, Badge, Button } from "../components/ui";
import { downloadCsv } from "../lib/download";
import { addDays, digitsOnly, formatDate, formatMoney, formatTime, initialsOf, MONTHS, parseDateTime } from "../lib/format";
import { paymentState, type PaymentState, paymentTone, plural, revenueRanking } from "../lib/members";
import { useStore } from "../store/store";

export const PAYMENT_PAGE_SIZE = 10;

export type PaymentRow = { key: string; memberId: string; name: string; date: string; method: string; amount: number; status: PaymentState };

export function Payments({ initialTab = "All" }: { initialTab?: "All" | PaymentState }) {
  const { data, today, openPayment, viewPayments } = useStore();
  const [tab, setTab] = useState<"All" | PaymentState>(initialTab);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const monthKey = today.slice(0, 7);
  const lastMonthDate = addDays(`${monthKey}-01`, -1);
  const monthPayments = data.payments.filter((p) => p.paidAt.startsWith(monthKey));
  const collected = monthPayments.reduce((s, p) => s + p.amount, 0);
  const lastCollected = data.payments.filter((p) => p.paidAt.startsWith(lastMonthDate.slice(0, 7))).reduce((s, p) => s + p.amount, 0);
  const todayPayments = data.payments.filter((p) => p.paidAt.startsWith(today));
  const withDues = data.members.filter((m) => m.balance > 0);
  const upi = monthPayments.filter((p) => p.method === "UPI").reduce((s, p) => s + p.amount, 0);
  const q = query.trim().toLowerCase();
  const rows: PaymentRow[] = tab === "Unpaid"
    ? withDues.filter((m) => !q || m.name.toLowerCase().includes(q) || m.phone.includes(digitsOnly(q) || "§")).map((m) => ({ key: m.id, memberId: m.id, name: m.name, date: `Due · ${formatDate(m.expiryDate)}`, method: "—", amount: m.balance, status: paymentState(m) }))
    : data.payments.filter((p) => (tab === "All" || p.status === tab) && (!q || p.memberName.toLowerCase().includes(q))).sort((a, b) => b.paidAt.localeCompare(a.paidAt)).map((p) => ({ key: p.id, memberId: p.memberId, name: p.memberName, date: `${parseDateTime(p.paidAt).getDate()} ${MONTHS[parseDateTime(p.paidAt).getMonth()]}, ${formatTime(p.paidAt)}`, method: p.method, amount: p.amount, status: p.status }));
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAYMENT_PAGE_SIZE) - 1));
  const visible = rows.slice(safePage * PAYMENT_PAGE_SIZE, (safePage + 1) * PAYMENT_PAGE_SIZE);
  const exportCsv = () => downloadCsv(`payments-${tab.toLowerCase()}-${today}.csv`, [["Member", "Date", "Method", "Amount (INR)", "Status"], ...rows.map((r) => [r.name, r.date, r.method, r.amount, r.status])]);
  return <div className="page">
    <PageHeader eyebrow="PAYMENTS" title="Payments & collections" subtitle="Record payments and track outstanding balances." action={<Button icon="plus" onClick={() => openPayment()}>Record payment</Button>}/>
    <div className="mini-stats payment-stats"><div><span>Collected this month</span><strong>{formatMoney(collected)}</strong><small><ChangeText current={collected} previous={lastCollected} suffix={`from ${MONTHS[parseDateTime(lastMonthDate).getMonth()]}`}/></small></div><div><span>Today</span><strong>{formatMoney(todayPayments.reduce((s, p) => s + p.amount, 0))}</strong><small>{plural(todayPayments.length, "transaction")}</small></div><div><span>Outstanding</span><strong className="amber-text">{formatMoney(withDues.reduce((s, m) => s + m.balance, 0))}</strong><small>{plural(withDues.length, "member")}</small></div><div><span>UPI payments</span><strong>{collected ? Math.round((upi / collected) * 100) : 0}%</strong><small>of this month</small></div></div>
    <TopPayingMembers/>
    <section className="panel table-panel"><div className="toolbar"><SearchBox value={query} onChange={(v) => { setQuery(v); setPage(0); }} placeholder="Search by member name"/><div className="filter-tabs">{(["All", "Paid", "Partial", "Unpaid"] as const).map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => { setTab(t); setPage(0); }}>{t}</button>)}</div><Button variant="secondary" icon="download" onClick={exportCsv} disabled={rows.length === 0}>Export</Button></div>
      <div className="payment-list"><div className="payment-row payment-header"><span>Member</span><span>Date</span><span>Method</span><span>Amount</span><span>Status</span><span/></div>{visible.map((r) => <button className="payment-row" key={r.key} onClick={() => viewPayments(r.memberId)} title={`Open ${r.name}’s payment history`}><span><strong>{r.name}</strong><small className="mobile-only">{r.date}</small></span><span>{r.date}</span><span>{r.method === "—" ? "—" : <Badge>{r.method}</Badge>}</span><span><strong>{formatMoney(r.amount)}</strong></span><span><Badge tone={paymentTone(r.status)}>{r.status}</Badge></span><span><Icon name="chevron" size={16}/></span></button>)}</div>
      {rows.length === 0 && <div className="search-empty"><p>{tab === "Unpaid" ? "No outstanding balances." : "No payments match your search."}</p></div>}
      <Pagination page={safePage} pageSize={PAYMENT_PAGE_SIZE} total={rows.length} noun={tab === "Unpaid" ? "members" : "payments"} onPage={setPage}/>
    </section>
  </div>;
}

/** "Who pays the most" — horizontal bars, top 5 members by total paid. */
export function TopPayingMembers() {
  const { data, viewPayments } = useStore();
  const top = revenueRanking(data).filter((r) => r.total > 0).slice(0, 5);
  if (top.length === 0) return null;
  const max = top[0].total;
  return <section className="panel top-members">
    <div className="panel-head"><div><h2>Top paying members</h2><p>Total paid since joining. Click a member to see their payments.</p></div></div>
    <div className="rank-list">{top.map((r, i) => <button className="rank-row" key={r.member.id} onClick={() => viewPayments(r.member.id)}><span className="rank-no">{i + 1}</span><Avatar initials={initialsOf(r.member.name)} color={r.member.color} small/><span className="rank-name"><strong>{r.member.name}</strong><small>{r.member.plan} · {plural(r.count, "payment")}</small></span><span className="rank-bar"><i style={{width: `${Math.max(4, Math.round((r.total / max) * 100))}%`}}/></span><strong className="rank-amount">{formatMoney(r.total)}</strong></button>)}</div>
  </section>;
}
