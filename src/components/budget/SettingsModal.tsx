"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BudgetSettings, CategoryBudget, ExpenseCategory } from "@/lib/types";
import { cn, formatCAD } from "@/lib/utils";
import ModalShell from "@/components/ui/ModalShell";
import { EXPENSE_CATEGORIES } from "./categories";
import { todayKey } from "@/lib/dates";

interface Props {
  settings: BudgetSettings;
  categoryBudgets: CategoryBudget[];
  onClose: () => void;
  onSaved: (settings: BudgetSettings, categoryBudgets: CategoryBudget[]) => void;
  /** in cima: impostazioni di visualizzazione (valuta, budget del mese, tasso), fuori dal modulo condiviso */
  top?: React.ReactNode;
}

export default function SettingsModal({ settings, categoryBudgets, onClose, onSaved, top }: Props) {
  const [budget, setBudget] = useState(settings.monthly_budget_cad?.toString() ?? "");
  // limiti per categoria come stringhe: si parsano solo al salvataggio (regola campi importo)
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(categoryBudgets.map((b) => [b.category, b.amount_cad.toString()]))
  );
  // risparmi: saldo a una data (a fine giornata), poi l'app lo aggiorna con spese ed entrate
  const [savings, setSavings] = useState(settings.savings_amount?.toString() ?? "");
  const [savingsCurrency, setSavingsCurrency] = useState<"EUR" | "CAD">(settings.savings_currency ?? "EUR");
  const [savingsDate, setSavingsDate] = useState(settings.savings_date ?? todayKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // somma dei limiti mentre si scrive: se > 0 è lei il budget mensile (lib/budget.ts)
  const capsTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + (parseFloat(limits[c.value] ?? "") > 0 ? parseFloat(limits[c.value]) : 0), 0);
  const uncapped = EXPENSE_CATEGORIES.filter((c) => !(parseFloat(limits[c.value] ?? "") > 0)).map((c) => c.label);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // il tasso EUR→CAD non si imposta più a mano: lo aggiorna ogni giorno il cron dei tassi BCE
    const savingsValue = parseFloat(savings);
    const payload = {
      monthly_budget_cad: budget ? parseFloat(budget) : null,
      savings_amount: savings.trim() && savingsValue >= 0 ? savingsValue : null,
      savings_currency: savingsCurrency,
      savings_date: savings.trim() ? savingsDate : null,
      updated_at: new Date().toISOString(),
    };

    const toSave = EXPENSE_CATEGORIES.flatMap((c) => {
      const amount = parseFloat(limits[c.value] ?? "");
      return amount > 0 ? [{ category: c.value, amount_cad: amount, updated_at: new Date().toISOString() }] : [];
    });
    const toRemove = EXPENSE_CATEGORIES
      .map((c) => c.value)
      .filter((cat) => !toSave.some((s) => s.category === cat) && categoryBudgets.some((b) => b.category === cat));

    const [settingsRes, upsertRes, deleteRes] = await Promise.all([
      supabase.from("budget_settings").update(payload).eq("id", settings.id).select().single(),
      toSave.length
        ? supabase.from("category_budgets").upsert(toSave, { onConflict: "category" })
        : Promise.resolve({ error: null }),
      toRemove.length
        ? supabase.from("category_budgets").delete().in("category", toRemove)
        : Promise.resolve({ error: null }),
    ]);

    setLoading(false);
    const failed = settingsRes.error ?? upsertRes.error ?? deleteRes.error;
    if (failed || !settingsRes.data) {
      setError(`Salvataggio non riuscito: ${failed?.message ?? "riprova"}`);
      return;
    }
    onSaved(settingsRes.data as BudgetSettings, toSave as CategoryBudget[]);
  }

  const inputCls =
    "mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
      >
        Annulla
      </button>
      <button
        type="submit"
        form="budget-settings-form"
        disabled={loading}
        className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
      >
        {loading ? "Salvataggio..." : "Salva"}
      </button>
    </div>
  );

  return (
    <ModalShell title="Impostazioni Budget" onClose={onClose} footer={footer}>
      <form id="budget-settings-form" onSubmit={handleSubmit} className="space-y-4">
        {top}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-600">Risparmi disponibili</label>
            <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white text-sm shadow-sm">
              {(["EUR", "CAD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSavingsCurrency(c)}
                  className={savingsCurrency === c ? "bg-maple-500 px-3 py-1.5 font-medium text-white" : "px-3 py-1.5 text-gray-500 hover:bg-gray-50"}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={savings}
              onChange={(e) => setSavings(e.target.value.replace(",", "."))}
              className={cn(inputCls, "mt-0")}
              placeholder={savingsCurrency === "EUR" ? "20000 €" : "30000 $"}
              aria-label="Saldo dei risparmi"
            />
            <input
              type="date"
              value={savingsDate}
              onChange={(e) => setSavingsDate(e.target.value)}
              className={cn(inputCls, "mt-0")}
              aria-label="Data del saldo"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Il saldo a fine giornata di quella data (somma dei conti). Da lì l&apos;app toglie le spese e aggiunge le entrate: aggiornalo ogni tanto con il saldo vero.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600">Budget mensile (CAD)</label>
          {capsTotal > 0 ? (
            <>
              <p className="mt-1.5 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
                {formatCAD(capsTotal)}
                <span className="ml-1.5 text-xs font-normal text-gray-400">somma dei limiti qui sotto</span>
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Si aggiorna da solo quando cambi i limiti. Per usare un budget unico, svuota tutti i limiti.
              </p>
            </>
          ) : (
            <input
              type="text"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(",", "."))}
              className={inputCls}
              placeholder="3000"
            />
          )}
        </div>


        <div>
          <p className="text-sm font-medium text-gray-600">Limiti per categoria (CAD al mese)</p>
          <p className="mt-0.5 text-xs text-gray-400">Facoltativi: lascia vuoto per non avere un limite. Se ne imposti, il budget mensile diventa la loro somma.</p>
          <div className="mt-2 space-y-1.5">
            {EXPENSE_CATEGORIES.map((c) => (
              <div key={c.value} className="flex items-center gap-2.5">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", c.color)}>
                  <c.Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-sm text-gray-700">{c.label}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Limite ${c.label}`}
                  value={limits[c.value] ?? ""}
                  onChange={(e) =>
                    setLimits((prev) => ({ ...prev, [c.value as ExpenseCategory]: e.target.value.replace(",", ".") }))
                  }
                  className="w-24 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-right text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none"
                  placeholder="—"
                />
              </div>
            ))}
          </div>
          {capsTotal > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">Totale = budget mensile</span>
                <span className="font-semibold text-gray-900">{formatCAD(capsTotal)}</span>
              </div>
              {uncapped.length > 0 && (
                <p className="mt-0.5 text-xs text-gray-400">
                  Senza limite: {uncapped.join(", ")}. Le loro spese contano nel mese ma non aggiungono budget.
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}
      </form>
    </ModalShell>
  );
}
