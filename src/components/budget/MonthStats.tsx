"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { CategoryBudget, Expense } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Money } from "@/lib/money";
import { addMonthsKey, formatDate, monthStartKey } from "@/lib/dates";
import { TriangleAlert, CircleCheck } from "lucide-react";
import { CATEGORY_META } from "./categories";
import BarList from "./BarList";

// Una sola serie di dati → il rosso maple (validato); il ritmo del budget è un
// riferimento, quindi grigio e tratteggiato (il tratteggio qui significa "proiezione").
const SERIES = "#d01b26";
const REFERENCE = "#9ca3af";
const GRID = "#f3f4f6";
const AXIS_TICK = { fontSize: 11, fill: "#9ca3af" };

interface Props {
  expenses: Expense[];
  /** primo giorno del mese da analizzare (YYYY-MM-01) */
  monthStart: string;
  /** budget del mese in CAD (si converte nella valuta mostrata) */
  monthlyBudgetCad: number;
  categoryBudgets: CategoryBudget[];
  onEditLimits: () => void;
  today: string;
  money: Money;
}

export default function MonthStats({ expenses, monthStart, monthlyBudgetCad, categoryBudgets, onEditLimits, today, money }: Props) {
  const monthlyBudget = money.fromCad(monthlyBudgetCad);
  const nextMonth = addMonthsKey(monthStart, 1);
  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = monthStartKey(today) === monthStart;
  const isFuture = monthStart > today;
  // giorni trascorsi: nel mese in corso fino a oggi, nei mesi passati tutti
  const elapsed = isCurrent ? Number(today.slice(8, 10)) : isFuture ? 0 : daysInMonth;

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.date >= monthStart && e.date < nextMonth),
    [expenses, monthStart, nextMonth]
  );

  const total = monthExpenses.reduce((s, e) => s + money.of(e), 0);
  const perDay = elapsed > 0 ? total / elapsed : 0;
  const projection = isCurrent ? perDay * daysInMonth : total;

  const daily = useMemo(() => {
    const byDay = new Array(daysInMonth).fill(0) as number[];
    for (const e of monthExpenses) byDay[Number(e.date.slice(8, 10)) - 1] += money.of(e);
    const rows = [];
    let running = 0;
    for (let i = 0; i < byDay.length; i++) {
      const day = i + 1;
      running += byDay[i];
      rows.push({
        day,
        label: formatDate(`${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`, { day: "numeric", month: "short" }),
        amount: Math.round(byDay[i] * 100) / 100,
        // il cumulato si ferma a oggi: oltre non ci sono ancora dati
        cumulative: day <= elapsed ? Math.round(running * 100) / 100 : null,
        pace: monthlyBudget > 0 ? Math.round((monthlyBudget / daysInMonth) * day) : null,
      });
    }
    return rows;
  }, [monthExpenses, daysInMonth, elapsed, monthlyBudget, monthStart, money]);

  // categorie con spese nel mese + quelle con un limite (anche a zero: si vede quanto resta)
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of categoryBudgets) map.set(b.category, 0);
    for (const e of monthExpenses) map.set(e.category, (map.get(e.category) ?? 0) + money.of(e));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthExpenses, categoryBudgets, money]);
  const limitOf = (cat: string) => {
    const b = categoryBudgets.find((x) => x.category === cat);
    return b ? money.fromCad(Number(b.amount_cad)) : undefined;
  };

  // "dove": stessa descrizione = stesso posto/voce (supermercato, farmacia...)
  const topPlaces = useMemo(() => {
    const map = new Map<string, { label: string; total: number; count: number }>();
    for (const e of monthExpenses) {
      const label = e.description.trim();
      const key = label.toLowerCase();
      const cur = map.get(key) ?? { label, total: 0, count: 0 };
      cur.total += money.of(e);
      cur.count++;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [monthExpenses, money]);

  const monthLabel = formatDate(monthStart, { month: "long", year: "numeric" });
  const overBudget = monthlyBudget > 0 && projection > monthlyBudget;
  const chartDays = daily.slice(0, Math.max(elapsed, 1));

  if (monthExpenses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500">Nessuna spesa a {monthLabel}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{monthLabel}</h2>

      {/* Numeri chiave del mese: su mobile "Speso" a tutta larghezza e gli altri due affiancati
          (in tre colonne da ~85px i testi venivano tagliati) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile className="col-span-2 sm:col-span-1" label="Speso" value={money.format(total)} sub={`${monthExpenses.length} spese`} />
        <StatTile label="Al giorno" value={money.format(perDay)} sub={`media su ${elapsed} ${elapsed === 1 ? "giorno" : "giorni"}`} />
        {/* mese in corso: proiezione a fine mese; mesi passati: il budget (il totale è già in "Speso") */}
        <StatTile
          label={isCurrent ? "A fine mese" : "Budget"}
          value={isCurrent ? money.format(projection) : monthlyBudget > 0 ? money.format(monthlyBudget) : "—"}
          sub={
            monthlyBudget > 0 ? (
              <span className={cn("inline-flex items-center gap-1", overBudget ? "text-red-600" : "text-emerald-600")}>
                {overBudget ? <TriangleAlert className="h-3 w-3 shrink-0" /> : <CircleCheck className="h-3 w-3 shrink-0" />}
                {overBudget ? `oltre di ${money.format(projection - monthlyBudget)}` : "nel budget"}
              </span>
            ) : isCurrent ? "proiezione" : "nessun budget"
          }
        />
      </div>

      {/* Cumulato vs ritmo del budget */}
      <ChartCard
        title="Andamento del mese"
        legend={
          <>
            <LegendItem color={SERIES} label="Speso" />
            {monthlyBudget > 0 && <LegendItem color={REFERENCE} label={`Ritmo budget (${money.format(monthlyBudget)})`} dashed />}
          </>
        }
      >
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={compactCAD} />
            <Tooltip
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
              formatter={(value, name) => [money.format(Number(value)), name === "cumulative" ? "Speso" : "Ritmo budget"]}
            />
            {monthlyBudget > 0 && (
              <Line type="linear" dataKey="pace" stroke={REFERENCE} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
            )}
            <Line type="monotone" dataKey="cumulative" stroke={SERIES} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Giorno per giorno */}
      <ChartCard title="Giorno per giorno">
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={chartDays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={compactCAD} />
            <Tooltip
              cursor={{ fill: "#f9fafb" }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
              formatter={(value) => [money.format(Number(value)), "Speso"]}
            />
            <Bar dataKey="amount" fill={SERIES} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Per categoria */}
        <ChartCard
          title="Per categoria"
          legend={
            <button onClick={onEditLimits} className="text-xs font-medium text-maple-500 hover:text-maple-600">
              {categoryBudgets.length ? "Modifica limiti" : "Imposta limiti"}
            </button>
          }
        >
          <BarList
            rows={byCategory.map(([cat, value]) => {
              const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
              return { key: cat, label: meta?.label ?? cat, value, limit: limitOf(cat), Icon: meta?.Icon, iconClass: meta?.color };
            })}
            total={total}
            format={money.format}
          />
        </ChartCard>

        {/* Dove */}
        <ChartCard title="Dove spendete di più">
          <BarList
            rows={topPlaces.map((p) => ({
              key: p.label,
              label: p.label,
              value: p.total,
              note: p.count > 1 ? `${p.count} volte` : undefined,
            }))}
            total={total}
            format={money.format}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function compactCAD(v: number) {
  return v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`;
}

function StatTile({ label, value, sub, className }: { label: string; value: string; sub?: React.ReactNode; className?: string }) {
  // niente truncate: se lo spazio è poco il testo va a capo invece di sparire
  return (
    <div className={cn("min-w-0 rounded-xl bg-white px-3 py-2.5 ring-1 ring-foreground/10", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 break-words text-lg font-semibold leading-tight tracking-tight text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs leading-snug text-gray-500">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, legend, children }: { title: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-foreground/10">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {legend && <div className="flex flex-wrap items-center gap-3">{legend}</div>}
      </div>
      {children}
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <svg width="16" height="6" aria-hidden="true">
        <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
