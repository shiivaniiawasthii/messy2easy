// Reads and writes the gym's data in Supabase. Row Level Security on the
// server limits everything to the logged-in user's gym and role.

import { addDays, formatTime, toLocalDateTime, todayISO } from "../lib/format";
import { supabase } from "../lib/supabase";
import { ATTENDANCE_DAYS_LOADED, avatarColors, type AppData, type Member, type Payment } from "./types";

/** Supabase returns at most 1000 rows per request, so read bigger tables page by page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

const local = (timestamp: string) => toLocalDateTime(new Date(timestamp));

type MemberRow = { id: string; code: string; name: string; phone: string; color: string; joined_on: string; plan: string | null; plan_days: number | null; plan_price: number | null; start_date: string | null; expiry_date: string | null; balance: number | null; suspended: boolean; emergency_contact: string; date_of_birth: string | null; notes: string };
type PaymentRow = { id: string; member_id: string; amount: number; method: string; paid_at: string; note: string };

/** Loads everything the app shows for the logged-in user's gym. */
export async function loadAppData(): Promise<AppData> {
  const since = addDays(todayISO(), -ATTENDANCE_DAYS_LOADED);
  const [gym, plans, members, memberships, payments, attendance, expenses, team] = await Promise.all([
    supabase.from("gyms").select("name, address, phone, gstin, subscription_plan, subscription_ends_on").maybeSingle(),
    supabase.from("plans").select("id, name, days, price").eq("active", true).order("days"),
    fetchAll<MemberRow>((a, b) => supabase.from("member_overview").select("id, code, name, phone, color, joined_on, plan, plan_days, plan_price, start_date, expiry_date, balance, suspended, emergency_contact, date_of_birth, notes").order("created_at", { ascending: false }).range(a, b)),
    fetchAll<{ id: string; member_id: string; plan_name: string; price: number; start_date: string; end_date: string; created_at: string }>((a, b) => supabase.from("memberships").select("id, member_id, plan_name, price, start_date, end_date, created_at").order("start_date").range(a, b)),
    fetchAll<PaymentRow>((a, b) => supabase.from("payments").select("id, member_id, amount, method, paid_at, note").order("paid_at").range(a, b)),
    fetchAll<{ id: string; member_id: string; checked_in_at: string; created_by: string | null }>((a, b) => supabase.from("attendance").select("id, member_id, checked_in_at, created_by").gte("checked_in_at", new Date(`${since}T00:00:00`).toISOString()).order("checked_in_at").range(a, b)),
    fetchAll<{ id: string; spent_on: string; category: string; amount: number; method: string; note: string }>((a, b) => supabase.from("expenses").select("id, spent_on, category, amount, method, note").order("spent_on").range(a, b)),
    supabase.from("staff").select("user_id, name"),
  ]);
  if (gym.error) throw new Error(gym.error.message);
  if (plans.error) throw new Error(plans.error.message);

  const memberList: Member[] = members.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    phone: m.phone,
    color: m.color,
    joined: m.joined_on,
    plan: m.plan ?? "No plan",
    planDays: m.plan_days ?? 1,
    planPrice: m.plan_price ?? 0,
    startDate: m.start_date ?? m.joined_on,
    expiryDate: m.expiry_date ?? addDays(m.joined_on, -1),
    balance: Number(m.balance ?? 0),
    suspended: m.suspended,
    emergency: m.emergency_contact,
    dob: m.date_of_birth ?? "",
    notes: m.notes,
  }));
  const nameOf = new Map(memberList.map((m) => [m.id, m.name]));
  const staffName = new Map((team.data ?? []).map((s) => [s.user_id as string, s.name as string]));

  // A payment is "Paid" when, at that moment, everything charged so far was covered.
  const charges = new Map<string, { date: string; price: number }[]>();
  memberships.forEach((x) => charges.set(x.member_id, [...(charges.get(x.member_id) ?? []), { date: x.created_at, price: x.price }]));
  const paidSoFar = new Map<string, number>();
  const paymentList: Payment[] = payments.map((p) => {
    const total = (paidSoFar.get(p.member_id) ?? 0) + p.amount;
    paidSoFar.set(p.member_id, total);
    const charged = (charges.get(p.member_id) ?? []).filter((c) => c.date <= p.paid_at).reduce((s, c) => s + c.price, 0);
    return { id: p.id, memberId: p.member_id, memberName: nameOf.get(p.member_id) ?? "Member", paidAt: local(p.paid_at), method: p.method, amount: p.amount, status: total >= charged ? "Paid" : "Partial", description: p.note || "Membership payment" };
  });

  return {
    gym: { name: gym.data?.name ?? "", address: gym.data?.address ?? "", phone: gym.data?.phone ?? "", gstin: gym.data?.gstin ?? "", subscriptionPlan: gym.data?.subscription_plan ?? "Pilot", subscriptionEndsOn: gym.data?.subscription_ends_on ?? "" },
    plans: (plans.data ?? []).map((p) => ({ id: p.id, name: p.name, days: p.days, price: p.price })),
    members: memberList,
    renewals: memberships.map((x) => ({ id: x.id, memberId: x.member_id, plan: x.plan_name, startDate: x.start_date, expiryDate: x.end_date, price: x.price, createdAt: local(x.created_at) })),
    payments: paymentList,
    attendance: attendance.map((a) => ({ id: a.id, memberId: a.member_id, memberName: nameOf.get(a.member_id) ?? "Member", at: local(a.checked_in_at), by: a.created_by ? staffName.get(a.created_by) ?? "Removed login" : "" })),
    expenses: expenses.map((e) => ({ id: e.id, date: e.spent_on, category: e.category, amount: e.amount, method: e.method, note: e.note })),
  };
}

/** Turns database errors into short messages. */
function fail(error: { message?: string; code?: string } | null, fallback = "Couldn't save. Check your internet connection and try again."): never {
  const msg = error?.message ?? "";
  if (error?.code === "23505" && msg.includes("phone")) throw new Error("This mobile number already belongs to another member.");
  if (error?.code === "23505" && msg.includes("plans")) throw new Error("A plan with this name already exists.");
  if (error?.code === "42501" || msg.includes("row-level security")) throw new Error("You don't have permission to do this.");
  if (msg.includes("Failed to fetch")) throw new Error("No internet connection. Try again.");
  throw new Error(fallback);
}

/** A local "YYYY-MM-DD" date (optionally with time) as a database timestamp. */
const toTimestamp = (date: string, time = "12:00:00") => new Date(`${date}T${time}`).toISOString();

export const db = {
  async addMember(input: { name: string; phone: string; joined: string; emergency: string; dob: string; notes: string; planId: string | null; customDays?: number; customPrice?: number }) {
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
    });
    if (error) fail(error);
    return data as string;
  },

  async updateMember(id: string, input: { name: string; phone: string; joined: string; emergency: string; dob: string; notes: string; suspended: boolean }) {
    const { error } = await supabase.from("members").update({ name: input.name, phone: input.phone, joined_on: input.joined, emergency_contact: input.emergency, date_of_birth: input.dob || null, notes: input.notes, suspended: input.suspended }).eq("id", id);
    if (error) fail(error);
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
