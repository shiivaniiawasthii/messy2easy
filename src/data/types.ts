// Shapes the app works with. They are filled from the database (see appData.ts / db.ts).
// Also used by the server (Supabase Edge Function), so keep this file free of imports.
// Dates are local "YYYY-MM-DD"; timestamps local "YYYY-MM-DDTHH:MM:SS" (IST).

export type Plan = { id: string; name: string; days: number; price: number };

/** Choice answers of the joining form (an option, or the person's own text for "Other"). */
export type IntakeChoiceKey = "goal" | "experience" | "focus" | "workoutType" | "workoutTime" | "heardFrom" | "importantFactor";
export type IntakeYesNoKey = "medical" | "medications" | "dietRestrictions" | "personalTraining" | "dietHelp";

/**
 * Answers to the joining form (members.intake). All optional in the type: old members and members
 * added in the app may have none. Questions and validation: src/lib/intake.ts.
 * planId/planName/startDate/payment are what a registered person chose (used to prefill activation).
 */
export type Intake = Partial<Record<IntakeChoiceKey, string> & Record<IntakeYesNoKey, boolean>> & {
  weight?: number;
  comments?: string;
  planId?: string;
  planName?: string;
  startDate?: string;
  payment?: string;
};

export type Member = {
  id: string;
  code: string;
  name: string;
  phone: string;
  color: string;
  joined: string;
  plan: string;
  planDays: number;
  planPrice: number;
  startDate: string;
  expiryDate: string;
  balance: number;
  suspended: boolean;
  emergency: string;
  dob: string;
  notes: string;
  email: string;
  gender: string;
  address: string;
  /** Added by owner/staff in the app, or registered themselves through the gym's form link. */
  source: "staff" | "form";
  /** No membership yet (registered through the form, not activated). */
  pending: boolean;
  intake: Intake;
  /** File in the private member-documents bucket ("" = none). Only the owner can open it. */
  aadhaarPath: string;
};

export type Payment = {
  id: string;
  memberId: string;
  memberName: string;
  paidAt: string;
  method: string;
  amount: number;
  status: "Paid" | "Partial";
  description: string;
  /** Owner/staff who entered it ("" if unknown) and when it was entered. */
  addedBy: string;
  addedAt: string;
};

/** One check-in. `by` is the name of the owner/staff who marked it ("" if unknown). */
export type AttendanceRecord = { id: string; memberId: string; memberName: string; at: string; by: string };

/** One membership period (first joining or a renewal). */
export type Renewal = {
  id: string;
  memberId: string;
  plan: string;
  startDate: string;
  expiryDate: string;
  price: number;
  createdAt: string;
};

/** `registrationToken` is "" while the public registration link is off. */
export type GymProfile = { name: string; address: string; phone: string; gstin: string; subscriptionPlan: string; subscriptionEndsOn: string; registrationToken: string };

export type Expense = { id: string; date: string; category: string; amount: number; method: string; note: string };

export type AppData = {
  gym: GymProfile;
  members: Member[];
  plans: Plan[];
  payments: Payment[];
  attendance: AttendanceRecord[];
  renewals: Renewal[];
  expenses: Expense[];
};

export const avatarColors = ["mint", "blue", "amber", "violet", "rose"];

export const paymentMethods = ["UPI", "Cash", "Card", "Bank transfer"];

export const expenseCategories = ["Rent", "Salaries", "Electricity & water", "Equipment", "Maintenance & cleaning", "Marketing", "Other"];

export const expenseMethods = ["Bank transfer", "UPI", "Cash", "Card"];

/** How many days of check-ins are loaded with the app (older months are summarised later). */
export const ATTENDANCE_DAYS_LOADED = 120;
