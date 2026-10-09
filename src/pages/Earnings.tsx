import { db } from "../data/db";
import { useConfirm } from "../components/Confirm";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Badge, Button } from "../components/ui";
import { type Expense, expenseCategories, expenseMethods } from "../data/types";
import { downloadCsv } from "../lib/download";
import { formatDate, formatMoney, formatShortMoney, parseMoney } from "../lib/format";
import { EARN_VIEWS, earningPeriods, type EarnPeriod, type EarnRow, type EarnView, fyLabel } from "../lib/periods";
import { useStore } from "../store/store";

export function Earnings() {
  const { data, today, reload } = useStore();
  const confirm = useConfirm();
  const [view, setView] = useState<EarnView>("month");
  const [showExpense, setShowExpense] = useState(false);
  const unit = EARN_VIEWS.find(([v]) => v === view)?.[2] ?? "month";
  const between = (value: string, p: EarnPeriod) => { const d = value.slice(0, 10); return d >= p.start && d <= p.end; };
  let rows: EarnRow[] = earningPeriods(view, today).map((p) => {
    const income = data.payments.filter((x) => between(x.paidAt, p)).reduce((s, x) => s + x.amount, 0);
    const expense = data.expenses.filter((x) => between(x.date, p)).reduce((s, x) => s + x.amount, 0);
    return { ...p, income, expense, profit: income - expense, current: p.start <= today && today <= p.end };
  });
  // Don't show empty periods from before the gym started using the app.
  while (rows.length > 1 && rows[0].income === 0 && rows[0].expense === 0) rows = rows.slice(1);
  const cur = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const margin = (r: EarnRow) => (r.income > 0 ? Math.round((r.profit / r.income) * 100) : null);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)));
  const signedShort = (n: number) => `${n < 0 ? "−" : ""}${formatShortMoney(Math.abs(n))}`;
  const curMargin = margin(cur);

  // Where the money goes: expenses by category in the current financial year.
  const fy = earningPeriods("year", today).slice(-1)[0];
  const fyExpenses = data.expenses.filter((x) => between(x.date, fy));
  const byCategory = new Map<string, number>();
  fyExpenses.forEach((x) => byCategory.set(x.category, (byCategory.get(x.category) ?? 0) + x.amount));
  const categoryRows = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  const categoryMax = Math.max(1, ...categoryRows.map(([, v]) => v));
  const categoryTotal = categoryRows.reduce((s, [, v]) => s + v, 0);
  const recent = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  const removeExpense = async (e: Expense) => {
    if (!(await confirm({ title: "Delete this expense?", message: `${e.category} · ${formatMoney(e.amount)} on ${formatDate(e.date)}`, confirmLabel: "Delete", danger: true, icon: "wallet" }))) return;
    try {
      await db.deleteExpense(e.id);
      await reload();
    } catch (err) {
      await confirm({ title: "Couldn’t delete the expense", message: (err as Error).message, alertOnly: true, danger: true, icon: "close" });
    }
  };
  const exportCsv = () => downloadCsv(`earnings-${view}-${today}.csv`, [["Period", "Income (INR)", "Expenses (INR)", "Profit (INR)", "Margin %"], ...[...rows].reverse().map((r) => [r.label + (r.current ? " (so far)" : ""), r.income, r.expense, r.profit, margin(r) ?? ""])]);

  return <div className="page">
    <PageHeader eyebrow="EARNINGS" title="Earnings & profit" subtitle="Money in, money out, and what the gym keeps." action={<Button icon="plus" onClick={() => setShowExpense(true)}>Add expense</Button>}/>
    <div className="earn-switch"><div className="filter-tabs period-tabs" role="tablist" aria-label="View">{EARN_VIEWS.map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</div><span>Quarters and years follow the financial year (April–March).</span></div>
    <div className="mini-stats earn-stats">
      <div><span>Income · this {unit} so far</span><strong>{formatMoney(cur.income)}</strong><small>{prev ? `Last ${unit}: ${formatMoney(prev.income)}` : "So far"}</small></div>
      <div><span>Expenses · this {unit} so far</span><strong>{formatMoney(cur.expense)}</strong><small>{prev ? `Last ${unit}: ${formatMoney(prev.expense)}` : "So far"}</small></div>
      <div><span>Profit · this {unit} so far</span><strong className={cur.profit >= 0 ? "green-text" : "danger-text"}>{cur.profit < 0 ? "−" : ""}{formatMoney(Math.abs(cur.profit))}</strong><small>{prev ? `Last ${unit}: ${prev.profit < 0 ? "−" : ""}${formatMoney(Math.abs(prev.profit))}` : "So far"}</small></div>
      <div><span>Profit margin</span><strong className={curMargin === null ? "" : curMargin >= 0 ? "green-text" : "danger-text"}>{curMargin === null ? "—" : `${curMargin}%`}</strong><small>of income kept as profit</small></div>
    </div>
    <section className="panel earn-panel">
      <div className="panel-head"><div><h2>Income vs expenses</h2><p>The number on top is the profit for that {unit}. The current {unit} is still in progress.</p></div><div className="legend"><span><i className="legend-dot primary"/>Income</span><span><i className="legend-dot expense"/>Expenses</span></div></div>
      <div className={`pl-chart ${rows.length > 8 ? "dense" : ""}`} aria-label="Income and expenses chart">{rows.map((r) => <div className={`pl-col ${r.current ? "current" : ""}`} key={r.key} title={`${r.label}\nIncome ${formatMoney(r.income)}\nExpenses ${formatMoney(r.expense)}\nProfit ${formatMoney(r.profit)}`}><em className={r.profit < 0 ? "danger-text" : "green-text"}>{r.income || r.expense ? signedShort(r.profit) : ""}</em><div className="pl-bars"><span className="pl-income" style={{height: `${r.income ? Math.max(3, (r.income / max) * 100) : 0}%`}}/><span className="pl-expense" style={{height: `${r.expense ? Math.max(3, (r.expense / max) * 100) : 0}%`}}/></div><small>{r.short}</small></div>)}</div>
    </section>
    <section className="panel table-panel earn-history">
      <div className="toolbar"><div><h2>History</h2><p className="toolbar-sub">Every {unit}, newest first</p></div><Button variant="secondary" icon="download" onClick={exportCsv}>Export</Button></div>
      <div className="pl-row pl-header"><span>Period</span><span>Income</span><span>Expenses</span><span>Profit</span><span>Margin</span><span>Profit vs before</span></div>
      {[...rows].reverse().map((r, i, list) => { const before = list[i + 1]; const change = before ? r.profit - before.profit : null; const mg = margin(r); return <div className="pl-row" key={r.key}><span><strong>{r.label}</strong>{r.current && <Badge tone="neutral">So far</Badge>}</span><span>{formatMoney(r.income)}</span><span>{formatMoney(r.expense)}</span><span><strong className={r.profit >= 0 ? "green-text" : "danger-text"}>{r.profit < 0 ? "−" : ""}{formatMoney(Math.abs(r.profit))}</strong></span><span>{mg === null ? "—" : `${mg}%`}</span><span>{change === null || r.current ? "—" : <span className={change >= 0 ? "positive" : "warning"}>{change >= 0 ? "↑" : "↓"} {formatMoney(Math.abs(change))}</span>}</span></div>; })}
    </section>
    <section className="insight-grid">
      <div className="panel insight-panel">
        <div className="panel-head"><div><h2>Where the money goes</h2><p>Expenses in {fyLabel(Number(fy.key))} · {formatMoney(categoryTotal)}</p></div></div>
        <div className="plan-split">{categoryRows.length === 0 && <small className="field-help">No expenses recorded this financial year.</small>}{categoryRows.map(([cat, total]) => <div className="plan-split-row category-row" key={cat}><span>{cat}</span><span className="plan-bar expense"><i style={{width: `${Math.max(4, Math.round((total / categoryMax) * 100))}%`}}/></span><strong>{formatMoney(total)}</strong><small>{Math.round((total / Math.max(1, categoryTotal)) * 100)}%</small></div>)}</div>
      </div>
      <div className="panel insight-panel">
        <div className="panel-head"><div><h2>Recent expenses</h2><p>Rent, salaries, bills and purchases</p></div><Button variant="secondary" icon="plus" onClick={() => setShowExpense(true)}>Add</Button></div>
        <div className="expense-list">{recent.length === 0 && <div className="search-empty"><p>No expenses yet. Add rent, salaries and bills to see your real profit.</p></div>}{recent.map((e) => <div className="history-row" key={e.id}><span className="history-icon expense"><Icon name="wallet" size={18}/></span><span><strong>{e.category}</strong><small>{formatDate(e.date)} · {e.method}{e.note ? ` · ${e.note}` : ""}</small></span><strong className="history-amount">{formatMoney(e.amount)}</strong><button className="icon-button" onClick={() => removeExpense(e)} aria-label={`Delete ${e.category} expense`} title="Delete"><Icon name="close" size={16}/></button></div>)}</div>
      </div>
    </section>
    {showExpense && <ExpenseModal onClose={() => setShowExpense(false)}/>}
  </div>;
}

