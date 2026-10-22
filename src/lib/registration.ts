// Self-service registration: the public form a gym shares with new members.
// The page needs no login. It reads the gym with the `registration_form` database function and
// submits through the `register` Edge Function, which also stores the Aadhaar copy.
// Questions and validation: intake.ts (shared with the server).

import { FunctionsHttpError } from "@supabase/supabase-js";
import { type Plan } from "../data/types";
import { REGISTRATION_ERRORS, type RegistrationInput } from "./intake";
import { supabase } from "./supabase";

/** Query parameter of the public form: https://<app>/?join=<token> (works on any host, no rewrites). */
export const JOIN_PARAM = "join";

export const registrationLink = (token: string) => `${window.location.origin}/?${JOIN_PARAM}=${token}`;

/** WhatsApp text the owner forwards to people who want to join. */
export function registrationMessage(gymName: string, link: string) {
  return [
    `To join ${gymName}, please fill in this form 🙏`,
    "",
    link,
    "",
    "You will also need to upload a photo of your Aadhaar card. After submitting, visit the gym to confirm your plan and payment.",
  ].join("\n");
}

/** Shared with any app (no phone number), e.g. a WhatsApp group. */
export const whatsappShareLink = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;

export type RegistrationGym = { name: string; address: string; phone: string; plans: Plan[]; logoPath: string };

/** The gym behind a link, or null when the link is wrong, turned off or the gym is paused. */
export async function loadRegistrationForm(token: string): Promise<RegistrationGym | null> {
  const { data, error } = await supabase.rpc("registration_form", { p_token: token }).maybeSingle<{ gym_name: string; gym_address: string; gym_phone: string; plans: Plan[]; logo_path: string | null }>();
  if (error) throw new Error(friendly(error.message));
  return data ? { name: data.gym_name, address: data.gym_address, phone: data.gym_phone, plans: data.plans ?? [], logoPath: data.logo_path ?? "" } : null;
}

/** Saves the registration with the Aadhaar copy and returns the new member code (e.g. "M-0042"). */
export async function submitRegistration(token: string, input: RegistrationInput, aadhaar: File): Promise<string> {
  const body = new FormData();
  body.append("token", token);
  body.append("data", JSON.stringify(input));
  body.append("aadhaar", aadhaar, aadhaar.name);
  const { data, error } = await supabase.functions.invoke("register", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? "Couldn't submit the form. Please try again.");
    }
    throw new Error("No internet connection. Check your network and try again.");
  }
  return (data as { code: string }).code;
}

/**
 * Phone photos are often 3–8 MB. Big JPEG/PNG/WEBP photos are resized (longest side 2000 px) so they
 * upload quickly on mobile data and stay readable. PDFs and HEIC (browsers can't draw it) are sent as they are.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function friendly(message: string) {
  if (REGISTRATION_ERRORS[message]) return REGISTRATION_ERRORS[message];
  if (message.includes("Failed to fetch") || message.toLowerCase().includes("network")) return "No internet connection. Check your network and try again.";
  return "Couldn't open the form. Please try again.";
}
