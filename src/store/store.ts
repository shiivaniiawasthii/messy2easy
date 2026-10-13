import { type Account } from "../lib/auth";
import { createContext, useContext } from "react";
import { type AppData } from "../data/types";
import { type PaymentState } from "../lib/members";
import { type RenewalTab } from "../navigation";

export type Store = {
  account: Account;
  signOut: () => void;
  data: AppData;
  today: string;
  /** Re-reads the gym data from the database (call after saving). */
  reload: () => Promise<void>;
  viewMember: (id: string) => void;
  viewPayments: (memberId: string) => void;
  editMember: (id: string) => void;
  openPayment: (memberId?: string) => void;
  openRenew: (memberId: string) => void;
  openRenewals: (tab: RenewalTab) => void;
  openPaymentsTab: (tab: "All" | PaymentState) => void;
  /** Owner only: Settings → Notifications. */
  openNotificationSettings: () => void;
};

export const StoreContext = createContext<Store | null>(null);

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreContext");
  return store;
}
