import { useCallback, useEffect, useState } from "react";
import { loadAppData } from "./data/db";
import { type AppData } from "./data/types";
import { Icon } from "./components/Icon";
import { Button } from "./components/ui";
import { MobileNav } from "./layout/MobileNav";
import { Sidebar } from "./layout/Sidebar";
import { Topbar } from "./layout/Topbar";
import { todayISO } from "./lib/format";
import { type PaymentState } from "./lib/members";
import { RecordPaymentModal } from "./modals/RecordPaymentModal";
import { RenewModal } from "./modals/RenewModal";
import { type Account } from "./lib/auth";
import { canOpen, type RenewalTab, type Screen } from "./navigation";
import { Attendance } from "./pages/Attendance";
import { Dashboard } from "./pages/Dashboard";
import { Earnings } from "./pages/Earnings";
import { MemberForm } from "./pages/MemberForm";
import { MemberPayments } from "./pages/MemberPayments";
import { MemberProfile } from "./pages/MemberProfile";
import { defaultMemberView, Members, type MemberView } from "./pages/Members";
import { Payments } from "./pages/Payments";
import { Plans } from "./pages/Plans";
import { Renewals } from "./pages/Renewals";
import { Settings, type SettingsSection } from "./pages/Settings";
import { type Store, StoreContext } from "./store/store";

export default function App({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const [screen, setScreenState] = useState<Screen>("dashboard");
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberView, setMemberView] = useState<MemberView>(defaultMemberView);
  const [paymentModal, setPaymentModal] = useState<{ memberId?: string } | null>(null);
  const [renewMemberId, setRenewMemberId] = useState<string | null>(null);
  // Starting tab when a dashboard shortcut opens Renewals or Payments.
  const [renewalsTab, setRenewalsTab] = useState<RenewalTab>("expiring");
  const [paymentsTab, setPaymentsTab] = useState<"All" | PaymentState>("All");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("gym");
  const [pageKey, setPageKey] = useState(0);
  // Where the profile's back button returns to.
  const [profileFrom, setProfileFrom] = useState<Screen>("members");
  const today = todayISO();

  const reload = useCallback(async () => {
    try {
      setData(await loadAppData());
      setLoadError("");
    } catch {
      setLoadError("Couldn’t load your gym’s data. Check your internet connection.");
    }
  }, []);

  // Load on start, and refresh whenever the app comes back to the screen
  // (so changes made on other staff phones show up).
  useEffect(() => {
    void reload();
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const go = (s: Screen) => { setScreenState(s); window.scrollTo(0, 0); };
  const setScreen = (s: Screen) => { if (s === "member-form") setEditingMemberId(null); if (s === "settings") { setSettingsSection("gym"); setPageKey((k) => k + 1); } if (s === "renewals" || s === "payments") { setRenewalsTab("expiring"); setPaymentsTab("All"); setPageKey((k) => k + 1); } go(s); };
  if (!data) return <div className="app-loading"><span className="brand-mark">M</span>{loadError ? <><p>{loadError}</p><Button onClick={() => void reload()}>Try again</Button><Button variant="ghost" onClick={onSignOut}>Sign out</Button></> : <><Icon name="refresh" size={20}/><p>Loading your gym…</p></>}</div>;

  const store: Store = {
    account,
    signOut: onSignOut,
    data,
    today,
    reload,
    viewMember: (id) => {
      setSelectedMemberId(id);
      setProfileFrom((prev) => (screen === "profile" || screen === "member-form" ? prev : screen));
      go("profile");
    },
    viewPayments: (memberId) => { setSelectedMemberId(memberId); go("member-payments"); },
    editMember: (id) => { setEditingMemberId(id); go("member-form"); },
    openPayment: (memberId) => { setRenewMemberId(null); setPaymentModal({ memberId }); },
    openRenew: (memberId) => { setPaymentModal(null); setRenewMemberId(memberId); },
    openRenewals: (tab) => { setRenewalsTab(tab); setPageKey((k) => k + 1); go("renewals"); },
    openPaymentsTab: (tab) => { setPaymentsTab(tab); setPageKey((k) => k + 1); go("payments"); },
    openMembers: (view) => { setMemberQuery(""); setMemberView({ ...defaultMemberView, ...view }); go("members"); },
    openNotificationSettings: () => { setSettingsSection("notifications"); setPageKey((k) => k + 1); go("settings"); },
  };

  const render = () => {
    if (!canOpen(account.role, screen)) return <Dashboard setScreen={setScreen}/>;
    if (screen === "dashboard") return <Dashboard setScreen={setScreen}/>;
    if (screen === "members") return <Members setScreen={setScreen} query={memberQuery} setQuery={setMemberQuery} view={memberView} setView={setMemberView}/>;
    if (screen === "attendance") return <Attendance/>;
    if (screen === "payments") return <Payments key={pageKey} initialTab={paymentsTab}/>;
    if (screen === "renewals") return <Renewals key={pageKey} initialTab={renewalsTab}/>;
    if (screen === "plans") return <Plans/>;
    if (screen === "earnings") return <Earnings/>;
    if (screen === "profile") return <MemberProfile key={selectedMemberId ?? "none"} memberId={selectedMemberId} setScreen={setScreen} backTo={profileFrom}/>;
    if (screen === "member-payments") return <MemberPayments memberId={selectedMemberId} setScreen={setScreen}/>;
    if (screen === "member-form") return <MemberForm key={editingMemberId ?? "new"} editingId={editingMemberId} setScreen={setScreen}/>;
    return <Settings key={pageKey} initialSection={settingsSection}/>;
  };
  return <StoreContext.Provider value={store}>
    <div className="app-shell"><Sidebar screen={screen} setScreen={setScreen}/><div className="main-shell"><Topbar setScreen={setScreen} onSearch={(q) => { setMemberQuery(q); setMemberView(defaultMemberView); setScreen("members"); }}/><main>{render()}</main></div><MobileNav screen={screen} setScreen={setScreen}/></div>
    {paymentModal && <RecordPaymentModal initialMemberId={paymentModal.memberId} onClose={() => setPaymentModal(null)}/>}
    {renewMemberId && <RenewModal key={renewMemberId} memberId={renewMemberId} onClose={() => setRenewMemberId(null)}/>}
  </StoreContext.Provider>;
}
