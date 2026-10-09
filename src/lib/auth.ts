import { digitsOnly } from "./format";

// People log in with their mobile number. Supabase Auth needs an email, so each
// number maps to a private address that never receives mail.
// Keep in sync with supabase/functions/_shared/login.ts.
export const LOGIN_EMAIL_DOMAIN = "login.messy2easy.in";

export const loginEmail = (phone: string) => `${phone}@${LOGIN_EMAIL_DOMAIN}`;

/** "+91 98765 43210" / "098765 43210" → "9876543210" */
export const normalizePhone = (value: string) => digitsOnly(value).replace(/^(91|0)(?=\d{10}$)/, "");

export type Role = "owner" | "staff";

/** Who is logged in. role is null when the login isn't linked to a gym. */
export type Account = {
  userId: string;
  email: string;
  name: string;
  phone: string;
  role: Role | null;
  gymId: string | null;
  mustChangePassword: boolean;
  isPlatformAdmin: boolean;
};

/** Turns Supabase Auth errors into short messages a gym owner understands. */
export function friendlyAuthError(error: { message?: string; code?: string; status?: number } | null | undefined) {
  const msg = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "Mobile number or password is wrong.";
  if (code === "same_password" || msg.includes("should be different")) return "Choose a password different from the temporary one.";
  if (code === "weak_password" || msg.includes("password should be")) return "Use at least 8 characters for your password.";
  if (code === "over_request_rate_limit" || error?.status === 429 || msg.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (code === "user_banned") return "This login has been turned off. Contact your gym owner.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "No internet connection. Check your network and try again.";
  return "Something went wrong. Please try again.";
}
