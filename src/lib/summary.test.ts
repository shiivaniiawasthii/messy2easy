// Unit tests for the daily summary. Run: pnpm test
// The server runs in UTC, so these run in UTC too: date boundaries must follow IST.
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AppRows, toAppData } from "../data/appData.ts";
import { type AppData, type Member } from "../data/types.ts";
import { zonedDateTime } from "./format.ts";
import { buildDailySummary, isSummaryDue, SUMMARY_SECTIONS } from "./summary.ts";
import { summaryHtml, summaryText, whatsappTemplateParams } from "./summaryText.ts";

const TODAY = "2026-10-12";
let seq = 0;
const member = (over: Partial<Member> = {}): Member => ({
  id: `m${++seq}`, code: `M-${seq}`, name: `Member ${seq}`, phone: "9876543210", color: "mint", joined: "2026-01-01",
  plan: "Monthly", planDays: 30, planPrice: 1000, startDate: "2026-10-01", expiryDate: "2026-10-30",
  balance: 0, suspended: false, emergency: "", dob: "", notes: "", email: "", gender: "", address: "", source: "staff", pending: false, intake: {}, aadhaarPath: "", aadhaarStatus: "none", ...over,
});
const gymData = (over: Partial<AppData> = {}): AppData => ({
  gym: { name: "Wolves Area gym", address: "", phone: "", gstin: "", subscriptionPlan: "Pilot", subscriptionEndsOn: "", registrationToken: "", logoPath: "" },
  members: [], plans: [], payments: [], attendance: [], renewals: [], expenses: [], ...over,
});
const visit = (m: Member, at: string) => ({ id: `a-${m.id}-${at}`, memberId: m.id, memberName: m.name, at, by: "" });
const pay = (m: Member, amount: number, method: string, paidAt: string) => ({ id: `p-${m.id}-${paidAt}-${amount}`, memberId: m.id, memberName: m.name, paidAt, method, amount, status: "Paid" as const, description: "", addedBy: "", addedAt: paidAt });

