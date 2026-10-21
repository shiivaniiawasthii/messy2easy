// The joining form: questions, options and validation, in one place.
// Same questions as the gym's earlier Google Form. Used by the public registration page, the
// owner's member form, the member profile and the `register` Edge Function (Deno), so the
// browser and the server always check the same rules.
// Explicit .ts extensions and no browser-only APIs: this file also runs in Deno.

import { type Intake, type IntakeChoiceKey, type IntakeYesNoKey } from "../data/types.ts";
import { addDays, digitsOnly, isValidIndianMobile } from "./format.ts";

export type ChoiceQuestion = { kind: "choice"; key: IntakeChoiceKey; label: string; short: string; options: string[]; other: boolean };
export type YesNoQuestion = { kind: "yesno"; key: IntakeYesNoKey; label: string; short: string };
export type IntakeSection = { title: string; questions: (ChoiceQuestion | YesNoQuestion)[] };

const choice = (key: IntakeChoiceKey, label: string, short: string, options: string[], other = true): ChoiceQuestion => ({ kind: "choice", key, label, short, options, other });
const yesNo = (key: IntakeYesNoKey, label: string, short: string): YesNoQuestion => ({ kind: "yesno", key, label, short });

/** The question sections after personal details and subscription. `short` is the label on the profile. */
export const INTAKE_SECTIONS: IntakeSection[] = [
  { title: "Fitness goals", questions: [
    choice("goal", "What are your primary fitness goals?", "Fitness goal", ["Weight Loss", "Muscle Gain", "General Fitness", "Increase Stamina", "Flexibility and Mobility"]),
    choice("experience", "How long have you been working out?", "Experience", ["Beginner (0–6 months)", "Intermediate (6 months–2 years)", "Advanced (2+ years)"], false),
    choice("focus", "Do you have any specific areas you want to focus on?", "Focus area", ["Upper Body", "Lower Body", "Core Strength", "Cardio Fitness"]),
  ] },
  { title: "Health and medical information", questions: [
    yesNo("medical", "Do you have any medical conditions or injuries?", "Medical conditions / injuries"),
    yesNo("medications", "Are you currently taking any medications?", "Taking medications"),
    yesNo("dietRestrictions", "Do you have any dietary restrictions or preferences?", "Dietary restrictions"),
  ] },
  { title: "Workout preferences", questions: [
    choice("workoutType", "Preferred type of workout", "Workout type", ["Weight Training", "Cardio Exercises", "Yoga", "CrossFit", "Group Classes"]),
    choice("workoutTime", "Preferred time for workouts", "Workout time", ["Morning (6 AM – 10 AM)", "Afternoon (10 AM – 2 PM)", "Evening (4 PM – 11 PM)"]),
    yesNo("personalTraining", "Would you like a personalized training program?", "Personal training"),
    yesNo("dietHelp", "Do you need assistance with diet planning?", "Diet planning help"),
  ] },
  { title: "Feedback", questions: [
    choice("heardFrom", "How did you hear about us?", "Heard about us from", ["Social Media", "Friends/Family", "Online Search"]),
    choice("importantFactor", "What is the most important factor for you in a gym?", "Most important in a gym", ["Trainer Expertise", "Equipment Quality", "Cleanliness and Hygiene"]),
  ] },
];

export const GENDERS = ["Male", "Female", "Other"];

/** Preferred payment method for joining (stored value → label). */
export const JOIN_PAYMENTS: [string, string][] = [["UPI", "Online (via UPI)"], ["Cash", "Offline (Cash)"]];

/**
 * Plan choices when the gym hasn't created plans yet (same as its old Google Form).
 * The price is confirmed at the gym; activation then uses the matching real plan.
 * Keep in sync with register_member (20261021120000_registration_standard_plans).
 */
export const STANDARD_PLANS: [number, string][] = [[1, "1 Month"], [3, "3 Months"], [6, "6 Months"], [12, "12 Months"]];

