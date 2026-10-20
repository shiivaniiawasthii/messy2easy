import { useState } from "react";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui";
import { friendlyAuthError } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { AuthLayout } from "./AuthLayout";

/** Shown on first login (temporary password) until the user sets their own. */
export function ChangePassword({ name, onDone, onSignOut }: { name: string; onDone: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Trimmed like on the login screen, so a space at the start or end can't lock anyone out.
    const pass = password.trim();
    if (pass.length < 8) return setError("Use at least 8 characters (spaces at the start or end don't count).");
    if (pass !== confirm.trim()) return setError("The two passwords don't match.");
    setError("");
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: pass });
    if (updateError) {
      setError(friendlyAuthError(updateError));
      setLoading(false);
      return;
    }
    const { error: flagError } = await supabase.rpc("mark_password_changed");
    if (flagError) {
      setError(friendlyAuthError(flagError));
      setLoading(false);
      return;
    }
    onDone();
  };

  return <AuthLayout>
    <div className="login-icon"><Icon name="shield" size={25}/></div>
    <h1>Create your password</h1>
    <p>Welcome{name ? `, ${name.split(" ")[0]}` : ""}! You signed in with a temporary password. Choose your own to continue.</p>
    <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="new-password">New password</label><div className="password-input"><input id="new-password" autoComplete="new-password" type={show ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}/><button type="button" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div><small className="field-help">At least 8 characters. Don’t share it with anyone.</small></div>
      <div className="field"><label htmlFor="confirm-password">Type it again</label><input id="confirm-password" autoComplete="new-password" type={show ? "text" : "password"} value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(""); }}/></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save password"}</Button>
    </form>
    <div className="secure-note"><button type="button" className="text-btn" onClick={onSignOut}>Sign out</button></div>
  </AuthLayout>;
}
