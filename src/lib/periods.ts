import { type Payment } from "../data/types";
import { addDays, MONTHS, MONTHS_LONG, nowLocal, toISODate } from "./format";

export function monthTotals(payments: Payment[], months: number) {
  const now = new Date();
  const result: { key: string; label: string; total: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = toISODate(d).slice(0, 7);
    result.push({ key, label: MONTHS[d.getMonth()], total: payments.filter((p) => p.paidAt.startsWith(key)).reduce((s, p) => s + p.amount, 0) });
  }
  return result;
}

export type Period = "today" | "month" | "year";

// `until` (HH:MM:SS) cuts timestamps on the last day, e.g. "yesterday up to now".
export type DateRange = { start: string; end: string; until?: string };

export const PERIODS: [Period, string][] = [["today", "Today"], ["month", "This month"], ["year", "This year"]];

export const inRange = (value: string, r: DateRange) => {
  const d = value.slice(0, 10);
  if (d < r.start || d > r.end) return false;
  return !(r.until && d === r.end && value.length > 10 && value.slice(11, 19) > r.until);
};

export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

export const shortHour = (h: number) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The selected period so far, and the same stretch of the period before it. */
export function periodRanges(period: Period, today: string): { current: DateRange; previous: DateRange; vs: string } {
  const [y, m, d] = today.split("-").map(Number);
  if (period === "today") {
    const yesterday = addDays(today, -1);
    return { current: { start: today, end: today }, previous: { start: yesterday, end: yesterday, until: nowLocal().slice(11, 19) }, vs: "yesterday by this time" };
  }
  if (period === "month") {
    const start = `${today.slice(0, 7)}-01`;
    const prevStart = toISODate(new Date(y, m - 2, 1));
    const prevLast = addDays(start, -1);
    const prevSameDay = addDays(prevStart, d - 1);
    return { current: { start, end: today }, previous: { start: prevStart, end: prevSameDay < prevLast ? prevSameDay : prevLast }, vs: "same days last month" };
  }
  return { current: { start: `${y}-01-01`, end: today }, previous: { start: `${y - 1}-01-01`, end: `${y - 1}-${today.slice(5)}` }, vs: "same time last year" };
}

export type Bucket = { key: string; label: string; total: number };

/** Collections split into bars: days for Today/This month, months for This year. */
export function collectionBuckets(payments: Payment[], period: Period, today: string): Bucket[] {
  const sum = (prefix: string) => payments.filter((p) => p.paidAt.startsWith(prefix)).reduce((s, p) => s + p.amount, 0);
  if (period === "year") {
    const [y, m] = today.split("-").map(Number);
    return Array.from({ length: m }, (_, i) => { const key = `${y}-${String(i + 1).padStart(2, "0")}`; return { key, label: MONTHS[i], total: sum(key) }; });
  }
  const days = period === "today" ? 14 : Number(today.slice(8, 10));
  const first = period === "today" ? addDays(today, -13) : `${today.slice(0, 7)}-01`;
  return Array.from({ length: days }, (_, i) => { const key = addDays(first, i); return { key, label: String(Number(key.slice(8, 10))), total: sum(key) }; });
}

export type EarnView = "month" | "quarter" | "year";

export type EarnPeriod = { key: string; short: string; label: string; start: string; end: string };

export type EarnRow = EarnPeriod & { income: number; expense: number; profit: number; current: boolean };

export const lastDayOf = (year: number, month0: number) => toISODate(new Date(year, month0 + 1, 0));

export const fyLabel = (startYear: number) => `FY ${startYear}–${String(startYear + 1).slice(2)}`;

/** Periods oldest → newest, ending with the one containing today. Quarters and years follow the Indian financial year (Apr–Mar). */
export function earningPeriods(view: EarnView, today: string): EarnPeriod[] {
  const [y, m] = today.split("-").map(Number);
  const m0 = m - 1;
  if (view === "month") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(y, m0 - 11 + i, 1);
      const yy = d.getFullYear(), mm = d.getMonth();
      return { key: `${yy}-${mm}`, short: MONTHS[mm], label: `${MONTHS_LONG[mm]} ${yy}`, start: toISODate(d), end: lastDayOf(yy, mm) };
    });
  }
  if (view === "quarter") {
    const quarterStart = m0 >= 3 ? 3 + Math.floor((m0 - 3) / 3) * 3 : 0;
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(y, quarterStart - (7 - i) * 3, 1);
      const yy = d.getFullYear(), mm = d.getMonth();
      const fyStart = mm >= 3 ? yy : yy - 1;
      const q = mm >= 3 ? (mm - 3) / 3 + 1 : 4;
      return { key: `${yy}-${mm}`, short: `Q${q} ’${String(fyStart + 1).slice(2)}`, label: `${MONTHS[mm]}–${MONTHS[mm + 2]} ${yy} · Q${q} ${fyLabel(fyStart)}`, start: toISODate(d), end: lastDayOf(yy, mm + 2) };
    });
  }
  const fyNow = m0 >= 3 ? y : y - 1;
  return Array.from({ length: 4 }, (_, i) => {
    const s = fyNow - 3 + i;
    return { key: String(s), short: `${s}–${String(s + 1).slice(2)}`, label: `${fyLabel(s)} (Apr ${s} – Mar ${s + 1})`, start: `${s}-04-01`, end: `${s + 1}-03-31` };
  });
}

export const EARN_VIEWS: [EarnView, string, string][] = [["month", "Monthly", "month"], ["quarter", "Quarterly", "quarter"], ["year", "Yearly", "year"]];
