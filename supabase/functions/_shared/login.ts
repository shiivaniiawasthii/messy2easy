// People log in with their mobile number. Supabase Auth needs an email, so each
// number maps to a private address that never receives mail. The web app uses
// the same rule (src/lib/auth.ts) — keep them in sync.
export const LOGIN_EMAIL_DOMAIN = "login.messy2easy.in";

export const loginEmail = (phone: string) => `${phone}@${LOGIN_EMAIL_DOMAIN}`;