/** How far ahead a preferred start date may be. */
export const MAX_START_DAYS = 60;

export const OTHER_MAX = 60;

/** "+91 98765 43210" / "098765 43210" → "9876543210" (same rule as the database). */
export const cleanPhone = (value: string) => digitsOnly(value).replace(/^(91|0)(?=\d{10}$)/, "");

export const isValidEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 120;

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const asRecord = (raw: unknown) => (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

/** Checks the given questions (one step of the public form, or all of them). */
export function checkQuestions(questions: IntakeSection["questions"], raw: unknown, required: boolean): Checked<Intake> {
  const input = asRecord(raw);
  const out: Intake = {};
  for (const q of questions) {
    if (q.kind === "yesno") {
      const v = input[q.key];
      if (typeof v === "boolean") out[q.key] = v;
      else if (required) return { ok: false, error: `Answer: ${q.label}` };
      continue;
    }
    const v = text(input[q.key]);
    if (!v) { if (required) return { ok: false, error: `Answer: ${q.label}` }; continue; }
    if (!q.options.includes(v) && !(q.other && v.length <= OTHER_MAX)) return { ok: false, error: q.other ? `Keep your own answer short (up to ${OTHER_MAX} characters): ${q.label}` : `Choose an option: ${q.label}` };
    out[q.key] = v;
  }
  return { ok: true, value: out };
}

/** Weight in kg (20–300, one decimal). */
export function checkWeight(raw: unknown, required: boolean): Checked<number | undefined> {
  if (raw === undefined || raw === null || raw === "") return required ? { ok: false, error: "Enter your current weight in kg." } : { ok: true, value: undefined };
  const weight = typeof raw === "number" ? raw : Number(text(raw));
  if (!Number.isFinite(weight) || weight < 20 || weight > 300) return { ok: false, error: "Enter your current weight in kg (20 to 300)." };
  return { ok: true, value: Math.round(weight * 10) / 10 };
}

/**
 * Cleans and checks answers. `required` (public form): every question must be answered.
 * Otherwise (owner's member form) only the answers given are checked.
 */
export function checkIntake(raw: unknown, required: boolean): Checked<Intake> {
  const input = asRecord(raw);
  const answers = checkQuestions(INTAKE_SECTIONS.flatMap((s) => s.questions), input, required);
  if (!answers.ok) return answers;
  const out: Intake = { ...answers.value };
  const weight = checkWeight(input.weight, required);
  if (!weight.ok) return weight;
  if (weight.value !== undefined) out.weight = weight.value;
  const comments = typeof input.comments === "string" ? input.comments.trim() : "";
  if (comments.length > 500) return { ok: false, error: "Keep comments under 500 characters." };
  if (comments) out.comments = comments;
  return { ok: true, value: out };
}

export type PersonalDetails = { name: string; phone: string; email: string; dob: string; gender: string; address: string; emergency: string };

/** What the public form sends (the Aadhaar file travels separately). */
export type RegistrationInput = PersonalDetails & { intake: Intake };

/** Step 1 of the public form. `today` is the gym's date (IST, "YYYY-MM-DD"). */
export function checkPersonal(raw: unknown, today: string): Checked<PersonalDetails> {
  const input = asRecord(raw);
  const name = text(input.name);
  const phone = cleanPhone(text(input.phone));
  const email = text(input.email).toLowerCase();
  const dob = text(input.dob);
  const gender = text(input.gender);
  const address = text(input.address);
  const emergencyText = text(input.emergency);
  const emergency = emergencyText ? cleanPhone(emergencyText) : "";
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter your full name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob < "1900-01-01" || dob > addDays(today, -5 * 365)) return { ok: false, error: "Enter your date of birth." };
  if (!GENDERS.includes(gender)) return { ok: false, error: "Choose your gender." };
  if (!isValidIndianMobile(phone)) return { ok: false, error: "Enter a valid 10-digit contact number." };
  if (address.length > 200) return { ok: false, error: "Address is too long. Keep it under 200 characters." };
  if (email && !isValidEmail(email)) return { ok: false, error: "Enter a valid email address, or leave it empty." };
  if (emergency && !isValidIndianMobile(emergency)) return { ok: false, error: "Enter a valid 10-digit emergency contact number, or leave it empty." };
  return { ok: true, value: { name, phone, email, dob, gender, address, emergency } };
}

