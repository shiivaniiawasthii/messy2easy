import { db } from "../data/db";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui";
import { digitsOnly, formatDate, formatMoney, formatPhone, isValidIndianMobile, parseMoney } from "../lib/format";
import { durationLabel } from "../lib/members";
import { type Screen } from "../navigation";
import { useStore } from "../store/store";

export function MemberForm({ editingId, setScreen }: { editingId: string | null; setScreen: (s: Screen) => void }) {
  const { data, today, reload, viewMember } = useStore();
  const editing = editingId ? data.members.find((m) => m.id === editingId) ?? null : null;
  const defaultPlan = data.plans.find((p) => p.name === "Monthly") ?? data.plans[0];
  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing ? formatPhone(editing.phone) : "");
  const [joined, setJoined] = useState(editing?.joined ?? today);
  const [emergency, setEmergency] = useState(editing?.emergency ?? "");
  const [dob, setDob] = useState(editing?.dob ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [suspended, setSuspended] = useState(editing?.suspended ?? false);
  const [planId, setPlanId] = useState(defaultPlan?.id ?? "custom");
  const [customDays, setCustomDays] = useState("30");
  const [customPrice, setCustomPrice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const back = () => (editing ? viewMember(editing.id) : setScreen("members"));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const digits = digitsOnly(phone).replace(/^91(?=\d{10}$)/, "");
    if (trimmed.length < 2) return setError("Enter the member’s full name.");
    if (!isValidIndianMobile(digits)) return setError("Enter a valid 10-digit Indian mobile number.");
    const duplicate = data.members.find((m) => m.id !== editing?.id && m.phone === digits);
    if (duplicate) return setError(`This mobile number already belongs to ${duplicate.name}.`);
    if (!joined) return setError("Choose a joining date.");
    if (editing) {
      setSaving(true);
      try {
        await db.updateMember(editing.id, { name: trimmed, phone: digits, joined, emergency: emergency.trim(), dob, notes: notes.trim(), suspended });
        await reload();
        viewMember(editing.id);
      } catch (err) {
        setError((err as Error).message);
        setSaving(false);
      }
      return;
    }
    const plan = planId === "custom" ? null : data.plans.find((p) => p.id === planId);
    const days = plan ? plan.days : Number(customDays);
    const price = plan ? plan.price : parseMoney(customPrice);
    if (!Number.isInteger(days) || days < 1) return setError("Enter a custom duration of at least 1 day.");
    if (!Number.isInteger(price) || price < 0) return setError("Enter the custom price in whole rupees.");
    setSaving(true);
    try {
      const id = await db.addMember({ name: trimmed, phone: digits, joined, emergency: emergency.trim(), dob, notes: notes.trim(), planId: plan ? plan.id : null, customDays: days, customPrice: price });
      await reload();
      viewMember(id);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return <div className="page form-page"><button className="back-btn" onClick={back}><Icon name="arrow" size={17}/> {editing ? "Back to profile" : "Back to members"}</button><PageHeader title={editing ? `Edit ${editing.name}` : "Add new member"} subtitle={editing ? "Update contact details, notes and membership status." : "Create a profile and assign their first membership."}/>
    <form className="member-form" onSubmit={submit} noValidate><section className="panel form-section"><div className="section-number">1</div><div className="section-body"><h2>Personal details</h2><p>Basic contact information for the member.</p><div className="form-grid"><div className="field span-2"><label htmlFor="member-name">Full name <i>*</i></label><input id="member-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Kumar"/></div><div className="field"><label htmlFor="member-phone">Mobile number <i>*</i></label><div className="phone-input"><span>+91</span><input id="member-phone" required inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210"/></div></div><div className="field"><label htmlFor="member-joined">Joining date <i>*</i></label><input id="member-joined" type="date" value={joined} onChange={(e) => setJoined(e.target.value)}/></div><div className="field"><label htmlFor="member-emergency">Emergency contact <small>Optional</small></label><input id="member-emergency" value={emergency} onChange={(e) => setEmergency(e.target.value)} placeholder="Name and mobile number"/></div><div className="field"><label htmlFor="member-dob">Date of birth <small>Optional</small></label><input id="member-dob" type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)}/></div></div></div></section>
      <section className="panel form-section"><div className="section-number">2</div><div className="section-body"><h2>Membership</h2>
        {editing ? <><p>{editing.plan} plan, valid until {formatDate(editing.expiryDate)}. Use Renew on the profile to change the plan.</p><div className="plan-options"><label className={`plan-option ${suspended ? "selected" : ""}`}><input type="checkbox" checked={suspended} onChange={(e) => setSuspended(e.target.checked)}/><span><strong>Suspend membership</strong><small>Blocks check-in until re-activated</small></span></label></div></>
        : <><p>Choose a plan. The membership starts on the joining date.</p><div className="plan-options">{data.plans.map((p) => <label className={`plan-option ${planId === p.id ? "selected" : ""}`} key={p.id}><input type="radio" name="plan" checked={planId === p.id} onChange={() => setPlanId(p.id)}/><span><strong>{p.name}</strong><small>{durationLabel(p.days)}</small></span><b>{formatMoney(p.price)}</b></label>)}<label className={`plan-option ${planId === "custom" ? "selected" : ""}`}><input type="radio" name="plan" checked={planId === "custom"} onChange={() => setPlanId("custom")}/><span><strong>Custom</strong><small>Choose duration</small></span><b>Set price</b></label></div>
          {planId === "custom" && <div className="form-row"><div className="field"><label htmlFor="custom-days">Duration (days) <i>*</i></label><input id="custom-days" type="number" min={1} value={customDays} onChange={(e) => setCustomDays(e.target.value)}/></div><div className="field"><label htmlFor="custom-price">Price <i>*</i></label><div className="money-input"><span>₹</span><input id="custom-price" inputMode="numeric" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="1500"/></div></div></div>}
          <small className="field-help">The plan price is added to the member’s balance. Record the payment from their profile.</small></>}
      </div></section>
      <section className="panel form-section"><div className="section-number">3</div><div className="section-body"><h2>Notes</h2><p>Add anything the team should know.</p><div className="field"><textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fitness goals, preferences, or other useful notes..."/><small className="field-help">Only visible to gym staff.</small></div></div></section>
      {error && <p className="form-error">{error}</p>}
      <div className="form-footer"><span><Icon name="shield" size={18}/> Information is saved securely and synced for all staff.</span><div><Button variant="ghost" onClick={back}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save member"}</Button></div></div></form>
  </div>;
}
