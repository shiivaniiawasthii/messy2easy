// Date, money and text helpers. Dates are local "YYYY-MM-DD" strings and
// timestamps are local "YYYY-MM-DDTHH:MM:SS" strings (gym runs on IST).

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(d: Date) {
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function nowLocal() {
  return toLocalDateTime(new Date());
}

/** Every gym runs on India time. The server (UTC) must use this, not the machine's clock. */
export const GYM_TIME_ZONE = "Asia/Kolkata";

/** A moment as local "YYYY-MM-DDTHH:MM:SS" in the given time zone (independent of the machine's zone). */
export function zonedDateTime(d: Date, timeZone = GYM_TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function parseDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function parseDateTime(value: string) {
  return value.length > 10 ? new Date(value) : parseDate(value);
}

export function addDays(iso: string, days: number) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days from `b` to `a` (positive when `a` is later). */
export function diffDays(a: string, b: string) {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
}

/** "18 Jun 2025" */
export function formatDate(value: string) {
  const d = parseDate(value);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "18 June 2025" */
export function formatDateLong(value: string) {
  const d = parseDate(value);
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "8:46 AM" */
export function formatTime(value: string) {
  const d = parseDateTime(value);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

/** "16 Jun, 8:32 AM" */
export function formatShortDateTime(value: string) {
  const d = parseDateTime(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${formatTime(value)}`;
}

/** "Today, 7:42 AM", "Yesterday, 7:42 AM" or "12 Jun, 7:42 AM" */
export function formatDayTime(value: string, today: string) {
  const days = diffDays(today, value);
  if (days === 0) return `Today, ${formatTime(value)}`;
  if (days === 1) return `Yesterday, ${formatTime(value)}`;
  return formatShortDateTime(value);
}

export function relativeTime(value: string, now = new Date()) {
  const minutes = Math.floor((now.getTime() - parseDateTime(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

export function formatMoney(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Compact amount for chart labels: ₹950, ₹1.2k, ₹12k, ₹1.5L */
export function formatShortMoney(amount: number) {
  const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/.0$/, ""));
  if (amount >= 100000) return `₹${trim(amount / 100000)}L`;
  if (amount >= 1000) return `₹${trim(amount / 1000)}k`;
  return `₹${amount}`;
}

/** Reads "1,200" or "₹1200" as 1200. Returns NaN for empty or invalid input. */
export function parseMoney(value: string) {
  const cleaned = value.replace(/[₹,\s]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/** "9876543210" -> "98765 43210" */
export function formatPhone(phone: string) {
  const d = digitsOnly(phone);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : phone;
}

export function isValidIndianMobile(phone: string) {
  return /^[6-9]\d{9}$/.test(digitsOnly(phone));
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
