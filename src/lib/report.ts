// Owner's report: the numbers for a period (today, yesterday, this month, last month) as an
// Excel workbook and as a short text to share on WhatsApp. Uses the same lists as the
// Dashboard / Renewals / daily summary, so the numbers match the app.

import { type AppData } from "../data/types";
import { addDays, formatDate, formatMoney, MONTHS_LONG, parseDate, toISODate } from "./format";
import { ageOn, INTAKE_SECTIONS } from "./intake";
import { expiredWithin, expiringWithin, firstMembershipIds, lastVisits, memberStatus, membersWithDues, stoppedComing } from "./members";
import { inRange, type DateRange } from "./periods";
import { buildDailySummary } from "./summary";
import { summaryText } from "./summaryText";

export type ReportPeriod = "today" | "yesterday" | "this-month" | "last-month";

export const REPORT_PERIODS: [ReportPeriod, string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["this-month", "This month"], ["last-month", "Last month"]];

export function reportRange(period: ReportPeriod, today: string): DateRange & { label: string; fileLabel: string } {
  const monthOf = (iso: string) => { const d = parseDate(iso); return { start: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), end: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)), name: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` }; };
  if (period === "today") return { start: today, end: today, label: `Today, ${formatDate(today)}`, fileLabel: today };
  if (period === "yesterday") { const y = addDays(today, -1); return { start: y, end: y, label: `Yesterday, ${formatDate(y)}`, fileLabel: y }; }
  const m = monthOf(period === "this-month" ? today : addDays(`${today.slice(0, 7)}-01`, -1));
  // This month: up to today.
  return { start: m.start, end: period === "this-month" ? today : m.end, label: period === "this-month" ? `${m.name} (till ${formatDate(today)})` : m.name, fileLabel: m.start.slice(0, 7) };
}

export function buildReport(data: AppData, today: string, period: ReportPeriod) {
  const range = reportRange(period, today);
  const payments = data.payments.filter((p) => inRange(p.paidAt, range)).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const checkins = data.attendance.filter((a) => inRange(a.at, range)).sort((a, b) => a.at.localeCompare(b.at));
  const expenses = data.expenses.filter((e) => inRange(e.date, range)).sort((a, b) => a.date.localeCompare(b.date));
  const firstIds = firstMembershipIds(data.renewals);
  const renewals = data.renewals.filter((r) => inRange(r.createdAt, range) && !firstIds.has(r.id));
  const newMembers = data.members.filter((m) => !m.pending && inRange(m.joined, range));
  const byMethod = new Map<string, number>();
  payments.forEach((p) => byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount));
  const collected = payments.reduce((s, p) => s + p.amount, 0);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const last = lastVisits(data);
  const dues = membersWithDues(data.members);
  return {
    period, range, today,
    payments, checkins, expenses, renewals, newMembers,
    collected, spent, profit: collected - spent,
    byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
    // "Right now" lists (not tied to the period)
    lastVisit: last,
    active: data.members.filter((m) => memberStatus(m, today) === "Active").length,
    expiredNow: data.members.filter((m) => memberStatus(m, today) === "Expired").length,
    expiring: expiringWithin(data.members, today, 7),
    expired: expiredWithin(data.members, today, 30),
    dues,
    duesTotal: dues.reduce((s, m) => s + m.balance, 0),
    inactive: stoppedComing(data, today, 14, last),
  };
}
export type Report = ReturnType<typeof buildReport>;

/** Short text to share on WhatsApp. A single day uses the same message as the daily summary. */
export function reportShareText(data: AppData, report: Report, appUrl: string) {
  if (report.range.start === report.range.end) return summaryText(buildDailySummary(data, report.range.start), appUrl);
  const split = report.byMethod.map(([m, v]) => `${m} ${formatMoney(v)}`).join(" · ");
  return [
    `${data.gym.name} — Report, ${report.range.label}`,
    `💰 Collected: ${formatMoney(report.collected)} (${report.payments.length} payment${report.payments.length === 1 ? "" : "s"}${split ? `, ${split}` : ""})`,
    `🧾 Expenses: ${formatMoney(report.spent)}`,
    `📈 Profit: ${formatMoney(report.profit)}`,
    `🆕 New members: ${report.newMembers.length} · 🔁 Renewals: ${report.renewals.length}`,
    `✅ Check-ins: ${report.checkins.length}`,
    `⏳ Pending dues now: ${formatMoney(report.duesTotal)} from ${report.dues.length} member${report.dues.length === 1 ? "" : "s"}`,
    `Open app: ${appUrl}`,
  ].join("\n");
}

type Cell = string | number;
export type Sheet = { name: string; rows: Cell[][]; widths: number[] };

const time = (local: string) => { const [h, m] = local.slice(11, 16).split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

/** Workbook content: one sheet per topic, plain words an owner understands. */
export function reportSheets(data: AppData, r: Report): Sheet[] {
  const phoneOf = new Map(data.members.map((m) => [m.id, m.phone]));
  const summary: Cell[][] = [
    [data.gym.name, ""],
    ["Report", r.range.label],
    ["Made on", `${formatDate(r.today)} (Gym Manager by Messy2Easy)`],
    [],
    ["MONEY", ""],
    ["Collected", r.collected],
    ...r.byMethod.map(([m, v]): Cell[] => [`   by ${m}`, v]),
    ["Expenses", r.spent],
    ["Profit (collected − expenses)", r.profit],
    [],
    ["MEMBERS", ""],
    ["New members joined", r.newMembers.length],
    ["Renewals", r.renewals.length],
    ["Check-ins", r.checkins.length],
    [],
    ["RIGHT NOW", ""],
    ["Active members", r.active],
    ["Expired members", r.expiredNow],
    ["Pending dues (₹)", r.duesTotal],
    ["Members with dues", r.dues.length],
    ["Expiring in the next 7 days", r.expiring.length],
    ["Expired in the last 30 days, not renewed", r.expired.length],
    ["Stopped coming (14+ days)", r.inactive.length],
    [],
    ["Amounts are in ₹. See the other sheets for details.", ""],
  ];
  const payments: Cell[][] = [["Date", "Time", "Member", "Mobile", "Method", "Amount (₹)", "Added by", "Note"],
    ...r.payments.map((p): Cell[] => [formatDate(p.paidAt), time(p.paidAt), p.memberName, phoneOf.get(p.memberId) ?? "", p.method, p.amount, p.addedBy, p.description]),
    ["", "", "", "", "Total", r.collected, "", ""]];
  const checkins: Cell[][] = [["Date", "Time", "Member", "Marked by"], ...r.checkins.map((a): Cell[] => [formatDate(a.at), time(a.at), a.memberName, a.by])];
  const expenses: Cell[][] = [["Date", "Category", "Method", "Amount (₹)", "Note"], ...r.expenses.map((e): Cell[] => [formatDate(e.date), e.category, e.method, e.amount, e.note]), ["", "", "Total", r.spent, ""]];
  // Everything about the member, including the joining-form answers (the Aadhaar file stays in the app).
  const yesNo = (v: boolean | undefined) => (v === undefined ? "" : v ? "Yes" : "No");
  const members: Cell[][] = [["Code", "Name", "Mobile", "Plan", "Started", "Valid until", "Status", "Due (₹)", "Last visit", "Joined", "Joined via", "Gender", "Age", "Email", "Address", "Emergency contact", "Weight (kg)",
    ...INTAKE_SECTIONS.flatMap((s) => s.questions.map((q) => q.short)), "Comments"],
    ...[...data.members].sort((a, b) => a.name.localeCompare(b.name)).map((m): Cell[] => [m.code, m.name, m.phone, m.pending ? "Not activated" : m.plan, m.pending ? "" : formatDate(m.startDate), m.pending ? "" : formatDate(m.expiryDate), memberStatus(m, r.today), m.balance > 0 ? m.balance : 0, r.lastVisit.get(m.id) ? formatDate(r.lastVisit.get(m.id)!) : "Never", formatDate(m.joined),
      m.source === "form" ? "Registration form" : "Added in app", m.gender, ageOn(m.dob, r.today), m.email, m.address, m.emergency, m.intake.weight ?? "",
      ...INTAKE_SECTIONS.flatMap((s) => s.questions.map((q): Cell => (q.kind === "yesno" ? yesNo(m.intake[q.key]) : m.intake[q.key] ?? ""))), m.intake.comments ?? ""])];
  const follow: Cell[][] = [["What to do", "Member", "Mobile", "Detail"],
    ...r.expiring.map((m): Cell[] => ["Remind to renew (expiring soon)", m.name, m.phone, `Ends ${formatDate(m.expiryDate)}`]),
    ...r.expired.map((m): Cell[] => ["Call to win back (expired)", m.name, m.phone, `Ended ${formatDate(m.expiryDate)}`]),
    ...r.dues.map((m): Cell[] => ["Collect dues", m.name, m.phone, formatMoney(m.balance)]),
    ...r.inactive.map((m): Cell[] => ["Stopped coming", m.name, m.phone, r.lastVisit.get(m.id) ? `Last visit ${formatDate(r.lastVisit.get(m.id)!)}` : "No visit yet"])];
  return [
    { name: "Summary", rows: summary, widths: [40, 34] },
    { name: "Payments", rows: payments, widths: [13, 10, 24, 13, 14, 12, 18, 30] },
    { name: "Check-ins", rows: checkins, widths: [13, 10, 24, 18] },
    { name: "Expenses", rows: expenses, widths: [13, 22, 14, 12, 30] },
    { name: "Members", rows: members, widths: [9, 24, 13, 16, 13, 13, 11, 10, 13, 13, 17, 8, 6, 24, 30, 16, 11, ...INTAKE_SECTIONS.flatMap((s) => s.questions.map(() => 20)), 30] },
    { name: "Follow up", rows: follow, widths: [32, 24, 13, 26] },
  ];
}

/** Builds the .xlsx in the browser and downloads it. The Excel library loads only when needed. */
export async function downloadReport(data: AppData, r: Report) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const s of reportSheets(data, r)) {
    const sheet = XLSX.utils.aoa_to_sheet(s.rows);
    sheet["!cols"] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(book, sheet, s.name);
  }
  const safeName = data.gym.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "gym";
  XLSX.writeFile(book, `${safeName}-report-${r.range.fileLabel}.xlsx`);
}
