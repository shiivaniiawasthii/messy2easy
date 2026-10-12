import { Icon } from "../components/Icon";
import { MemberValueChart } from "../components/MemberValueChart";
import { PageHeader } from "../components/PageHeader";
import { Badge, Button } from "../components/ui";
import { formatDate, formatMoney, formatPhone, formatShortDateTime } from "../lib/format";
import { memberRank, paymentTone, plural } from "../lib/members";
import { type Screen } from "../navigation";
import { useStore } from "../store/store";

// Opened from a Payments row: only this member's payment details.
export function MemberPayments({ memberId, setScreen }: { memberId: string | null; setScreen: (s: Screen) => void }) {
  const { data, openPayment, viewMember, account } = useStore();
  const isOwner = account.role === "owner";
  const member = data.members.find((m) => m.id === memberId);
  const backButton = <button className="back-btn" onClick={() => setScreen("payments")}><Icon name="arrow" size={17}/> Back to payments</button>;
  if (!member) return <div className="page">{backButton}<PageHeader title="Member not found" subtitle="This member may have been removed."/></div>;
  const payments = data.payments.filter((p) => p.memberId === member.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const last = payments[0];
  const rank = memberRank(data, member.id);
  return <div className="page">{backButton}
    <PageHeader eyebrow="PAYMENT HISTORY" title={member.name} subtitle={`+91 ${formatPhone(member.phone)} · ${member.plan} plan`} action={<><Button variant="secondary" icon="users" onClick={() => viewMember(member.id)}>View profile</Button><Button icon="plus" onClick={() => openPayment(member.id)}>Record payment</Button></>}/>
    <div className={`mini-stats payment-stats ${isOwner ? "" : "two"}`}>{isOwner && <div><span>Total paid</span><strong>{formatMoney(totalPaid)}</strong><small>{plural(payments.length, "payment")}</small></div>}<div><span>Due now</span><strong className={member.balance > 0 ? "amber-text" : "green-text"}>{formatMoney(member.balance)}</strong><small>{member.balance > 0 ? "Collect at next visit" : "Nothing pending"}</small></div>{isOwner && <div><span>Last payment</span><strong>{last ? formatMoney(last.amount) : "—"}</strong><small>{last ? `${formatDate(last.paidAt)} · ${last.method}` : "No payments yet"}</small></div>}{isOwner && <div><span>Value rank</span><strong>#{rank} <em className="rank-of">of {data.members.length}</em></strong><small>By total paid</small></div>}</div>
    {isOwner && <MemberValueChart member={member}/>}
    {!isOwner && <p className="field-help staff-note">You see only the payments you added for this member.</p>}
    <section className="panel table-panel">
      <div className="payment-list"><div className="payment-row payment-header"><span>Date</span><span>Description</span><span>Method</span><span>Amount</span><span>Status</span><span/></div>{payments.map((p) => <div className="payment-row static" key={p.id}><span><strong>{formatDate(p.paidAt)}</strong><small className="mobile-only">{p.method} · {p.description}</small>{isOwner && <small className="added-by">Added by {p.addedBy || "unknown"} · {formatShortDateTime(p.addedAt)}</small>}</span><span>{p.description}</span><span><Badge>{p.method}</Badge></span><span><strong>{formatMoney(p.amount)}</strong></span><span>{isOwner && <Badge tone={paymentTone(p.status)}>{p.status}</Badge>}</span><span/></div>)}</div>
      {payments.length === 0 && <div className="search-empty"><p>No payments recorded yet.</p></div>}
    </section>
  </div>;
}
