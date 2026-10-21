// Unit tests for the joining form checks (shared by the public page and the `register` Edge Function).
// Run: pnpm test

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkIntake, checkRegistration, INTAKE_SECTIONS, looksLikeAllowedFile } from "./intake.ts";

const TODAY = "2026-10-21";

/** Every question answered with its first option / "No". */
const allAnswers = () => {
  const a: Record<string, unknown> = { weight: 72.5 };
  INTAKE_SECTIONS.forEach((s) => s.questions.forEach((q) => { a[q.key] = q.kind === "choice" ? q.options[0] : false; }));
  return a;
};
const valid = () => ({
  name: "  Rahul   Kumar ", phone: "+91 98765 43210", email: "", dob: "1998-04-02", gender: "Male", address: "", emergency: "",
  intake: { ...allAnswers(), planId: "11111111-1111-1111-1111-111111111111", startDate: TODAY, payment: "UPI" },
});

describe("checkRegistration", () => {
  it("accepts a complete form and cleans it", () => {
    const r = checkRegistration(valid(), TODAY);
    assert.ok(r.ok);
    assert.equal(r.value.name, "Rahul Kumar");
    assert.equal(r.value.phone, "9876543210");
    assert.equal(r.value.intake.payment, "UPI");
    assert.equal(r.value.intake.weight, 72.5);
  });

  it("requires date of birth, gender, plan, start date, payment and weight", () => {
    const cases: [string, (v: ReturnType<typeof valid>) => void][] = [
      ["date of birth", (v) => { v.dob = ""; }],
      ["gender", (v) => { v.gender = ""; }],
      ["plan", (v) => { v.intake.planId = ""; }],
      ["start date", (v) => { v.intake.startDate = "2026-10-20"; }],
      ["payment", (v) => { v.intake.payment = "Card"; }],
      ["weight", (v) => { delete (v.intake as Record<string, unknown>).weight; }],
    ];
    for (const [what, change] of cases) {
      const v = valid();
      change(v);
      assert.equal(checkRegistration(v, TODAY).ok, false, `missing ${what} should be refused`);
    }
  });

  it("accepts a standard duration (1/3/6/12 months) when the gym has no plans", () => {
    const v = valid();
    (v.intake as Record<string, unknown>).planId = "";
    (v.intake as Record<string, unknown>).planMonths = 3;
    const r = checkRegistration(v, TODAY);
    assert.ok(r.ok);
    assert.equal(r.value.intake.planMonths, 3);
    assert.equal(r.value.intake.planId, undefined);
    (v.intake as Record<string, unknown>).planMonths = 2;
    assert.equal(checkRegistration(v, TODAY).ok, false);
  });

  it("requires every question; 'Other' takes short own text only where allowed", () => {
    const v = valid();
    delete (v.intake as Record<string, unknown>).medical;
    assert.equal(checkRegistration(v, TODAY).ok, false);
    const other = valid();
    (other.intake as Record<string, unknown>).goal = "Boxing";
    assert.ok(checkRegistration(other, TODAY).ok);
    const noOther = valid();
    (noOther.intake as Record<string, unknown>).experience = "Pro athlete"; // experience has no "Other"
    assert.equal(checkRegistration(noOther, TODAY).ok, false);
  });
});

describe("checkIntake (owner's form)", () => {
  it("answers are optional, but given ones are checked", () => {
    assert.ok(checkIntake({}, false).ok);
    assert.equal(checkIntake({ weight: 5 }, false).ok, false);
    assert.equal(checkIntake({ medical: "maybe" }, false).ok, true); // not a yes/no: ignored, not saved
  });
});

describe("looksLikeAllowedFile", () => {
  it("checks the first bytes against the claimed type", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7");
    assert.ok(looksLikeAllowedFile("application/pdf", pdf));
    assert.ok(looksLikeAllowedFile("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])));
    assert.equal(looksLikeAllowedFile("image/jpeg", pdf), false);
    assert.equal(looksLikeAllowedFile("text/html", pdf), false);
  });
});
