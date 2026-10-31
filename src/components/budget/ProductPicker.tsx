"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { productKey } from "@/lib/products";
import { Plus } from "lucide-react";

interface Props {
  value: string;
  /** prodotto dell'anagrafica collegato alla riga (null = testo libero, si risolve al salvataggio) */
  productId: string | null;
  products: Product[];
  categories: string[];
  inputClassName: string;
  /** proposte a campo vuoto (es. i prodotti comprati più spesso in questo negozio) */
  emptySuggestions?: Product[];
  inputRef?: (el: HTMLInputElement | null) => void;
  /** Invio sulla tastiera: si passa al campo successivo invece di inviare il modulo */
  onEnter?: () => void;
  onType: (name: string) => void;
  onPick: (product: Product) => void;
  onCreate: (name: string, category: string) => Promise<void>;
}

/**
 * Campo prodotto con l'anagrafica: mentre scrivi propone i prodotti già esistenti
 * (con la categoria); se non c'è, lo crei scegliendo la categoria, oppure lo lasci
 * scritto e la categoria la propone l'app al salvataggio. Così "latte 2% 2 l"
 * resta sempre lo stesso prodotto e il confronto tra negozi funziona.
 */
export default function ProductPicker({
  value, productId, products, categories, inputClassName, emptySuggestions = [], inputRef, onEnter, onType, onPick, onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [creating, setCreating] = useState(false);

  const q = productKey(value);
  const matches = q
    ? products
        .filter((p) => productKey(p.name).includes(q))
        .sort((a, b) => Number(!productKey(a.name).startsWith(q)) - Number(!productKey(b.name).startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, 6)
    : emptySuggestions.slice(0, 6);
  const exact = products.find((p) => productKey(p.name) === q);
  const linked = productId ? products.find((p) => p.id === productId) : null;

  // onPointerDown + preventDefault: la scelta avviene prima che il campo perda il focus
  const keep = (e: React.PointerEvent) => e.preventDefault();

  // chi usa il campo decide dove spostare il cursore dopo la scelta (quantità o prezzo)
  function pick(p: Product) {
    onPick(p);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        enterKeyHint="next"
        autoCapitalize="none"
        onChange={(e) => { onType(e.target.value); setOpen(true); setChoosingCategory(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setChoosingCategory(false); }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          // nome scritto uguale a un prodotto esistente: si collega a quello
          if (exact && exact.id !== productId) pick(exact);
          else { setOpen(false); onEnter?.(); }
        }}
        className={inputClassName}
        placeholder="Prodotto (es. latte 2% 2 l)"
        aria-label="Prodotto"
      />
      {linked && !open && (
        <span className="pointer-events-none absolute right-2 top-1/2 max-w-[45%] -translate-y-1/2 truncate rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
          {linked.category}
        </span>
      )}
      {open && (matches.length > 0 || (q && !exact)) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-gray-200">
          {!q && <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Comprati spesso qui</p>}
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onPointerDown={keep}
              onClick={() => pick(p)}
              className={cn("flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50", p.id === productId && "bg-maple-50")}
            >
              <span className="min-w-0 truncate text-gray-800">{p.name}</span>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{p.category}</span>
            </button>
          ))}
          {q && !exact && (
            <div className="border-t border-gray-100">
              {!choosingCategory ? (
                <button
                  type="button"
                  onPointerDown={keep}
                  onClick={() => setChoosingCategory(true)}
                  className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-sm font-medium text-maple-600 hover:bg-maple-50"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">Nuovo prodotto «{value.trim()}» con categoria</span>
                </button>
              ) : (
                <div className="space-y-1.5 px-3 py-2">
                  <p className="text-xs text-gray-500">Categoria di «{value.trim()}»:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={creating}
                        onPointerDown={keep}
                        onClick={async () => {
                          setCreating(true);
                          await onCreate(value.trim(), c);
                          setCreating(false);
                          setChoosingCategory(false);
                          setOpen(false);
                          onEnter?.();
                        }}
                        className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-maple-50 hover:text-maple-600 disabled:opacity-50"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="px-3 pb-2 text-[11px] text-gray-400">Oppure continua: la categoria la propone l&apos;app al salvataggio.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
