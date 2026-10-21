import { useCallback, useEffect, useRef, useState } from "react";
import { AuthLayout } from "../auth/AuthLayout";
import { Icon } from "../components/Icon";
import { SectionQuestions } from "../components/IntakeFields";
import { Button } from "../components/ui";
import { type Intake } from "../data/types";
import { addDays, formatMoney, todayISO } from "../lib/format";
import { AADHAAR_ACCEPT, AADHAAR_MAX_BYTES, AADHAAR_TYPES, checkPersonal, checkQuestions, checkRegistration, checkSubscription, GENDERS, INTAKE_SECTIONS, JOIN_PAYMENTS, MAX_START_DAYS, STANDARD_PLANS } from "../lib/intake";
import { durationLabel } from "../lib/members";
import { loadRegistrationForm, type RegistrationGym, shrinkPhoto, submitRegistration } from "../lib/registration";

type PageState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "error"; message: string }
  | { status: "form"; gym: RegistrationGym }
  | { status: "done"; gym: RegistrationGym; code: string; name: string };

const FOOTER = "Powered by Messy2Easy Solutions";

/** Public form behind a gym's registration link (/?join=<token>). No login. */
export function Register({ token }: { token: string }) {
  const [state, setState] = useState<PageState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const gym = await loadRegistrationForm(token);
      setState(gym ? { status: "form", gym } : { status: "invalid" });
      if (gym) document.title = `Join ${gym.name}`;
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (state.status === "loading") return <AuthLayout footer={FOOTER}><div className="login-icon"><Icon name="users" size={25}/></div><h1>Loading…</h1><p>Opening the registration form.</p></AuthLayout>;
  if (state.status === "invalid") return <AuthLayout footer={FOOTER}><div className="login-icon paused"><Icon name="close" size={25}/></div><h1>Link not working</h1><p>This registration link is wrong or has been turned off. Ask the gym to send you the latest link.</p></AuthLayout>;
  if (state.status === "error") return <AuthLayout footer={FOOTER}><div className="login-icon paused"><Icon name="close" size={25}/></div><h1>Can’t open the form</h1><p>{state.message}</p><div className="auth-actions"><Button onClick={() => void load()}>Try again</Button></div></AuthLayout>;
  if (state.status === "done") return <AuthLayout footer={FOOTER}>
    <div className="register-done">
      <span className="success-icon"><Icon name="check" size={28}/></span>
      <h1>You’re registered!</h1>
      <p>Thank you, {state.name.split(" ")[0]}. {state.gym.name} has received your details.</p>
      <div className="share-details"><span>Your member ID<b className="mono">{state.code}</b></span></div>
      <p>Your membership starts once the gym confirms your plan and payment.{state.gym.phone ? ` Questions? Call the gym on ${state.gym.phone}.` : ""}</p>
    </div>
  </AuthLayout>;
  return <RegisterForm token={token} gym={state.gym} onDone={(code, name) => setState({ status: "done", gym: state.gym, code, name })}/>;
}

type Checked = { ok: true } | { ok: false; error: string };

