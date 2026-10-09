import { useState } from "react";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui";
import { friendlyAuthError, loginEmail, normalizePhone } from "../lib/auth";
import { isValidIndianMobile } from "../lib/format";
import { setRememberLogin, supabase } from "../lib/supabase";
import { AuthLayout } from "./AuthLayout";

export function Login() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  // Show +91 only while a phone number is being typed (an email has letters or @).
  const looksLikePhone = !/[a-z@]/i.test(phone);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Gym owners and staff use their mobile number; the Messy2Easy admin can also use an email address.
    const typed = phone.trim();
    const isEmail = typed.includes("@");
    const digits = normalizePhone(typed);
    if (!isEmail && !isValidIndianMobile(digits)) return setError("Enter your 10-digit mobile number (or your email).");
    if (!password) return setError("Enter your password.");
    setError("");
    setLoading(true);
    setRememberLogin(remember);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: isEmail ? typed.toLowerCase() : loginEmail(digits), password });
    // On success AuthGate takes over; only errors are handled here.
    if (signInError) {
      setError(friendlyAuthError(signInError));
      setLoading(false);
    }
  };

  return <AuthLayout>
    <div className="login-icon"><Icon name="shield" size={25}/></div>
    <h1>Welcome back</h1>
    <p>Sign in to manage your gym.</p>
    <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="login-phone">Mobile number or email</label><div className="phone-input">{looksLikePhone && <span>+91</span>}<input id="login-phone" autoComplete="username" inputMode="text" value={phone} onChange={(e) => { setPhone(e.target.value); setError(""); }} placeholder="98765 43210"/></div></div>
      <div className="field"><label htmlFor="login-password">Password</label><div className="password-input"><input id="login-password" autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}/><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div></div>
      <div className="login-options"><label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}/> Keep me signed in</label><button type="button" onClick={() => setShowHelp(!showHelp)}>Forgot password?</button></div>
      {showHelp && <p className="form-note">Staff: ask your gym owner to reset your password. Gym owners: contact Messy2Easy support.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" disabled={loading}>{loading ? "Signing in..." : "Secure sign in"}</Button>
    </form>
    <div className="secure-note"><Icon name="shield" size={15}/><span>Your account is protected and changes sync across staff devices.</span></div>
  </AuthLayout>;
}
