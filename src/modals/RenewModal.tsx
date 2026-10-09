import { db } from "../data/db";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui";
import { type Payment, paymentMethods } from "../data/types";
import { addDays, formatDate, formatDateLong, formatMoney, newId, nowLocal, parseMoney } from "../lib/format";
import { durationLabel } from "../lib/members";
import { useStore } from "../store/store";

export function RenewModal({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { data, today, reload } = useStore();
  const member = data.members.find((m) => m.id === memberId);
  const initialPlan = data.plans.find((p) => p.name === member?.plan) ?? data.plans[0];
  const [planId, setPlanId] = useState(initialPlan?.id ?? "");
  const [startDate, setStartDate] = useState(member && member.expiryDate >= today ? addDays(member.expiryDate, 1) : today);
  const [paid, setPaid] = useState(initialPlan ? String(initialPlan.price) : "");
  const [method, setMethod] = useState("UPI");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ plan: string; expiry: string; payment: Payment | null } | null>(null);
  const [saving, setSaving] = useState(false);
  if (!member) return null;
  const plan = data.plans.find((p) => p.id === planId);
  const price = plan?.price ?? 0;
  const paidValue = paid.trim() === "" ? 0 : parseMoney(paid);
  const expiry = plan ? addDays(startDate, plan.days - 1) : startDate;
  const after = member.balance + price - (Number.isFinite(paidValue) ? paidValue : 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return setError("Choose a plan. You can create plans on the Plans page.");
    if (!startDate) return setError("Choose a start date.");
    if (!Number.isInteger(paidValue) || paidValue < 0) return setError("Enter the amount received in whole rupees (0 if nothing was paid).");
    if (paidValue > member.balance + price) return setError(`Amount is more than the total due of ${formatMoney(member.balance + price)}.`);
    const createdAt = nowLocal();
    const payment: Payment | null = paidValue > 0 ? { id: newId(), memberId: member.id, memberName: member.name, paidAt: createdAt, method, amount: paidValue, status: after <= 0 ? "Paid" : "Partial", description: `${plan.name} membership renewal` } : null;
    setError("");
    setSaving(true);
    try {
      await db.renew({ memberId: member.id, planId: plan.id, startDate, paid: paidValue, method });
      await reload();
      setDone({ plan: plan.name, expiry, payment });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const paidNow = done?.payment ?? null;
  return <Modal title={done ? "Membership renewed" : "Renew membership"} subtitle={done ? `${member.name} is covered until ${formatDateLong(done.expiry)}.` : `${member.name} · ${member.plan} plan, expires ${formatDate(member.expiryDate)}`} onClose={onClose}>
    {done ? <div className="modal-success"><span className="success-icon"><Icon name="check" size={28}/></span><strong>{done.plan} plan until {formatDate(done.expiry)}</strong><p>{paidNow ? `${formatMoney(paidNow.amount)} received via ${paidNow.method}` : "No payment recorded yet. The amount is added to the member’s balance."}</p><Button onClick={onClose}>Done</Button></div>
    : <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="renew-plan">Plan</label><select id="renew-plan" value={planId} onChange={(e) => { const p = data.plans.find((x) => x.id === e.target.value); setPlanId(e.target.value); if (p) setPaid(String(p.price)); setError(""); }}>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {durationLabel(p.days)} · {formatMoney(p.price)}</option>)}</select></div>
      <div className="form-row"><div className="field"><label htmlFor="renew-start">Start date</label><input id="renew-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}/></div><div className="field"><label htmlFor="renew-end">Valid until</label><input id="renew-end" value={plan ? formatDate(expiry) : "—"} readOnly/></div></div>
      <div className="form-row"><div className="field"><label htmlFor="renew-paid">Amount received now</label><div className="money-input"><span>₹</span><input id="renew-paid" inputMode="numeric" value={paid} onChange={(e) => { setPaid(e.target.value); setError(""); }} placeholder="0"/></div></div><div className="field"><label htmlFor="renew-method">Payment method</label><select id="renew-method" value={method} onChange={(e) => setMethod(e.target.value)}>{paymentMethods.map((m) => <option key={m}>{m}</option>)}</select></div></div>
      <div className="balance-box"><span>Plan price<strong>{formatMoney(price)}</strong></span><span>Previous balance<strong>{formatMoney(member.balance)}</strong></span><span>Balance after renewal<strong className={after <= 0 ? "green-text" : "amber-text"}>{formatMoney(Math.max(0, after))}</strong></span></div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Renew membership"}</Button></div>
    </form>}
  </Modal>;
}
