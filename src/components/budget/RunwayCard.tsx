"use client";

import { useMemo, useState } from "react";
import type { BudgetSettings, Expense, Income } from "@/lib/types";
import { cn, formatCAD, formatEUR } from "@/lib/utils";
import { formatDate, monthStartKey } from "@/lib/dates";
import { computeRunway } from "@/lib/runway";
import { Card, CardContent } from "@/components/ui/card";
import { Hourglass, Plus, ChevronDown, PiggyBank, TriangleAlert } from "lucide-react";

interface Props {
  settings: BudgetSettings;
  expenses: Expense[];
  incomes: Income[];
  today: string;
  departureDate: string | null;
  fallbackRate: number;
  chosenHousingMonthlyCad: number | null;
  onEditSavings: () => void;
  onAddIncome: () => void;
  onEditIncome: (income: Income) => void;
}

/** "Quanto vi dura": saldo stimato dei risparmi e mesi di autonomia al ritmo di spesa recente. */
export default function RunwayCard({
  settings, expenses, incomes, today, departureDate, fallbackRate, chosenHousingMonthlyCad,
  onEditSavings, onAddIncome, onEditIncome,
}: Props) {
  // chiusa: una riga sola (mesi di autonomia); aperta: dettagli, entrate e azioni
  const [open, setOpen] = useState(false);
  const currency = settings.savings_currency ?? "EUR";
  const fmt = currency === "EUR" ? formatEUR : formatCAD;
  const toCur = (amountCad: number, rate: number | null) =>
    currency === "EUR" ? Number(amountCad) / (Number(rate) || fallbackRate) : Number(amountCad);

  const runway = useMemo(() => {
    if (settings.savings_amount === null || settings.savings_amount === undefined || !settings.savings_date) return null;
    return computeRunway({
      savingsAmount: Number(settings.savings_amount),
      savingsCurrency: currency,
      savingsDate: settings.savings_date,
      expenses,
      incomes,
      today,
      departureDate,
      fallbackRate,
      chosenHousingMonthlyCad,
    });
  }, [settings, currency, expenses, incomes, today, departureDate, fallbackRate, chosenHousingMonthlyCad]);

  const monthStart = monthStartKey(today);
  const monthIncome = incomes.filter((n) => n.date >= monthStart && n.date <= today).reduce((s, n) => s + toCur(n.amount_cad, n.exchange_rate), 0);
  const recentIncomes = [...incomes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  if (!runway) {
    return (
      <Card className="border-dashed py-0">
        <CardContent className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maple-50 text-maple-500">
            <PiggyBank className="h-[18px] w-[18px]" />
          </div>
          <p className="min-w-0 flex-1 text-sm text-gray-600">
            Quanto vi durano i risparmi? Inserisci il saldo.
          </p>
          <button onClick={onEditSavings} className="shrink-0 rounded-lg bg-maple-50 px-3 py-2 text-sm font-medium text-maple-600 hover:bg-maple-100">
            Imposta
          </button>
        </CardContent>
      </Card>
    );
  }

  const months = runway.months;
  const tone = months === null ? "gray" : months < 3 ? "red" : months < 6 ? "amber" : "emerald";
  const actionCls = "inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors";

  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={open}>
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            tone === "red" ? "bg-red-50 text-red-500" : tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
          )}>
            <Hourglass className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500">
              Autonomia{" "}
              <span className="text-base font-semibold text-gray-900">
                {months === null ? "—" : months >= 24 ? "oltre 2 anni" : `≈ ${months.toLocaleString("it-IT", { maximumFractionDigits: 1 })} mesi`}
              </span>
            </p>
            {runway.untilDate && months !== null && months < 24 && (
              <p className="truncate text-xs text-gray-500">
                fino a {formatDate(runway.untilDate, { month: "long", year: "numeric" })}
                {runway.rentMissing && <span className="text-amber-600"> · senza affitto</span>}
              </p>
            )}
          </div>
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-gray-400 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="space-y-2.5 border-t border-gray-100 px-3 py-3">
            <div className="space-y-0.5 text-sm text-gray-600">
              <p>Saldo stimato <span className="font-medium text-gray-900">{fmt(runway.balance)}</span></p>
              <p>
                Spesa media <span className="font-medium text-gray-900">{fmt(runway.monthlyBurn)}</span>/mese
                <span className="text-xs text-gray-500"> (ultimi {runway.windowDays} giorni{runway.rentAdded > 0 && <> + affitto dell&apos;alloggio scelto</>})</span>
              </p>
              <p>
                Entrate di {formatDate(today, { month: "long" })}{" "}
                <span className={cn("font-medium", monthIncome > 0 ? "text-emerald-600" : "text-gray-900")}>{monthIncome > 0 ? `+${fmt(monthIncome)}` : fmt(0)}</span>
              </p>
            </div>
            {runway.rentMissing && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
                <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                Nel periodo non c&apos;è un affitto: la stima è ottimistica finché non scegli un alloggio.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={onAddIncome} className={actionCls}>
                <Plus className="h-4 w-4" />
                Entrata
              </button>
              <button onClick={onEditSavings} className={actionCls}>Aggiorna saldo</button>
            </div>
            {recentIncomes.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ultime entrate</p>
                {recentIncomes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onEditIncome(n)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0 truncate text-sm text-gray-700">
                      {n.description}
                      <span className="ml-1.5 text-xs text-gray-500">{formatDate(n.date, { day: "numeric", month: "short" })}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-emerald-600">+{fmt(toCur(n.amount_cad, n.exchange_rate))}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">
              Saldo inserito: {fmt(Number(settings.savings_amount))} al {formatDate(settings.savings_date!, { day: "numeric", month: "short" })}, poi si aggiorna da solo con spese ed entrate.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
