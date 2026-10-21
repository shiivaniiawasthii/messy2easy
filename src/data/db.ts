// Reads and writes the gym's data in Supabase. Row Level Security on the
// server limits everything to the logged-in user's gym and role.

import { addDays, formatTime, toLocalDateTime, todayISO } from "../lib/format";
import { supabase } from "../lib/supabase";
import { fetchAppRows, toAppData } from "./appData";
import { ATTENDANCE_DAYS_LOADED, avatarColors, type AppData, type Intake } from "./types";

const local = (timestamp: string) => toLocalDateTime(new Date(timestamp));

/** Loads everything the app shows for the logged-in user's gym. */
export async function loadAppData(): Promise<AppData> {
  const since = new Date(`${addDays(todayISO(), -ATTENDANCE_DAYS_LOADED)}T00:00:00`).toISOString();
  return toAppData(await fetchAppRows(supabase, since), local);
}

/** Turns database errors into short messages. */
function fail(error: { message?: string; code?: string; details?: string } | null, fallback = "Couldn't save. Check your internet connection and try again."): never {
  const msg = error?.message ?? "";
  // create_member names the member who already has this number (also one who registered moments ago).
  if (msg === "duplicate_phone") throw new Error(`This mobile number already belongs to ${error?.details || "another member"}.`);
  if (msg === "aadhaar_not_verified") throw new Error("The owner has to check this member’s Aadhaar first (profile → Aadhaar valid).");
  if (error?.code === "23505" && msg.includes("phone")) throw new Error("This mobile number already belongs to another member.");
  if (error?.code === "23505" && msg.includes("plans")) throw new Error("A plan with this name already exists.");
  if (error?.code === "42501" || msg.includes("row-level security")) throw new Error("You don't have permission to do this.");
  if (msg.includes("Failed to fetch")) throw new Error("No internet connection. Try again.");
  throw new Error(fallback);
}

/** A local "YYYY-MM-DD" date (optionally with time) as a database timestamp. */
const toTimestamp = (date: string, time = "12:00:00") => new Date(`${date}T${time}`).toISOString();

