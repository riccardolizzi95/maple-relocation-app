"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemUnit, Product } from "@/lib/types";
import { ITEM_UNITS, productKey } from "@/lib/products";
import ModalShell from "@/components/ui/ModalShell";

interface Props {
  product: Product;
  products: Product[];
  categories: string[];
  /** quanti acquisti usano questo prodotto (per il testo di conferma dell'unione) */
  purchases: number;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Gestione di un prodotto dell'anagrafica: rinomina, categoria, unità abituale,
 * e unione con un doppione (gli acquisti passano all'altro prodotto, questo sparisce).
 */
export default function ProductEditModal({ product, products, categories, purchases, onClose, onChanged }: Props) {
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [unit, setUnit] = useState<ItemUnit>(product.default_unit);
  const [mergeInto, setMergeInto] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // la categoria attuale resta tra le scelte anche se è stata tolta dalla lista in Impostazioni
  const categoryOptions = categories.includes(category) ? categories : [category, ...categories];
  const others = products
    .filter((p) => p.id !== product.id)
    .sort((a, b) => Number(a.category !== product.category) - Number(b.category !== product.category) || a.name.localeCompare(b.name));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("Il nome non può essere vuoto."); return; }
    const duplicate = products.find((p) => p.id !== product.id && productKey(p.name) === productKey(trimmed));
    if (duplicate) { setError(`Esiste già «${duplicate.name}»: usa "Unisci" qui sotto.`); return; }
    setLoading(true);
    setError(null);
    const { error: upErr } = await supabase
      .from("products")
      .update({ name: trimmed, category, default_unit: unit })
      .eq("id", product.id);
    // il nome è copiato anche sulle righe delle spese: si aggiorna insieme
    if (!upErr && trimmed !== product.name) {
      await supabase.from("expense_items").update({ name: trimmed }).eq("product_id", product.id);
    }
    setLoading(false);
    if (upErr) { setError(`Salvataggio non riuscito: ${upErr.message}`); return; }
    onChanged();
  }

  async function handleMerge() {
    const target = others.find((p) => p.id === mergeInto);
    if (!target) return;
    if (!confirm(`Unire «${product.name}» a «${target.name}»? ${purchases} ${purchases === 1 ? "acquisto passa" : "acquisti passano"} a «${target.name}» e «${product.name}» viene eliminato.`)) return;
    setLoading(true);
    setError(null);
    const { error: moveErr } = await supabase
      .from("expense_items")
      .update({ product_id: target.id, name: target.name })
      .eq("product_id", product.id);
    if (moveErr) {
      setLoading(false);
      setError(`Unione non riuscita: ${moveErr.message}`);
      return;
    }
    const { error: delErr } = await supabase.from("products").delete().eq("id", product.id);
    setLoading(false);
    if (delErr) { setError(`Acquisti spostati, ma il prodotto doppio non è stato eliminato: ${delErr.message}`); return; }
    onChanged();
  }

  const inputCls =
    "mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  const footer = (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors">
        Annulla
      </button>
      <button type="submit" form="product-form" disabled={loading} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors">
        {loading ? "Salvataggio..." : "Salva"}
      </button>
    </div>
  );

  return (
    <ModalShell title="Modifica prodotto" onClose={onClose} footer={footer}>
      <form id="product-form" onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600">Nome</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-600">Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">Unità abituale</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value as ItemUnit)} className={inputCls}>
              {ITEM_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>

        {others.length > 0 && (
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-sm text-gray-700">È un doppione?</p>
            <p className="text-xs text-gray-500">Unisci a un altro prodotto: gli acquisti passano a quello e questo sparisce.</p>
            <div className="mt-2 flex items-center gap-2">
              <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 shadow-sm focus:border-maple-400 focus:outline-none">
                <option value="">Scegli il prodotto giusto…</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.category}</option>)}
              </select>
              <button
                type="button"
                onClick={handleMerge}
                disabled={!mergeInto || loading}
                className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-maple-600 ring-1 ring-maple-200 hover:bg-maple-50 disabled:opacity-50"
              >
                Unisci
              </button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </form>
    </ModalShell>
  );
}
