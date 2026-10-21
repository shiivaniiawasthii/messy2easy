import { db } from "../data/db";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui";
import { type Member, type Payment, paymentMethods } from "../data/types";
import { addDays, formatDate, formatDateLong, formatMoney, newId, nowLocal, parseMoney } from "../lib/format";
import { chosenPlan, JOIN_PAYMENTS } from "../lib/intake";
import { durationLabel, needsAadhaarCheck } from "../lib/members";
import { useStore } from "../store/store";

/**
 * Renew a membership, or start the first one. A registration from the form starts with what the
 * person chose (duration, start date, payment method): only the fee is entered. It needs the
 * owner's Aadhaar check first (the database enforces that too).
 */
export function RenewModal({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { data } = useStore();
  const member = data.members.find((m) => m.id === memberId);
  // Decided when the dialog opens, so the "started" screen stays after the data reloads.
  const [chosen] = useState(() => (member && member.pending && member.source === "form" ? chosenPlan(member.intake, data.plans) : null));
  if (member && needsAadhaarCheck(member)) return <Modal title="Start membership" subtitle={`${member.name} · ${member.code}`} onClose={onClose}>
    <div className="modal-body confirm-body"><span className="confirm-icon"><Icon name="shield" size={22}/></span><p>The gym owner has to check {member.name}’s Aadhaar first. Open their profile and tap “Aadhaar valid”; then enter the fee to start.</p><div className="modal-actions"><Button onClick={onClose}>OK</Button></div></div>
  </Modal>;
  if (member && chosen) return <StartRegistration member={member} chosen={chosen} onClose={onClose}/>;
  return <RenewForm memberId={memberId} onClose={onClose}/>;
}

/** First membership of a verified registration: everything from the form, the gym enters the fee. */
function StartRegistration({ member, chosen, onClose }: { member: Member; chosen: { name: string; days: number }; onClose: () => void }) {
  const { today, reload } = useStore();
  const start = member.intake.startDate || today;
  const expiry = addDays(start, chosen.days - 1);
  const [fee, setFee] = useState("");
  const [paid, setPaid] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  // From the form ("Online (via UPI)" / "Offline (Cash)"); changeable only if they paid another way.
  const formMethod = member.intake.payment === "Cash" ? "Cash" : "UPI";
  const [method, setMethod] = useState(formMethod);
  const [changeMethod, setChangeMethod] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const feeValue = fee.trim() === "" ? NaN : parseMoney(fee);
  const paidValue = paid.trim() === "" ? 0 : parseMoney(paid);
  const due = Number.isFinite(feeValue) ? Math.max(0, feeValue - (Number.isFinite(paidValue) ? paidValue : 0)) : 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isInteger(feeValue) || feeValue < 0) return setError("Enter the fee for this membership in whole rupees.");
    if (!Number.isInteger(paidValue) || paidValue < 0) return setError("Enter the amount received in whole rupees (0 if nothing was paid).");
    if (paidValue > feeValue) return setError("Amount received can't be more than the fee.");
    setError("");
    setSaving(true);
    try {
      await db.startRegistration({ memberId: member.id, fee: feeValue, paid: paidValue, method });
      await reload();
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return <Modal title={done ? "Membership started" : "Start membership"} subtitle={done ? `${member.name} is covered until ${formatDateLong(expiry)}.` : `${member.name} · ${member.code} · chosen on the registration form`} onClose={onClose}>
    {done ? <div className="modal-success"><span className="success-icon"><Icon name="check" size={28}/></span><strong>{chosen.name} until {formatDate(expiry)}</strong><p>{paidValue > 0 ? `${formatMoney(paidValue)} received via ${method}` : "No payment recorded yet."}{due > 0 ? ` ${formatMoney(due)} is due.` : ""}</p><Button onClick={onClose}>Done</Button></div>
    : <form onSubmit={submit} noValidate>
      <div className="chosen-summary">
        <span>Plan<strong>{chosen.name}</strong></span>
        <span>Starts<strong>{formatDate(start)}</strong></span>
        <span>Valid until<strong>{formatDate(expiry)}</strong></span>
        <span>Payment<strong>{JOIN_PAYMENTS.find(([v]) => v === method)?.[1] ?? method}</strong>{!changeMethod && <button type="button" className="text-btn" onClick={() => setChangeMethod(true)}>Change</button>}</span>
      </div>
      {changeMethod && <div className="field"><label htmlFor="start-method">Payment method <small>chosen on the form: {JOIN_PAYMENTS.find(([v]) => v === formMethod)?.[1]}</small></label><select id="start-method" value={method} onChange={(e) => setMethod(e.target.value)}>{paymentMethods.map((m) => <option key={m}>{m}</option>)}</select></div>}
      <div className="form-row">
        <div className="field"><label htmlFor="start-fee">Fee for this membership <i>*</i></label><div className="money-input"><span>₹</span><input id="start-fee" inputMode="numeric" autoFocus value={fee} onChange={(e) => { setFee(e.target.value); if (!paidTouched) setPaid(e.target.value); setError(""); }} placeholder="e.g. 2500"/></div></div>
        <div className="field"><label htmlFor="start-paid">Amount received now</label><div className="money-input"><span>₹</span><input id="start-paid" inputMode="numeric" value={paid} onChange={(e) => { setPaid(e.target.value); setPaidTouched(true); setError(""); }} placeholder="0"/></div></div>
      </div>
      <div className="balance-box"><span>Fee<strong>{formatMoney(Number.isFinite(feeValue) ? feeValue : 0)}</strong></span><span>Received now<strong>{formatMoney(Number.isFinite(paidValue) ? paidValue : 0)}</strong></span><span>Due after this<strong className={due > 0 ? "amber-text" : "green-text"}>{formatMoney(due)}</strong></span></div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Start membership"}</Button></div>
    </form>}
  </Modal>;
}

function RenewForm({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { data, today, reload } = useStore();
  const member = data.members.find((m) => m.id === memberId);
  // A registration is activated with what the person chose on the form (plan, start date, payment method).
  const chosen = member?.pending ? member.intake : {};
  // "3 Months" chosen before the gym had plans → the plan of about that many days (1 month ≈ 30 days).
  const byMonths = chosen.planMonths ? data.plans.find((p) => Math.abs(p.days - chosen.planMonths! * 30.4) <= chosen.planMonths! * 2 + 1) : undefined;
  const initialPlan = data.plans.find((p) => p.id === chosen.planId) ?? byMonths ?? data.plans.find((p) => p.name === member?.plan) ?? data.plans[0];
  const [planId, setPlanId] = useState(initialPlan?.id ?? "");
  const [startDate, setStartDate] = useState(chosen.startDate && chosen.startDate >= today ? chosen.startDate : member && member.expiryDate >= today ? addDays(member.expiryDate, 1) : today);
  const [paid, setPaid] = useState(initialPlan ? String(initialPlan.price) : "");
  const [method, setMethod] = useState(chosen.payment === "Cash" ? "Cash" : "UPI");
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
    const payment: Payment | null = paidValue > 0 ? { id: newId(), memberId: member.id, memberName: member.name, paidAt: createdAt, method, amount: paidValue, status: after <= 0 ? "Paid" : "Partial", description: `${plan.name} membership renewal`, addedBy: "", addedAt: createdAt } : null;
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
  // A member who registered through the form has no membership yet: this starts the first one.
  const activating = member.pending;
  const title = activating ? (done ? "Membership activated" : "Activate membership") : (done ? "Membership renewed" : "Renew membership");
  const subtitle = done ? `${member.name} is covered until ${formatDateLong(done.expiry)}.` : activating ? `${member.name} · ${member.code} · registered ${formatDate(member.joined)}` : `${member.name} · ${member.plan} plan, expires ${formatDate(member.expiryDate)}`;
  return <Modal title={title} subtitle={subtitle} onClose={onClose}>
    {done ? <div className="modal-success"><span className="success-icon"><Icon name="check" size={28}/></span><strong>{done.plan} plan until {formatDate(done.expiry)}</strong><p>{paidNow ? `${formatMoney(paidNow.amount)} received via ${paidNow.method}` : "No payment recorded yet. The amount is added to the member’s balance."}</p><Button onClick={onClose}>Done</Button></div>
    : <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="renew-plan">Plan</label><select id="renew-plan" value={planId} onChange={(e) => { const p = data.plans.find((x) => x.id === e.target.value); setPlanId(e.target.value); if (p) setPaid(String(p.price)); setError(""); }}>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {durationLabel(p.days)} · {formatMoney(p.price)}</option>)}</select></div>
      <div className="form-row"><div className="field"><label htmlFor="renew-start">Start date</label><input id="renew-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}/></div><div className="field"><label htmlFor="renew-end">Valid until</label><input id="renew-end" value={plan ? formatDate(expiry) : "—"} readOnly/></div></div>
      <div className="form-row"><div className="field"><label htmlFor="renew-paid">Amount received now</label><div className="money-input"><span>₹</span><input id="renew-paid" inputMode="numeric" value={paid} onChange={(e) => { setPaid(e.target.value); setError(""); }} placeholder="0"/></div></div><div className="field"><label htmlFor="renew-method">Payment method</label><select id="renew-method" value={method} onChange={(e) => setMethod(e.target.value)}>{paymentMethods.map((m) => <option key={m}>{m}</option>)}</select></div></div>
      <div className="balance-box"><span>Plan price<strong>{formatMoney(price)}</strong></span><span>Previous balance<strong>{formatMoney(member.balance)}</strong></span><span>Balance after {activating ? "activation" : "renewal"}<strong className={after <= 0 ? "green-text" : "amber-text"}>{formatMoney(Math.max(0, after))}</strong></span></div>
      {data.plans.length === 0 && <p className="form-note">No plans yet. Create one on the Plans page first.</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : activating ? "Activate membership" : "Renew membership"}</Button></div>
    </form>}
  </Modal>;
}
