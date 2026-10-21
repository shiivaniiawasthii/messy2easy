// Reads a gym's data and turns the database rows into AppData.
// Used by the app (browser, with the user's login and Row Level Security) and by the
// server (Supabase Edge Function for the daily summary), so both see the same numbers.
// Explicit .ts extensions and no browser-only imports: this file also runs in Deno.

import { addDays } from "../lib/format.ts";
import { type AppData, type Intake, type Member, type Payment } from "./types.ts";

/** Any Supabase client (browser or server). Kept loose so this file needs no Supabase import. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };
type Result<T> = { data: T[] | null; error: { message: string } | null };

/** Supabase returns at most 1000 rows per request, so read bigger tables page by page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result<T>>) {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

type GymRow = { name: string; address: string; phone: string; gstin: string; subscription_plan: string; subscription_ends_on: string | null; registration_token: string | null };
type PlanRow = { id: string; name: string; days: number; price: number };
type MemberRow = { id: string; code: string; name: string; phone: string; color: string; joined_on: string; plan: string | null; plan_days: number | null; plan_price: number | null; start_date: string | null; expiry_date: string | null; balance: number | null; suspended: boolean; emergency_contact: string; date_of_birth: string | null; notes: string; email: string; gender: string; address: string; source: string; intake: Intake | null; aadhaar_path: string; aadhaar_status: string };
type MembershipRow = { id: string; member_id: string; plan_name: string; price: number; start_date: string; end_date: string; created_at: string };
type PaymentRow = { id: string; member_id: string; amount: number; method: string; paid_at: string; note: string; created_by: string | null; created_at: string };
type AttendanceRow = { id: string; member_id: string; checked_in_at: string; created_by: string | null };
type ExpenseRow = { id: string; spent_on: string; category: string; amount: number; method: string; note: string };
type TeamRow = { user_id: string; name: string };

export type AppRows = { gym: GymRow | null; plans: PlanRow[]; members: MemberRow[]; memberships: MembershipRow[]; payments: PaymentRow[]; attendance: AttendanceRow[]; expenses: ExpenseRow[]; team: TeamRow[] };

/**
 * Reads the rows. In the browser RLS limits them to the user's gym; the server (service role)
 * passes `gymId` to pick one gym. `attendanceSince` is an ISO timestamp.
 */
export async function fetchAppRows(client: Client, attendanceSince: string, gymId?: string): Promise<AppRows> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forGym = (q: any, column = "gym_id") => (gymId ? q.eq(column, gymId) : q);
  const [gym, plans, members, memberships, payments, attendance, expenses, team] = await Promise.all([
    forGym(client.from("gyms").select("name, address, phone, gstin, subscription_plan, subscription_ends_on, registration_token"), "id").maybeSingle(),
    forGym(client.from("plans").select("id, name, days, price").eq("active", true)).order("days"),
    fetchAll<MemberRow>((a, b) => forGym(client.from("member_overview").select("id, code, name, phone, color, joined_on, plan, plan_days, plan_price, start_date, expiry_date, balance, suspended, emergency_contact, date_of_birth, notes, email, gender, address, source, intake, aadhaar_path, aadhaar_status")).order("created_at", { ascending: false }).range(a, b)),
    fetchAll<MembershipRow>((a, b) => forGym(client.from("memberships").select("id, member_id, plan_name, price, start_date, end_date, created_at")).order("start_date").range(a, b)),
    fetchAll<PaymentRow>((a, b) => forGym(client.from("payments").select("id, member_id, amount, method, paid_at, note, created_by, created_at")).order("paid_at").range(a, b)),
    fetchAll<AttendanceRow>((a, b) => forGym(client.from("attendance").select("id, member_id, checked_in_at, created_by")).gte("checked_in_at", attendanceSince).order("checked_in_at").range(a, b)),
    fetchAll<ExpenseRow>((a, b) => forGym(client.from("expenses").select("id, spent_on, category, amount, method, note")).order("spent_on").range(a, b)),
    forGym(client.from("staff").select("user_id, name")),
  ]);
  if (gym.error) throw new Error(gym.error.message);
  if (plans.error) throw new Error(plans.error.message);
  return { gym: gym.data, plans: plans.data ?? [], members, memberships, payments, attendance, expenses, team: team.data ?? [] };
}

/** Rows → AppData. `local` turns a database timestamp into local "YYYY-MM-DDTHH:MM:SS" (IST). */
export function toAppData(rows: AppRows, local: (timestamp: string) => string): AppData {
  const memberList: Member[] = rows.members.map((m) => ({
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
    email: m.email,
    gender: m.gender,
    address: m.address,
    source: m.source === "form" ? "form" : "staff",
    pending: m.plan === null,
    intake: m.intake ?? {},
    aadhaarPath: m.aadhaar_path ?? "",
    aadhaarStatus: (["pending", "verified", "rejected"].includes(m.aadhaar_status) ? m.aadhaar_status : "none") as Member["aadhaarStatus"],
  }));
  const nameOf = new Map(memberList.map((m) => [m.id, m.name]));
  const staffName = new Map(rows.team.map((s) => [s.user_id, s.name]));
  const author = (userId: string | null) => (userId ? staffName.get(userId) ?? "Removed login" : "");

  // A payment is "Paid" when, at that moment, everything charged so far was covered.
  const charges = new Map<string, { date: string; price: number }[]>();
  rows.memberships.forEach((x) => charges.set(x.member_id, [...(charges.get(x.member_id) ?? []), { date: x.created_at, price: x.price }]));
  const paidSoFar = new Map<string, number>();
  const paymentList: Payment[] = rows.payments.map((p) => {
    const total = (paidSoFar.get(p.member_id) ?? 0) + p.amount;
    paidSoFar.set(p.member_id, total);
    const charged = (charges.get(p.member_id) ?? []).filter((c) => c.date <= p.paid_at).reduce((s, c) => s + c.price, 0);
    return { id: p.id, memberId: p.member_id, memberName: nameOf.get(p.member_id) ?? "Member", paidAt: local(p.paid_at), method: p.method, amount: p.amount, status: total >= charged ? "Paid" : "Partial", description: p.note || "Membership payment", addedBy: author(p.created_by), addedAt: local(p.created_at) };
  });

  const gym = rows.gym;
  return {
    gym: { name: gym?.name ?? "", address: gym?.address ?? "", phone: gym?.phone ?? "", gstin: gym?.gstin ?? "", subscriptionPlan: gym?.subscription_plan ?? "Pilot", subscriptionEndsOn: gym?.subscription_ends_on ?? "", registrationToken: gym?.registration_token ?? "" },
    plans: rows.plans.map((p) => ({ id: p.id, name: p.name, days: p.days, price: p.price })),
    members: memberList,
    renewals: rows.memberships.map((x) => ({ id: x.id, memberId: x.member_id, plan: x.plan_name, startDate: x.start_date, expiryDate: x.end_date, price: x.price, createdAt: local(x.created_at) })),
    payments: paymentList,
    attendance: rows.attendance.map((a) => ({ id: a.id, memberId: a.member_id, memberName: nameOf.get(a.member_id) ?? "Member", at: local(a.checked_in_at), by: author(a.created_by) })),
    expenses: rows.expenses.map((e) => ({ id: e.id, date: e.spent_on, category: e.category, amount: e.amount, method: e.method, note: e.note })),
  };
}