/** Step 2 of the public form: plan, preferred start date, payment method and weight. */
export function checkSubscription(raw: unknown, today: string): Checked<Pick<Intake, "planId" | "planMonths" | "startDate" | "payment" | "weight">> {
  const joining = asRecord(raw);
  const planId = text(joining.planId);
  const planMonths = Number(joining.planMonths);
  const standard = !planId && STANDARD_PLANS.some(([m]) => m === planMonths);
  const startDate = text(joining.startDate);
  const payment = text(joining.payment);
  if (!planId && !standard) return { ok: false, error: "Select your subscription plan." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < today || startDate > addDays(today, MAX_START_DAYS)) return { ok: false, error: `Choose a start date from today up to ${MAX_START_DAYS} days ahead.` };
  if (!JOIN_PAYMENTS.some(([v]) => v === payment)) return { ok: false, error: "Choose your preferred payment method." };
  const weight = checkWeight(joining.weight, true);
  if (!weight.ok) return weight;
  return { ok: true, value: standard ? { planMonths, startDate, payment, weight: weight.value } : { planId, startDate, payment, weight: weight.value } };
}

/** Full check of a registration (what the server runs). `today` is the gym's date (IST, "YYYY-MM-DD"). */
export function checkRegistration(raw: unknown, today: string): Checked<RegistrationInput> {
  const input = asRecord(raw);
  const personal = checkPersonal(input, today);
  if (!personal.ok) return personal;
  const subscription = checkSubscription(input.intake, today);
  if (!subscription.ok) return subscription;
  const answers = checkIntake(input.intake, true);
  if (!answers.ok) return answers;
  return { ok: true, value: { ...personal.value, intake: { ...answers.value, ...subscription.value } } };
}

// --- Aadhaar file ---

export const AADHAAR_MAX_BYTES = 10 * 1024 * 1024;
export const AADHAAR_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
export const AADHAAR_ACCEPT = "image/*,application/pdf";

/** Checks the first bytes, so a file can't just claim to be an image or PDF. */
export function looksLikeAllowedFile(type: string, head: Uint8Array) {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  const ascii = (from: number, s: string) => [...s].every((c, i) => head[from + i] === c.charCodeAt(0));
  if (type === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (type === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (type === "application/pdf") return ascii(0, "%PDF");
  if (type === "image/webp") return ascii(0, "RIFF") && ascii(8, "WEBP");
  if (type === "image/heic" || type === "image/heif") return ascii(4, "ftyp");
  return false;
}

// --- Messages for errors from the server (database function and Edge Function) ---

export const REGISTRATION_ERRORS: Record<string, string> = {
  link_invalid: "This registration link is not working any more. Ask the gym for a new link.",
  invalid_name: "Enter your full name.",
  invalid_phone: "Enter a valid 10-digit contact number.",
  invalid_email: "Enter a valid email address, or leave it empty.",
  invalid_dob: "Enter your date of birth.",
  invalid_gender: "Choose your gender.",
  invalid_address: "Address is too long. Keep it under 200 characters.",
  invalid_emergency: "Enter a valid 10-digit emergency contact number, or leave it empty.",
  invalid_answers: "Some answers are missing. Check the form and try again.",
  invalid_plan: "Select one of the gym's subscription plans.",
  invalid_start: `Choose a start date from today up to ${MAX_START_DAYS} days ahead.`,
  aadhaar_required: "Upload a copy of your Aadhaar card.",
  already_registered: "This mobile number is already registered with this gym. Please contact the gym.",
  too_many_registrations: "The gym is getting many registrations right now. Please try again in an hour.",
};