/** The form in steps (like the gym's old Google Form): each step is checked before Next. */
function RegisterForm({ token, gym, onDone }: { token: string; gym: RegistrationGym; onDone: (code: string, name: string) => void }) {
  const today = todayISO();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [emergency, setEmergency] = useState("");
  const [weight, setWeight] = useState("");
  const [intake, setIntake] = useState<Intake>({ startDate: today });
  const [aadhaar, setAadhaar] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const patch = (p: Intake) => { setIntake((v) => ({ ...v, ...p })); setError(""); };
  const text = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { set(e.target.value); setError(""); };
  const personal = { name, phone, email, dob, gender, address, emergency };
  const allIntake = { ...intake, weight: weight.trim() === "" ? undefined : Number(weight) };

  const req = <i>*</i>;
  const opt = <small>Optional</small>;
  const steps: { title: string; check: () => Checked; body: React.ReactNode }[] = [
    { title: "Personal details", check: () => checkPersonal(personal, today), body: <>
      <div className="field"><label htmlFor="reg-name">Name {req}</label><input id="reg-name" autoComplete="name" value={name} onChange={text(setName)} placeholder="e.g. Rahul Kumar"/></div>
      <div className="field"><label htmlFor="reg-dob">Date of birth {req}</label><input id="reg-dob" type="date" max={today} value={dob} onChange={text(setDob)}/></div>
      <fieldset className="choice-field"><legend>Gender {req}</legend><div className="choice-list inline">{GENDERS.map((g) => <label key={g} className={gender === g ? "selected" : ""}><input type="radio" name="reg-gender" checked={gender === g} onChange={() => { setGender(g); setError(""); }}/><span>{g}</span></label>)}</div></fieldset>
      <div className="field"><label htmlFor="reg-phone">Contact number {req}</label><div className="phone-input"><span>+91</span><input id="reg-phone" type="tel" autoComplete="tel-national" inputMode="numeric" value={phone} onChange={text(setPhone)} placeholder="98765 43210"/></div></div>
      <div className="field"><label htmlFor="reg-address">Residential address {opt}</label><input id="reg-address" autoComplete="street-address" maxLength={200} value={address} onChange={text(setAddress)} placeholder="House, street, area"/></div>
      <div className="field"><label htmlFor="reg-email">Email {opt}</label><input id="reg-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={text(setEmail)} placeholder="name@example.com"/></div>
      <div className="field"><label htmlFor="reg-emergency">Emergency contact number {opt}</label><div className="phone-input"><span>+91</span><input id="reg-emergency" type="tel" inputMode="numeric" value={emergency} onChange={text(setEmergency)} placeholder="Family member’s mobile"/></div></div>
    </> },
    { title: "Subscription details", check: () => checkSubscription(allIntake, today), body: <>
      <fieldset className="choice-field"><legend>Select your subscription plan {req}</legend>
        {gym.plans.length > 0
          ? <div className="choice-list">{gym.plans.map((p) => <label key={p.id} className={intake.planId === p.id ? "selected" : ""}><input type="radio" name="reg-plan" checked={intake.planId === p.id} onChange={() => patch({ planId: p.id, planMonths: undefined })}/><span>{p.name}</span><small>{durationLabel(p.days)} · {formatMoney(p.price)}</small></label>)}</div>
          // The gym hasn't set up plans yet: the standard durations, price confirmed at the gym.
          : <><div className="choice-list">{STANDARD_PLANS.map(([months, label]) => <label key={months} className={intake.planMonths === months ? "selected" : ""}><input type="radio" name="reg-plan" checked={intake.planMonths === months} onChange={() => patch({ planMonths: months, planId: undefined })}/><span>{label}</span></label>)}</div><small className="field-help">The gym will confirm the price when you join.</small></>}
      </fieldset>
      <div className="field"><label htmlFor="reg-start">Preferred start date for membership {req}</label><input id="reg-start" type="date" min={today} max={addDays(today, MAX_START_DAYS)} value={intake.startDate ?? ""} onChange={(e) => patch({ startDate: e.target.value })}/></div>
      <fieldset className="choice-field"><legend>Preferred payment method {req}</legend><div className="choice-list">{JOIN_PAYMENTS.map(([v, label]) => <label key={v} className={intake.payment === v ? "selected" : ""}><input type="radio" name="reg-payment" checked={intake.payment === v} onChange={() => patch({ payment: v })}/><span>{label}</span></label>)}</div></fieldset>
      <div className="field"><label htmlFor="reg-weight">What is your current weight? {req}</label><div className="money-input unit-input"><input id="reg-weight" inputMode="decimal" value={weight} onChange={text(setWeight)} placeholder="e.g. 70"/><span>kg</span></div></div>
    </> },
    ...INTAKE_SECTIONS.map((section) => ({
      title: section.title,
      check: () => checkQuestions(section.questions, intake, true),
      body: <SectionQuestions section={section} value={intake} onChange={patch} required idPrefix="reg"/>,
    })),
    { title: "Identification", check: () => (aadhaar ? { ok: true as const } : { ok: false as const, error: "Upload a copy of your Aadhaar card." }), body: <>
      <div className="field"><label htmlFor="reg-aadhaar">Upload a copy of your Aadhaar card {req}</label>
        <label className={`file-pick ${aadhaar ? "picked" : ""}`} htmlFor="reg-aadhaar"><Icon name={aadhaar ? "check" : "download"} size={18}/><span>{aadhaar ? aadhaar.name : "Choose photo or PDF"}</span></label>
        <input id="reg-aadhaar" className="visually-hidden" type="file" accept={AADHAAR_ACCEPT} onChange={(e) => pickFile(e.target.files?.[0] ?? null)}/>
        <small className="field-help">Photo or PDF, up to 10 MB. Only the gym owner can see it.</small>
      </div>
      <div className="field"><label htmlFor="reg-comments">Any specific requests or comments? {opt}</label><textarea id="reg-comments" rows={3} maxLength={500} value={intake.comments ?? ""} onChange={(e) => patch({ comments: e.target.value })}/></div>
    </> },
  ];
  const last = step === steps.length - 1;
  const current = steps[step];

  const showError = (message: string) => {
    setError(message);
    window.setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };
  const goTo = (next: number) => {
    setError("");
    setStep(next);
    window.setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  function pickFile(file: File | null) {
    setError("");
    if (!file) return setAadhaar(null);
    if (!AADHAAR_TYPES[file.type]) { setAadhaar(null); return showError("Upload the Aadhaar as a photo (JPG, PNG) or a PDF."); }
    setAadhaar(file);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const checked = current.check();
    if (!checked.ok) return showError(checked.error);
    if (!last) return goTo(step + 1);
    // Final check of everything (the server checks the same again).
    const all = checkRegistration({ ...personal, intake: allIntake }, today);
    if (!all.ok) return showError(all.error);
    if (!aadhaar) return showError("Upload a copy of your Aadhaar card.");
    setSaving(true);
    setError("");
    try {
      const file = await shrinkPhoto(aadhaar);
      if (file.size > AADHAAR_MAX_BYTES) throw new Error("The Aadhaar file is bigger than 10 MB. Upload a smaller photo or PDF.");
      const code = await submitRegistration(token, all.value, file);
      onDone(code, all.value.name);
    } catch (err) {
      showError((err as Error).message);
      setSaving(false);
    }
  };

  return <AuthLayout footer={FOOTER}>
    <div ref={topRef} className="register-gym"><span className="large-icon"><Icon name="building"/></span><span><strong>{gym.name}</strong>{gym.address && <small>{gym.address}</small>}</span></div>
    {step === 0 && <><h1>Register as a gym member</h1><p>It takes about 3 minutes. Questions marked {req} are required.</p></>}
    <div className="register-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
      <div><span>Step {step + 1} of {steps.length}</span><strong>{current.title}</strong></div>
      <div className="register-progress-bar"><i style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></div>
    </div>
    <form onSubmit={submit} noValidate className="register-form">
      <div className="register-step" key={step}>{current.body}</div>
      {error && <p className="form-error" role="alert" ref={errorRef}>{error}</p>}
      <div className="register-nav">
        {step > 0 && <Button variant="secondary" onClick={() => goTo(step - 1)} disabled={saving}>Back</Button>}
        <Button type="submit" disabled={saving}>{last ? (saving ? "Submitting…" : "Submit") : "Next"}</Button>
      </div>
    </form>
    <div className="secure-note"><Icon name="shield" size={15}/><span>Your details and Aadhaar are shared only with {gym.name}.</span></div>
  </AuthLayout>;
}
