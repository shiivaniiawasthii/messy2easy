import { formatDate } from "../lib/format";
import { ConfirmProvider } from "../components/Confirm";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Session } from "@supabase/supabase-js";
import App from "../App";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui";
import { AdminHome } from "../admin/AdminHome";
import { type Account, type Role } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { AuthLayout } from "./AuthLayout";
import { ChangePassword } from "./ChangePassword";
import { Login } from "./Login";

type GateState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; account: Account };

/** Reads who is logged in: their staff row (gym + role) and whether they are a platform admin. */
async function fetchAccount(session: Session): Promise<Account> {
  const userId = session.user.id;
  const [staff, admin] = await Promise.all([
    supabase.from("staff").select("name, phone, role, gym_id, must_change_password").eq("user_id", userId).maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (staff.error) throw staff.error;
  if (admin.error) throw admin.error;
  // No staff row visible usually means the gym's subscription is paused.
  let pausedGym: Account["pausedGym"] = null;
  if (!staff.data && !admin.data) {
    const status = await supabase.rpc("my_gym_status").maybeSingle<{ gym_name: string; active: boolean; subscription_ends_on: string | null; is_open: boolean }>();
    if (status.data && !status.data.is_open) pausedGym = { gymName: status.data.gym_name, active: status.data.active, endsOn: status.data.subscription_ends_on };
  }
  return {
    userId,
    email: session.user.email ?? "",
    name: staff.data?.name ?? "",
    phone: staff.data?.phone ?? session.user.email?.split("@")[0] ?? "",
    role: (staff.data?.role as Role | undefined) ?? null,
    gymId: staff.data?.gym_id ?? null,
    mustChangePassword: staff.data?.must_change_password ?? false,
    isPlatformAdmin: !!admin.data,
    pausedGym,
  };
}

/** Decides what to show: login, set-password, a "not set up" message, or the app. */
export function AuthGate() {
  return <ConfirmProvider><Gate/></ConfirmProvider>;
}

function Gate() {
  const [state, setState] = useState<GateState>({ status: "loading" });
  const lastSession = useRef<Session | null>(null);

  const load = useCallback(async (session: Session | null) => {
    lastSession.current = session;
    if (!session) return setState({ status: "signed-out" });
    try {
      const account = await fetchAccount(session);
      // Keep the app mounted when nothing changed (e.g. a background token refresh).
      setState((prev) => (prev.status === "ready" && JSON.stringify(prev.account) === JSON.stringify(account) ? prev : { status: "ready", account }));
    } catch {
      setState({ status: "error", message: "Couldn't reach the server. Check your internet connection." });
    }
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      // Supabase advises not to await other Supabase calls inside this callback.
      window.setTimeout(() => void load(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const signOut = useCallback(() => { void supabase.auth.signOut(); }, []);

  if (state.status === "loading") return <AuthLayout><div className="login-icon"><Icon name="shield" size={25}/></div><h1>Loading…</h1><p>Checking your login.</p></AuthLayout>;
  if (state.status === "signed-out") return <Login/>;
  if (state.status === "error") return <AuthLayout><div className="login-icon"><Icon name="shield" size={25}/></div><h1>Can’t connect</h1><p>{state.message}</p><div className="auth-actions"><Button onClick={() => void load(lastSession.current)}>Try again</Button><Button variant="ghost" onClick={signOut}>Sign out</Button></div></AuthLayout>;

  const { account } = state;
  if (account.role && account.mustChangePassword) return <ChangePassword name={account.name} onDone={() => void load(lastSession.current)} onSignOut={signOut}/>;
  if (!account.role && account.isPlatformAdmin) return <AdminHome email={account.email} onSignOut={signOut}/>;
  if (!account.role && account.pausedGym) return <AuthLayout><div className="login-icon paused"><Icon name="clock" size={25}/></div><h1>Subscription paused</h1><p>{account.pausedGym.gymName}’s Gym Manager {account.pausedGym.active && account.pausedGym.endsOn ? `subscription ended on ${formatDate(account.pausedGym.endsOn)}` : "subscription is paused"}. Your data is safe. Please contact Messy2Easy Solutions to continue.</p><div className="auth-actions"><Button variant="secondary" onClick={signOut}>Sign out</Button></div></AuthLayout>;
  if (!account.role) return <AuthLayout><div className="login-icon"><Icon name="users" size={25}/></div><h1>Not linked to a gym</h1><p>Your login works, but it isn’t part of any gym yet (or it was turned off). Ask your gym owner to add you, or contact Messy2Easy support.</p><div className="auth-actions"><Button variant="secondary" onClick={signOut}>Sign out</Button></div></AuthLayout>;
  return <App account={account} onSignOut={signOut}/>;
}
