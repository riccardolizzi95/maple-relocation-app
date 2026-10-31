"use client";

import { useMemo } from "react";
import type { Expense, ExpenseCategory, Housing } from "@/lib/types";
import type { Money } from "@/lib/money";

const RECURRING_CATEGORIES: ExpenseCategory[] = ["cibo", "ristoranti", "casa", "trasporti", "telefono", "salute", "abbigliamento", "svago"];

interface Props {
  expenses: Expense[];
  departureDate: string | null;
  chosenHousing: Housing | null;
  money: Money;
}

export default function BudgetForecast({ expenses, departureDate, chosenHousing, money }: Props) {
  const fmt = (cad: number) => money.format(money.fromCad(cad));
  const cutoff = departureDate ?? "1970-01-01";

  const forecast = useMemo(() => {
    const arrivalExpenses = expenses.filter((e) => e.date >= cutoff);
    if (arrivalExpenses.length === 0) return null;

    const months = new Set(arrivalExpenses.map((e) => e.date.slice(0, 7)));
    const monthCount = months.size || 1;

    const recurringTotal = arrivalExpenses
      .filter((e) => RECURRING_CATEGORIES.includes(e.category))
      .reduce((sum, e) => sum + Number(e.amount_cad), 0);

    const recurringMonthly = recurringTotal / monthCount;

    const housingMonthly = chosenHousing?.price_cad ? Number(chosenHousing.price_cad) : 0;

    const housingFromExpenses = housingMonthly === 0
      ? arrivalExpenses
          .filter((e) => e.category === "alloggio")
          .reduce((sum, e) => sum + Number(e.amount_cad), 0) / monthCount
      : 0;

    const estimatedMonthly = recurringMonthly + (housingMonthly || housingFromExpenses);

    return {
      recurringMonthly,
      housingMonthly: housingMonthly || housingFromExpenses,
      housingSource: housingMonthly > 0 ? "alloggio scelto" : "media spese alloggio",
      estimatedMonthly,
      monthCount,
    };
  }, [expenses, cutoff, chosenHousing]);

  if (!forecast) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500">
          Servono spese post-partenza per calcolare una stima. Aggiungi qualche spesa dopo il trasferimento.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Stima spesa mensile futura</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Indicativa
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Spese ricorrenti</p>
          <p className="text-sm font-semibold text-gray-900">{fmt(forecast.recurringMonthly)}</p>
          <p className="text-[11px] text-gray-500">media delle spese di tutti i giorni (escluse burocrazia e altro)</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Alloggio</p>
          <p className="text-sm font-semibold text-gray-900">{fmt(forecast.housingMonthly)}</p>
          <p className="text-[11px] text-gray-500">da: {forecast.housingSource}</p>
        </div>
      </div>

      <div className="rounded-lg bg-maple-50 p-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Totale stimato/mese</span>
        <span className="text-lg font-semibold text-maple-600">{fmt(forecast.estimatedMonthly)}</span>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Stima basata sulla media di {forecast.monthCount} {forecast.monthCount === 1 ? "mese" : "mesi"} di dati reali.
        Non include spese una tantum (burocrazia, acquisti straordinari).
        Con più dati la stima diventerà più accurata.
      </p>
    </div>
  );
}
