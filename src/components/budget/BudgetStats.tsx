"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { CategoryBudget, Expense } from "@/lib/types";
import { formatCAD } from "@/lib/utils";
import type { Money } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { ChevronDown } from "lucide-react";
import { EXPENSE_CATEGORIES } from "./categories";
import MonthStats from "./MonthStats";
import BarList from "./BarList";

const CATEGORIES = EXPENSE_CATEGORIES;

interface Props {
  expenses: Expense[];
  departureDate: string | null;
  /** mese analizzato in alto (YYYY-MM-01) e il suo budget */
  monthStart: string;
  monthlyBudget: number;
  categoryBudgets: CategoryBudget[];
  onEditLimits: () => void;
  today: string;
  money: Money;
}

export default function BudgetStats({ expenses, departureDate, monthStart, monthlyBudget, categoryBudgets, onEditLimits, today, money }: Props) {
  const cutoff = departureDate ?? "1970-01-01";

  const arrivalExpenses = useMemo(
    () => expenses.filter((e) => e.date >= cutoff),
    [expenses, cutoff]
  );
  const preExpenses = useMemo(
    () => expenses.filter((e) => e.date < cutoff),
    [expenses, cutoff]
  );

  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};
    arrivalExpenses.forEach((e) => {
      const month = e.date.slice(0, 7);
      map[month] = (map[month] ?? 0) + money.of(e);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total: Math.round(total) }));
  }, [arrivalExpenses, money]);

  const categoryTotals = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      ...cat,
      total: arrivalExpenses
        .filter((e) => e.category === cat.value)
        .reduce((sum, e) => sum + money.of(e), 0),
    }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [arrivalExpenses, money]);

  const totalSinceArrival = arrivalExpenses.reduce((sum, e) => sum + money.of(e), 0);
  const totalPre = preExpenses.reduce((sum, e) => sum + money.of(e), 0);
  const monthCount = monthlyData.length || 1;
  const averageMonthly = totalSinceArrival / monthCount;

  return (
    <div className="space-y-6">
      <MonthStats
        expenses={expenses}
        monthStart={monthStart}
        monthlyBudgetCad={monthlyBudget}
        categoryBudgets={categoryBudgets}
        onEditLimits={onEditLimits}
        today={today}
        money={money}
      />

      {/* titolo + card insieme: con un margine negativo (-mb-3) le card finivano sopra il titolo */}
      <div className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Dall&apos;arrivo</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-3 text-center">
          <p className="text-xs text-gray-500">Totale dall&apos;arrivo</p>
          <p className="text-lg font-bold text-gray-900">{money.format(totalSinceArrival)}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-3 text-center">
          <p className="text-xs text-gray-500">Media mensile</p>
          <p className="text-lg font-bold text-gray-900">{money.format(averageMonthly)}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-3 text-center">
          <p className="text-xs text-gray-500">Mesi tracciati</p>
          <p className="text-lg font-bold text-gray-900">{monthCount}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-3 text-center">
          <p className="text-xs text-gray-500">Spese pre-partenza</p>
          <p className="text-lg font-bold text-gray-900">{money.format(totalPre)}</p>
        </div>
      </div>
      </div>

      {/* Monthly comparison chart */}
      {monthlyData.length > 1 && (
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Spese per mese</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData}>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [money.format(Number(value)), "Speso"]}
                labelFormatter={(label) => `Mese: ${label}`}
              />
              <Bar dataKey="total" fill="#d01b26" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category totals */}
      {categoryTotals.length > 0 && (
        <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Totale per categoria</h3>
          <BarList
            rows={categoryTotals.map((cat) => ({
              key: cat.value,
              label: cat.label,
              value: cat.total,
              Icon: cat.Icon,
              iconClass: cat.color,
            }))}
            total={totalSinceArrival}
            format={money.format}
          />
        </div>
      )}

      {/* Pre-departure expenses note */}
      {totalPre > 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">
            Le spese pre-partenza (prima del {formatDate(cutoff)})
            ammontano a <strong>{money.format(totalPre)}</strong> e sono escluse dalle statistiche principali.
          </p>
        </div>
      )}

      <RateHistory expenses={expenses} />
    </div>
  );
}

function RateHistory({ expenses }: { expenses: Expense[] }) {
  const [open, setOpen] = useState(false);

  const ratesByDate = useMemo(() => {
    const map = new Map<string, { rate: number; count: number; totalCad: number }>();
    expenses.forEach((e) => {
      if (!e.exchange_rate) return;
      const existing = map.get(e.date);
      if (existing) {
        existing.count++;
        existing.totalCad += Number(e.amount_cad);
      } else {
        map.set(e.date, { rate: e.exchange_rate, count: 1, totalCad: Number(e.amount_cad) });
      }
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a));
  }, [expenses]);

  if (ratesByDate.length === 0) return null;

  return (
    <div className="rounded-xl bg-white ring-1 ring-foreground/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4"
      >
        <h3 className="text-sm font-semibold text-gray-700">Storico tassi di cambio</h3>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-2 font-medium">Data</th>
                <th className="py-2 font-medium text-right">Tasso EUR/CAD</th>
                <th className="py-2 font-medium text-right">Spese</th>
                <th className="py-2 font-medium text-right">Totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ratesByDate.map(([date, info]) => (
                <tr key={date}>
                  <td className="py-1.5 text-gray-700">
                    {formatDate(date)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-gray-900">
                    {info.rate.toFixed(4)}
                  </td>
                  <td className="py-1.5 text-right text-gray-500">{info.count}</td>
                  <td className="py-1.5 text-right text-gray-700">{formatCAD(info.totalCad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
