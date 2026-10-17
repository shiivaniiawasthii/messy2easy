import { useState } from "react";
import { appLink } from "../lib/accounts";
import { formatMoney } from "../lib/format";
import { buildReport, downloadReport, REPORT_PERIODS, type ReportPeriod, reportShareText } from "../lib/report";
import { useStore } from "../store/store";
import { Button } from "./ui";

/** Owner's report: pick a period, see the key numbers, download Excel or share on WhatsApp (both free). */
export function ReportPanel() {
  const { data, today } = useStore();
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const report = buildReport(data, today, period);
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      await downloadReport(data, report);
    } catch {
      setError("Couldn’t make the Excel file. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const share = `https://wa.me/?text=${encodeURIComponent(reportShareText(data, report, appLink()))}`;
  const facts: [string, string, string?][] = [
    ["Collected", formatMoney(report.collected), report.byMethod.map(([m, v]) => `${m} ${formatMoney(v)}`).join(" · ")],
    ["Expenses", formatMoney(report.spent)],
    ["Profit", formatMoney(report.profit)],
    ["Check-ins", String(report.checkins.length)],
    ["New members", String(report.newMembers.length)],
    ["Renewals", String(report.renewals.length)],
    ["Pending dues now", formatMoney(report.duesTotal), `${report.dues.length} member${report.dues.length === 1 ? "" : "s"}`],
    ["Follow up", String(report.expiring.length + report.expired.length + report.inactive.length), "expiring, expired, stopped coming"],
  ];
  return <div className="report-panel">
    <div className="filter-tabs report-periods" role="tablist" aria-label="Report period">{REPORT_PERIODS.map(([id, label]) => <button key={id} role="tab" aria-selected={period === id} className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div>
    <p className="report-range">{report.range.label}</p>
    <div className="report-facts">{facts.map(([label, value, note]) => <div key={label}><span>{label}</span><strong className={label === "Profit" && report.profit < 0 ? "danger-text" : ""}>{value}</strong>{note && <small>{note}</small>}</div>)}</div>
    {error && <p className="form-error">{error}</p>}
    <div className="report-actions">
      <Button icon="download" onClick={download} disabled={busy}>{busy ? "Preparing…" : "Download Excel"}</Button>
      <a className="btn btn-secondary" href={share} target="_blank" rel="noopener noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z"/></svg><span>Share on WhatsApp</span></a>
    </div>
    <p className="field-help report-note">The Excel file has sheets for Summary, Payments, Check-ins, Expenses, Members and a Follow-up list. WhatsApp opens on your phone so you can send the summary to yourself or your partner. Both are free.</p>
  </div>;
}
