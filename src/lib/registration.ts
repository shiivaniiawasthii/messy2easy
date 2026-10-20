// Self-service registration: the public form a gym shares with new members.
// The page needs no login. It calls two database functions (see the member_registration
// migration) that take the gym from the link's token and validate everything again.

import { digitsOnly } from "./format";
import { supabase } from "./supabase";

/** Query parameter of the public form: https://<app>/?join=<token> (works on any host, no rewrites). */
export const JOIN_PARAM = "join";

export const registrationLink = (token: string) => `${window.location.origin}/?${JOIN_PARAM}=${token}`;

/** WhatsApp text the owner forwards to people who want to join. */
export function registrationMessage(gymName: string, link: string) {
  return [
    `${gymName} me join karne ke liye ye form bharein 🙏`,
    "",
    link,
    "",
    "Form bharne ke baad gym aakar plan aur payment confirm karein.",
  ].join("\n");
}

/** Shared with any app (no phone number), e.g. a WhatsApp group. */
export const whatsappShareLink = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;

export const isValidEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 120;

/** "+91 98765 43210" / "098765 43210" → "9876543210" (same rule as the database). */
export const cleanPhone = (value: string) => digitsOnly(value).replace(/^(91|0)(?=\d{10}$)/, "");

export type RegistrationGym = { name: string; address: string; phone: string };

/** The gym behind a link, or null when the link is wrong, turned off or the gym is paused. */
export async function loadRegistrationForm(token: string): Promise<RegistrationGym | null> {
  const { data, error } = await supabase.rpc("registration_form", { p_token: token }).maybeSingle<{ gym_name: string; gym_address: string; gym_phone: string }>();
  if (error) throw new Error(registrationError(error.message));
  return data ? { name: data.gym_name, address: data.gym_address, phone: data.gym_phone } : null;
}

export type RegistrationInput = { name: string; phone: string; email: string; dob: string; gender: string; address: string; emergency: string };

/** Saves the registration and returns the new member code (e.g. "M-0042"). */
export async function submitRegistration(token: string, input: RegistrationInput): Promise<string> {
  const { data, error } = await supabase.rpc("register_member", {
    p_token: token,
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email,
    p_date_of_birth: input.dob || null,
    p_gender: input.gender,
    p_address: input.address,
    p_emergency_contact: input.emergency,
  });
  if (error) throw new Error(registrationError(error.message));
  return data as string;
}

const MESSAGES: Record<string, string> = {
  link_invalid: "This registration link is not working any more. Ask the gym for a new link.",
  invalid_name: "Enter your full name.",
  invalid_phone: "Enter a valid 10-digit mobile number.",
  invalid_email: "Enter a valid email address, or leave it empty.",
  invalid_dob: "Check your date of birth.",
  invalid_gender: "Choose a gender, or leave it empty.",
  invalid_address: "Address is too long. Keep it under 200 characters.",
  invalid_emergency: "Enter a valid 10-digit emergency contact number, or leave it empty.",
  already_registered: "This mobile number is already registered with this gym. Please contact the gym.",
  too_many_registrations: "The gym is getting many registrations right now. Please try again in an hour.",
};

function registrationError(message: string) {
  if (MESSAGES[message]) return MESSAGES[message];
  if (message.includes("Failed to fetch") || message.toLowerCase().includes("network")) return "No internet connection. Check your network and try again.";
  return "Couldn't submit the form. Please try again.";
}
