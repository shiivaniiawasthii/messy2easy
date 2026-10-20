// Unit tests for member status with self-service registration. Run: pnpm test

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AppRows, toAppData } from "../data/appData.ts";
import { type Renewal } from "../data/types.ts";
import { expiredWithin, firstMembershipIds, memberAlerts, memberStatus } from "./members.ts";

const TODAY = "2026-10-20";
const memberRow = (over: Partial<AppRows["members"][number]> = {}): AppRows["members"][number] => ({
  id: "m1", code: "M-0001", name: "Rahul Kumar", phone: "9876543210", color: "mint", joined_on: "2026-10-18",
  plan: null, plan_days: null, plan_price: null, start_date: null, expiry_date: null, balance: 0,
  suspended: false, emergency_contact: "", date_of_birth: null, notes: "", email: "", gender: "", address: "", source: "form", ...over,
});
const rows = (members: AppRows["members"]): AppRows => ({ gym: null, plans: [], members, memberships: [], payments: [], attendance: [], expenses: [], team: [] });

describe("registered members", () => {
  it("a member with no membership is Pending, not Expired", () => {
    const data = toAppData(rows([memberRow()]), (ts) => ts);
    const m = data.members[0];
    assert.equal(m.pending, true);
    assert.equal(m.source, "form");
    assert.equal(memberStatus(m, TODAY), "Pending");
    // They must not show up as "didn't renew" or in the renewal alerts.
    assert.deepEqual(expiredWithin(data.members, TODAY, 30), []);
    assert.deepEqual(memberAlerts(data, TODAY), []);
  });

  it("suspended wins over pending; an activated member is Active", () => {
    const data = toAppData(rows([
      memberRow({ id: "s", suspended: true }),
      memberRow({ id: "a", plan: "Monthly", plan_days: 30, plan_price: 1000, start_date: "2026-10-20", expiry_date: "2026-11-18", balance: 0 }),
    ]), (ts) => ts);
    assert.equal(memberStatus(data.members[0], TODAY), "Suspended");
    assert.equal(data.members[1].pending, false);
    assert.equal(memberStatus(data.members[1], TODAY), "Active");
  });
});

describe("firstMembershipIds", () => {
  const r = (id: string, memberId: string, startDate: string, createdAt: string): Renewal => ({ id, memberId, plan: "Monthly", startDate, expiryDate: startDate, price: 1000, createdAt });

  it("picks each member's earliest membership, even when it started after joining", () => {
    // Registered on the 18th, activated on the 20th, renewed in November.
    const ids = firstMembershipIds([r("renew", "m1", "2026-11-19", "2026-11-19T10:00:00"), r("first", "m1", "2026-10-20", "2026-10-20T10:00:00"), r("other", "m2", "2026-01-01", "2026-01-01T09:00:00")]);
    assert.deepEqual([...ids].sort(), ["first", "other"]);
  });
});
