import { useCallback, useEffect, useState } from "react";
import { AuthLayout } from "../auth/AuthLayout";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui";
import { genders } from "../data/types";
import { isValidIndianMobile, todayISO } from "../lib/format";
import { cleanPhone, isValidEmail, loadRegistrationForm, type RegistrationGym, submitRegistration } from "../lib/registration";

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
      <p>Your membership starts once you choose a plan and pay at the gym.{state.gym.phone ? ` Questions? Call the gym on ${state.gym.phone}.` : ""}</p>
    </div>
  </AuthLayout>;
  return <RegisterForm token={token} gym={state.gym} onDone={(code, name) => setState({ status: "done", gym: state.gym, code, name })}/>;
}

function RegisterForm({ token, gym, onDone }: { token: string; gym: RegistrationGym; onDone: (code: string, name: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [emergency, setEmergency] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const today = todayISO();
  const change = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { set(e.target.value); setError(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, " ");
    const digits = cleanPhone(phone);
    const emergencyDigits = cleanPhone(emergency);
    const mail = email.trim().toLowerCase();
    if (trimmed.length < 2 || trimmed.length > 80) return setError("Enter your full name.");
    if (!isValidIndianMobile(digits)) return setError("Enter a valid 10-digit mobile number.");
    if (mail && !isValidEmail(mail)) return setError("Enter a valid email address, or leave it empty.");
    if (dob && (dob > today || dob < "1900-01-01")) return setError("Check your date of birth.");
    if (address.trim().length > 200) return setError("Address is too long. Keep it under 200 characters.");
    if (emergencyDigits && !isValidIndianMobile(emergencyDigits)) return setError("Enter a valid 10-digit emergency contact number, or leave it empty.");
    setError("");
    setSaving(true);
    try {
      const code = await submitRegistration(token, { name: trimmed, phone: digits, email: mail, dob, gender, address: address.trim(), emergency: emergencyDigits });
      onDone(code, trimmed);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return <AuthLayout footer={FOOTER}>
    <div className="register-gym"><span className="large-icon"><Icon name="building"/></span><span><strong>{gym.name}</strong>{gym.address && <small>{gym.address}</small>}</span></div>
    <h1>Register as a gym member</h1>
    <p>Fill in your details. It takes about a minute.</p>
    <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="reg-name">Full name <i>*</i></label><input id="reg-name" autoComplete="name" value={name} onChange={change(setName)} placeholder="e.g. Rahul Kumar"/></div>
      <div className="field"><label htmlFor="reg-phone">Mobile number <i>*</i></label><div className="phone-input"><span>+91</span><input id="reg-phone" type="tel" autoComplete="tel-national" inputMode="numeric" value={phone} onChange={change(setPhone)} placeholder="98765 43210"/></div></div>
      <div className="field"><label htmlFor="reg-email">Email <small>Optional</small></label><input id="reg-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={change(setEmail)} placeholder="name@example.com"/></div>
      <div className="form-row register-row">
        <div className="field"><label htmlFor="reg-dob">Date of birth <small>Optional</small></label><input id="reg-dob" type="date" max={today} value={dob} onChange={change(setDob)}/></div>
        <div className="field"><label htmlFor="reg-gender">Gender <small>Optional</small></label><select id="reg-gender" value={gender} onChange={change(setGender)}><option value="">Prefer not to say</option>{genders.map((g) => <option key={g}>{g}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="reg-address">Address <small>Optional</small></label><input id="reg-address" autoComplete="street-address" maxLength={200} value={address} onChange={change(setAddress)} placeholder="House, street, area"/></div>
      <div className="field"><label htmlFor="reg-emergency">Emergency contact number <small>Optional</small></label><div className="phone-input"><span>+91</span><input id="reg-emergency" type="tel" inputMode="numeric" value={emergency} onChange={change(setEmergency)} placeholder="Family member’s mobile"/></div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? "Submitting…" : "Submit registration"}</Button>
    </form>
    <div className="secure-note"><Icon name="shield" size={15}/><span>Your details are shared only with {gym.name}.</span></div>
  </AuthLayout>;
}