export const db = {
  async addMember(input: { name: string; phone: string; joined: string; emergency: string; dob: string; notes: string; email: string; gender: string; address: string; intake: Intake; planId: string | null; customDays?: number; customPrice?: number }) {
    const { data, error } = await supabase.rpc("create_member", {
      p_name: input.name,
      p_phone: input.phone,
      p_joined_on: input.joined,
      p_emergency_contact: input.emergency,
      p_date_of_birth: input.dob || null,
      p_notes: input.notes,
      p_plan_id: input.planId,
      p_custom_days: input.planId ? null : input.customDays,
      p_custom_price: input.planId ? null : input.customPrice,
      p_color: avatarColors[Math.floor(Math.random() * avatarColors.length)],
      p_email: input.email,
      p_gender: input.gender,
      p_address: input.address,
      p_intake: input.intake,
    });
    if (error) fail(error);
    return data as string;
  },

  async updateMember(id: string, input: { name: string; phone: string; joined: string; emergency: string; dob: string; notes: string; suspended: boolean; email: string; gender: string; address: string; intake: Intake }) {
    const { error } = await supabase.from("members").update({ name: input.name, phone: input.phone, joined_on: input.joined, emergency_contact: input.emergency, date_of_birth: input.dob || null, notes: input.notes, suspended: input.suspended, email: input.email, gender: input.gender, address: input.address, intake: input.intake }).eq("id", id);
    if (error) fail(error);
  },

  /**
   * Owner only: mark a registration's Aadhaar valid or wrong. "Valid" also starts the membership when
   * it is due. Result: "activated", "scheduled" (starts by itself on the chosen date), "needs_plan"
   * (pick a plan in Activate), "rejected", "already_started" or "not_verified".
   */
  async checkAadhaar(memberId: string, valid: boolean) {
    const { data, error } = await supabase.rpc("set_aadhaar_check", { p_member_id: memberId, p_valid: valid });
    if (error) fail(error);
    return data as string;
  },

  /** Starts a verified registration with the duration, start date and method the person chose, at this fee. */
  async startRegistration(input: { memberId: string; fee: number; paid: number; method: string }) {
    const { error } = await supabase.rpc("start_registration", { p_member_id: input.memberId, p_fee: input.fee, p_paid: input.paid, p_method: input.method });
    if (error?.message === "already_started") throw new Error("This membership has already been started.");
    if (error) fail(error, error.message && !error.message.includes("fetch") ? error.message : undefined);
  },

  /** Owner only: a link to the member's Aadhaar copy that works for one minute. */
  async aadhaarUrl(path: string) {
    const { data, error } = await supabase.storage.from("member-documents").createSignedUrl(path, 60);
    if (error || !data) throw new Error("Couldn't open the Aadhaar file. Only the gym owner can see it.");
    return data.signedUrl;
  },

  /** Owner: turns the public registration link on (always a new link; the old one stops working) or off. */
  async setRegistrationLink(on: boolean) {
    const { data, error } = await supabase.rpc("set_registration_link", { p_on: on });
    if (error) fail(error);
    return (data as string | null) ?? "";
  },

  async recordPayment(input: { memberId: string; amount: number; method: string; date: string; note: string }) {
    const paidAt = input.date === todayISO() ? new Date().toISOString() : toTimestamp(input.date);
    const { error } = await supabase.from("payments").insert({ member_id: input.memberId, amount: input.amount, method: input.method, paid_at: paidAt, note: input.note });
    if (error) fail(error);
  },

  async renew(input: { memberId: string; planId: string; startDate: string; paid: number; method: string }) {
    const { error } = await supabase.rpc("renew_membership", { p_member_id: input.memberId, p_plan_id: input.planId, p_start_date: input.startDate, p_paid_amount: input.paid, p_method: input.method });
    if (error) fail(error);
  },

  /** Renew for 1/3/6/12 months at a fee (when the gym has no plans on the Plans page). */
  async renewDuration(input: { memberId: string; months: number; fee: number; startDate: string; paid: number; method: string }) {
    const { error } = await supabase.rpc("renew_with_duration", { p_member_id: input.memberId, p_months: input.months, p_fee: input.fee, p_start_date: input.startDate, p_paid_amount: input.paid, p_method: input.method });
    if (error) fail(error);
  },

  async checkIn(memberId: string) {
    const { data, error } = await supabase.from("attendance").insert({ member_id: memberId }).select("id, checked_in_at").single();
    if (error?.message === "already_checked_in") {
      // details = "<local time>|<who marked it>", see the attendance_once_a_day migration
      const [at, by] = (error.details ?? "").split("|");
      throw new Error(`Already checked in today${at ? ` at ${formatTime(at)}` : ""}${by ? ` by ${by}` : ""}.`);
    }
    if (error) fail(error, "Couldn't save the check-in. Try again.");
    return { id: data.id as string, at: local(data.checked_in_at as string) };
  },

  async savePlan(input: { id?: string; name: string; days: number; price: number }) {
    const { error } = input.id
      ? await supabase.from("plans").update({ name: input.name, days: input.days, price: input.price }).eq("id", input.id)
      : await supabase.from("plans").insert({ name: input.name, days: input.days, price: input.price });
    if (error) fail(error);
  },

  /** Plans are hidden, not deleted, so past memberships keep their history. */
  async deletePlan(id: string) {
    const { error } = await supabase.from("plans").update({ active: false }).eq("id", id);
    if (error) fail(error);
  },

  async addExpense(input: { date: string; category: string; amount: number; method: string; note: string }) {
    const { error } = await supabase.from("expenses").insert({ spent_on: input.date, category: input.category, amount: input.amount, method: input.method, note: input.note });
    if (error) fail(error);
  },

  async deleteExpense(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) fail(error);
  },

  async saveGym(input: { name: string; address: string; phone: string; gstin: string }) {
    const { error } = await supabase.from("gyms").update(input).not("id", "is", null);
    if (error) fail(error);
  },
};
