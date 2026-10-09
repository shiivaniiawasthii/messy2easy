import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copy them into .env.local.");

// "Keep me signed in": remembered logins live in localStorage, others only
// until the browser tab is closed (sessionStorage).
const REMEMBER_KEY = "m2e-remember-login";

export function setRememberLogin(remember: boolean) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    // Storage blocked: the session simply won't persist.
  }
}

function sessionStore(): Storage | null {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === "0" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

const storage = {
  getItem: (k: string) => sessionStore()?.getItem(k) ?? null,
  setItem: (k: string, v: string) => sessionStore()?.setItem(k, v),
  removeItem: (k: string) => {
    try {
      window.localStorage.removeItem(k);
      window.sessionStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

export const supabase = createClient(url, key, {
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