export function ExpenseModal({ onClose }: { onClose: () => void }) {
  const { today, reload } = useStore();
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState(expenseCategories[0]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(expenseMethods[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseMoney(amount);
    if (!Number.isInteger(value) || value <= 0) return setError("Enter the amount in whole rupees, greater than ₹0.");
    if (!date || date > today) return setError("Expense date cannot be in the future.");
    setSaving(true);
    try {
      await db.addExpense({ date, category, amount: value, method, note: note.trim() });
      await reload();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return <Modal title="Add expense" subtitle="Record money the gym spent, so profit is accurate." onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <div className="form-row"><div className="field"><label htmlFor="exp-category">Category</label><select id="exp-category" value={category} onChange={(e) => setCategory(e.target.value)}>{expenseCategories.map((c) => <option key={c}>{c}</option>)}</select></div><div className="field"><label htmlFor="exp-amount">Amount <i>*</i></label><div className="money-input"><span>₹</span><input id="exp-amount" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} placeholder="0" autoFocus/></div></div></div>
      <div className="form-row"><div className="field"><label htmlFor="exp-date">Date</label><input id="exp-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)}/></div><div className="field"><label htmlFor="exp-method">Paid via</label><select id="exp-method" value={method} onChange={(e) => setMethod(e.target.value)}>{expenseMethods.map((m) => <option key={m}>{m}</option>)}</select></div></div>
      <div className="field"><label htmlFor="exp-note">Note <small>Optional</small></label><input id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. October rent"/></div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save expense"}</Button></div>
    </form>
  </Modal>;
}
