import { FunctionsHttpError } from "@supabase/supabase-js";
import { formatPhone } from "./format";
import { supabase } from "./supabase";

/** Result of creating a login or resetting a password. */
export type NewLogin = { userId: string; phone: string; temporaryPassword: string; gymId?: string };

/** Calls the "accounts" Edge Function and turns its errors into readable messages. */
export async function callAccounts<T = NewLogin>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("accounts", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? "Something went wrong. Try again.");
    }
    throw new Error("No internet connection. Check your network and try again.");
  }
  return data as T;
}

/** The address people open to log in (this website). */
export const appLink = () => window.location.origin;

/** WhatsApp message with login details for a new account or a password reset. */
export function loginMessage({ name, gymName, phone, temporaryPassword, reset = false }: { name: string; gymName: string; phone: string; temporaryPassword: string; reset?: boolean }) {
  const first = name.trim().split(/\s+/)[0] || "";
  return [
    `Namaste ${first} 🙏`,
    reset ? `${gymName} app ka aapka password reset kar diya gaya hai.` : `${gymName} ka gym management app aapke liye tayyar hai.`,
    "",
    `Website: ${appLink()}`,
    `Login mobile: ${formatPhone(phone)}`,
    `Temporary password: ${temporaryPassword}`,
    "",
    "Pehli baar login karne par apna naya password banayein.",
    "– Messy2Easy Solutions",
  ].join("\n");
}

export const whatsappLink = (phone: string, message: string) => `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