describe("daily summary", () => {
  it("gym with no members: all clear", () => {
    const s = buildDailySummary(gymData(), TODAY);
    assert.equal(s.allClear, true);
    const text = summaryText(s, "https://app.example");
    assert.match(text, /^Wolves Area gym — Daily summary, Mon 12 Oct/);
    assert.match(text, /All clear today/);
    assert.match(text, /Open app: https:\/\/app\.example$/);
  });

  it("everything zero (active members who came recently, no dues): all clear", () => {
    const a = member(), b = member();
    const s = buildDailySummary(gymData({ members: [a, b], attendance: [visit(a, "2026-10-10T07:00:00"), visit(b, "2026-10-05T07:00:00")] }), TODAY);
    assert.equal(s.allClear, true);
    assert.equal(s.checkins, 0);
    assert.equal(s.inactive.count, 0);
  });

  it("collections and check-ins today, with the cash/UPI split", () => {
    const a = member({ name: "Rahul Verma" });
    const data = gymData({
      members: [a],
      attendance: [visit(a, `${TODAY}T07:00:00`), visit(a, "2026-10-11T07:00:00")],
      payments: [pay(a, 1000, "UPI", `${TODAY}T09:00:00`), pay(a, 500, "Cash", `${TODAY}T18:00:00`), pay(a, 700, "UPI", "2026-10-11T18:00:00")],
    });
    const s = buildDailySummary(data, TODAY);
    assert.deepEqual(s.collections, { total: 1500, count: 2, byMethod: [{ method: "UPI", amount: 1000 }, { method: "Cash", amount: 500 }] });
    assert.equal(s.checkins, 1);
    assert.equal(s.allClear, false);
    assert.match(summaryText(s, "x"), /💰 Collected today: ₹1,500 \(2 payments, UPI ₹1,000 · Cash ₹500\)/);
  });

  it("members with dues: top 5 by amount and the total", () => {
    const owing = [300, 1200, 50, 800, 900, 400].map((balance, i) => member({ name: `Due ${i}`, balance }));
    const s = buildDailySummary(gymData({ members: [...owing, member()] }), TODAY);
    assert.equal(s.dues.count, 6);
    assert.equal(s.dues.total, 3650);
    assert.deepEqual(s.dues.top.map((d) => d.amount), [1200, 900, 800, 400, 300]);
    assert.match(summaryText(s, "x"), /🧾 Pending dues: ₹3,650 from 6 members — Due 1 ₹1,200, Due 4 ₹900, Due 3 ₹800, Due 5 ₹400, Due 0 ₹300, \+1 more/);
  });

  it("expired in the last 7 days and not renewed; expiring in the next 3 days", () => {
    const expired3 = member({ name: "Anjali Dubey", expiryDate: "2026-10-09" });
    const expired10 = member({ name: "Old Expired", expiryDate: "2026-10-02" });
    const suspended = member({ name: "Suspended", expiryDate: "2026-10-09", suspended: true });
    const today = member({ name: "Rahul Verma", expiryDate: TODAY });
    const tomorrow = member({ name: "Pooja Singh", expiryDate: "2026-10-13" });
    const in3 = member({ name: "Amit Yadav", expiryDate: "2026-10-15" });
    const in4 = member({ name: "Later", expiryDate: "2026-10-16" });
    const s = buildDailySummary(gymData({ members: [expired3, expired10, suspended, today, tomorrow, in3, in4] }), TODAY);
    assert.deepEqual(s.expired.map((x) => x.name), ["Anjali Dubey"]);
    assert.deepEqual(s.expiring.map((x) => x.name), ["Rahul Verma", "Pooja Singh", "Amit Yadav"]);
    const text = summaryText(s, "x");
    assert.match(text, /⏰ Expiring in 3 days: 3 — Rahul Verma \(today\), Pooja Singh \(tomorrow\), Amit Yadav \(15 Oct\)/);
    assert.match(text, /❌ Expired, not renewed: 1 — Anjali Dubey/);
  });

  it("stopped coming: active plan and no visit for 14+ days", () => {
    const gone = member({ name: "Gone", joined: "2026-01-01" });
    const recentJoin = member({ name: "New", joined: "2026-10-05" });
    const s = buildDailySummary(gymData({ members: [gone, recentJoin], attendance: [visit(gone, "2026-09-20T07:00:00")] }), TODAY);
    assert.deepEqual(s.inactive, { count: 1, names: ["Gone"] });
  });

  it("only the chosen sections are included", () => {
    const s = buildDailySummary(gymData({ members: [member({ balance: 500 })] }), TODAY, ["checkins"]);
    assert.deepEqual(s.sections, ["checkins"]);
    assert.equal(s.dues.count, 0);
    assert.doesNotMatch(summaryText(s, "x"), /Pending dues/);
    const params = whatsappTemplateParams(s);
    assert.equal(params.length, 8);
    assert.equal(params[6], "Not included");
  });

  it("near midnight in India (server in UTC): today is the IST date", () => {
    // 00:15 IST on 13 Oct is 18:45 UTC on 12 Oct.
    const nowLocal = zonedDateTime(new Date("2026-10-12T18:45:00Z"));
    assert.equal(nowLocal, "2026-10-13T00:15:00");
    const rows: AppRows = {
      gym: { name: "Night Gym", address: "", phone: "", gstin: "", subscription_plan: "Pilot", subscription_ends_on: null, registration_token: null, logo_path: "" },
      plans: [], memberships: [], expenses: [], team: [],
      members: [{ id: "m1", code: "M-1", name: "Night Owl", phone: "9876543210", color: "mint", joined_on: "2026-01-01", plan: "Monthly", plan_days: 30, plan_price: 1000, start_date: "2026-10-01", expiry_date: "2026-10-30", balance: 0, suspended: false, emergency_contact: "", date_of_birth: null, notes: "", email: "", gender: "", address: "", source: "staff", intake: {}, aadhaar_path: "", aadhaar_status: "none" }],
      payments: [
        { id: "p1", member_id: "m1", amount: 500, method: "Cash", paid_at: "2026-10-12T18:40:00Z", note: "", created_by: null, created_at: "2026-10-12T18:40:00Z" }, // 00:10 IST 13 Oct
        { id: "p2", member_id: "m1", amount: 900, method: "UPI", paid_at: "2026-10-12T18:20:00Z", note: "", created_by: null, created_at: "2026-10-12T18:20:00Z" }, // 23:50 IST 12 Oct
      ],
      attendance: [
        { id: "a1", member_id: "m1", checked_in_at: "2026-10-12T18:35:00Z", created_by: null }, // 00:05 IST 13 Oct
        { id: "a2", member_id: "m1", checked_in_at: "2026-10-12T18:00:00Z", created_by: null }, // 23:30 IST 12 Oct
      ],
    };
    const data = toAppData(rows, (ts) => zonedDateTime(new Date(ts)));
    const s13 = buildDailySummary(data, nowLocal.slice(0, 10));
    assert.equal(s13.collections.total, 500);
    assert.equal(s13.checkins, 1);
    const s12 = buildDailySummary(data, "2026-10-12");
    assert.equal(s12.collections.total, 900);
    assert.equal(s12.checkins, 1);
  });

  it("email HTML escapes names and links to the app", () => {
    const s = buildDailySummary(gymData({ members: [member({ name: "<b>Bad</b>", balance: 100 })] }), TODAY);
    const html = summaryHtml(s, "https://app.example");
    assert.doesNotMatch(html, /<b>Bad<\/b>/);
    assert.match(html, /&lt;b&gt;Bad&lt;\/b&gt;/);
    assert.match(html, /href="https:\/\/app\.example"/);
  });

  it("WhatsApp template parameters have no newlines and follow the template order", () => {
    const a = member({ name: "Line\nBreak", balance: 200, expiryDate: TODAY });
    const s = buildDailySummary(gymData({ members: [a] }), TODAY, SUMMARY_SECTIONS);
    const params = whatsappTemplateParams(s);
    assert.equal(params[0], "Wolves Area gym");
    assert.equal(params[1], "Mon 12 Oct");
    assert.ok(params.every((p) => !/[\n\t]/.test(p)));
    assert.match(params[6], /^₹200 from 1 member/);
  });
});

describe("schedule (IST)", () => {
  it("due from the chosen time until 2 hours later", () => {
    assert.equal(isSummaryDue("20:00", "2026-10-12T19:59:00"), false);
    assert.equal(isSummaryDue("20:00", "2026-10-12T20:00:00"), true);
    assert.equal(isSummaryDue("20:00:00", "2026-10-12T21:59:00"), true);
    assert.equal(isSummaryDue("20:00", "2026-10-12T22:00:00"), false);
  });
  it("a late-night time is not sent after midnight (that is the next day)", () => {
    assert.equal(isSummaryDue("23:30", "2026-10-12T23:45:00"), true);
    assert.equal(isSummaryDue("23:30", "2026-10-13T00:15:00"), false);
  });
});
