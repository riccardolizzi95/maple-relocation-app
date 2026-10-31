"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Income } from "@/lib/types";
import { formatCAD, formatEUR } from "@/lib/utils";
import { todayKey } from "@/lib/dates";
import ModalShell from "@/components/ui/ModalShell";

interface Props {
  item: Income | null;
  fallbackRate: number;
  onClose: () => void;
  onSaved: (income: Income) => void;
  onDeleted: (id: string) => void;
}

/** Entrata (stipendio, rimborso...): come una spesa, ma aumenta il saldo dei risparmi. */
export default function IncomeModal({ item, fallbackRate, onClose, onSaved, onDeleted }: Props) {
  const isEditing = !!item;
  const [currency, setCurrency] = useState<"CAD" | "EUR">(item?.input_currency === "EUR" ? "EUR" : "CAD");
  const [amount, setAmount] = useState(() => {
    if (!item) return "";
    const v = item.input_currency === "EUR" ? Number(item.amount_cad) / (Number(item.exchange_rate) || fallbackRate) : Number(item.amount_cad);
    return v.toFixed(2);
  });
  const [description, setDescription] = useState(item?.description ?? "");
  const [date, setDate] = useState(item?.date ?? todayKey());
  const [rate, setRate] = useState(Number(item?.exchange_rate) || fallbackRate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // tasso BCE del giorno dell'entrata (come per le spese)
  useEffect(() => {
    if (!date || (isEditing && date === item?.date)) return;
    let alive = true;
    fetch(`/api/exchange-rate?date=${date}`)
      .then((r) => r.json())
      .then((json) => { if (alive && json.rate) setRate(json.rate); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [date, isEditing, item?.date]);

  const value = parseFloat(amount) || 0;
  const amountCad = currency === "CAD" ? value : value * rate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value <= 0) { setError("Inserisci un importo valido."); return; }
    setLoading(true);
    setError(null);
    const payload = {
      amount_cad: Math.round(amountCad * 100) / 100,
      description: description.trim(),
      date,
      exchange_rate: rate,
      input_currency: currency,
    };
    const query = isEditing
      ? supabase.from("incomes").update(payload).eq("id", item.id).select().single()
      : supabase.from("incomes").insert(payload).select().single();
    const { data, error } = await query;
    setLoading(false);
    if (error || !data) { setError(`Salvataggio non riuscito: ${error?.message ?? "riprova"}`); return; }
    onSaved(data as Income);
  }

  async function handleDelete() {
    if (!item || !confirm("Eliminare questa entrata?")) return;
    setLoading(true);
    const { error } = await supabase.from("incomes").delete().eq("id", item.id);
    setLoading(false);
    if (error) { setError(`Eliminazione non riuscita: ${error.message}`); return; }
    onDeleted(item.id);
  }

  const inputCls =
    "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div>
        {isEditing && (
          <button type="button" onClick={handleDelete} disabled={loading} className="text-sm font-medium text-red-500 hover:text-red-600 disabled:opacity-50">
            Elimina
          </button>
        )}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors">
          Annulla
        </button>
        <button type="submit" form="income-form" disabled={loading} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors">
          {loading ? "Salvataggio..." : isEditing ? "Salva" : "Aggiungi"}
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell title={isEditing ? "Modifica entrata" : "Nuova entrata"} onClose={onClose} footer={footer}>
      <form id="income-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-600">Importo *</label>
            <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs shadow-sm">
              {(["CAD", "EUR"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={currency === c ? "bg-maple-500 px-2.5 py-1 font-medium text-white" : "px-2.5 py-1 text-gray-500 hover:bg-gray-50"}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(",", "."))}
            className={inputCls}
            placeholder={currency === "CAD" ? "0.00 CAD" : "0.00 EUR"}
          />
          {value > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {currency === "CAD" ? `≈ ${formatEUR(value / rate)}` : `= ${formatCAD(amountCad)}`}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">Descrizione *</label>
          <input
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`mt-1.5 ${inputCls}`}
            placeholder="Stipendio, rimborso..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1.5 ${inputCls}`} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </form>
    </ModalShell>
  );
}
