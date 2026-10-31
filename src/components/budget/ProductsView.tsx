"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemUnit, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { ITEM_UNITS, formatUnitPrice, productKey, storeKey, unitPrice, type BaseUnit } from "@/lib/products";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, Pencil, Search, ShoppingBasket, Trophy, TrendingDown, TrendingUp } from "lucide-react";
import ProductEditModal from "./ProductEditModal";

interface ItemRow {
  name: string;
  quantity: number;
  unit: ItemUnit;
  price_cad: number;
  product_id: string | null;
  expenses: { date: string; store: string | null; description: string } | null;
}

interface StoreStat {
  key: string;
  label: string;
  lastUnit: number;
  lastDate: string;
  minUnit: number;
  count: number;
}

interface Purchase {
  date: string;
  store: string;
  quantity: number;
  unit: ItemUnit;
  price: number;
  unitValue: number;
}

interface ProductGroup {
  key: string;
  productId: string | null;
  label: string;
  category: string;
  base: BaseUnit;
  count: number;
  lastDate: string;
  stores: StoreStat[]; // ordinati dal più conveniente (prezzo più recente)
  purchases: Purchase[]; // dal più recente
}

const NO_CATEGORY = "Senza categoria";

/**
 * Confronto prezzi: per ogni prodotto dell'anagrafica (+ stessa unità di misura)
 * il prezzo per kg / litro / pezzo nei diversi negozi, sull'ULTIMO prezzo visto in
 * ciascun negozio (i prezzi cambiano). Sezioni e filtro per categoria; dal dettaglio
 * si modifica il prodotto o lo si unisce a un doppione.
 */
export default function ProductsView() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ItemRow[] | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ product: Product; purchases: number } | null>(null);

  const load = useCallback(async () => {
    const [items, products, cats] = await Promise.all([
      supabase.from("expense_items").select("name, quantity, unit, price_cad, product_id, expenses(date, store, description)"),
      supabase.from("products").select("*").order("name"),
      supabase.from("lookup_values").select("value").eq("list_key", "product_category").order("position"),
    ]);
    if (items.error) { setFailed(true); return; }
    setRows((items.data ?? []) as unknown as ItemRow[]);
    setCatalog((products.data ?? []) as Product[]);
    setCategoryOrder((cats.data ?? []).map((c) => c.value as string));
  }, [supabase]);

  // i dati arrivano dopo l'await: nessun aggiornamento sincrono nell'effetto
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const map = new Map<string, ProductGroup & { storeMap: Map<string, StoreStat> }>();
    for (const r of rows ?? []) {
      if (!r.expenses) continue;
      const product = r.product_id ? byId.get(r.product_id) : undefined;
      const { value, base } = unitPrice(Number(r.price_cad), Number(r.quantity), r.unit);
      // stesso prodotto dell'anagrafica (o, per le righe vecchie, stesso nome) + stessa unità base
      const key = `${product ? product.id : `n:${productKey(r.name)}`}|${base}`;
      const date = r.expenses.date;
      const storeLabel = (r.expenses.store || r.expenses.description).trim();
      const sKey = storeKey(storeLabel) || "?";

      let g = map.get(key);
      if (!g) {
        g = {
          key, productId: product?.id ?? null, label: product?.name ?? r.name.trim(),
          category: product?.category ?? NO_CATEGORY, base, count: 0, lastDate: date, stores: [], purchases: [], storeMap: new Map(),
        };
        map.set(key, g);
      }
      g.count++;
      if (date > g.lastDate) g.lastDate = date;
      g.purchases.push({ date, store: storeLabel, quantity: Number(r.quantity), unit: r.unit, price: Number(r.price_cad), unitValue: value });

      const s = g.storeMap.get(sKey);
      if (!s) {
        g.storeMap.set(sKey, { key: sKey, label: storeLabel, lastUnit: value, lastDate: date, minUnit: value, count: 1 });
      } else {
        s.count++;
        s.minUnit = Math.min(s.minUnit, value);
        if (date >= s.lastDate) { s.lastDate = date; s.lastUnit = value; s.label = storeLabel; }
      }
    }
    return [...map.values()].map(({ storeMap, ...g }) => ({
      ...g,
      stores: [...storeMap.values()].sort((a, b) => a.lastUnit - b.lastUnit),
      purchases: g.purchases.sort((a, b) => b.date.localeCompare(a.date)),
    }));
  }, [rows, catalog]);

  // categorie nell'ordine della lista in Impostazioni; quelle sconosciute in fondo
  const orderOf = (c: string) => (categoryOrder.includes(c) ? categoryOrder.indexOf(c) : c === NO_CATEGORY ? 999 : 500);
  const presentCategories = [...new Set(groups.map((g) => g.category))].sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b));

  const q = query.trim().toLowerCase();
  const visible = groups.filter((g) => {
    if (category !== "all" && g.category !== category) return false;
    if (q && !g.label.toLowerCase().includes(q) && !g.stores.some((s) => s.label.toLowerCase().includes(q))) return false;
    return true;
  });
  const sections = presentCategories
    .map((c) => ({ category: c, items: visible.filter((g) => g.category === c).sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate)) }))
    .filter((s) => s.items.length > 0);
  const storeCount = new Set(groups.flatMap((g) => g.stores.map((s) => s.key))).size;

  if (failed) {
    return <p className="py-8 text-center text-sm text-gray-400">Impossibile caricare i prodotti, riprova.</p>;
  }
  if (rows === null) {
    return <p className="py-8 text-center text-sm text-gray-400">Caricamento prodotti...</p>;
  }
  if (groups.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
            <ShoppingBasket className="h-6 w-6" />
          </div>
          <p className="text-sm text-gray-500">Ancora nessun prodotto.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
            Quando registri una spesa, apri &quot;Prodotti&quot; e aggiungi gli articoli con quantità e prezzo:
            qui vedrai in quale negozio conviene comprare ciascuno.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un prodotto o un negozio..."
            className="block w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
          />
        </div>
        {presentCategories.length > 1 && (
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {["all", ...presentCategories].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  category === c ? "bg-maple-500 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
                )}
              >
                {c === "all" ? "Tutte" : c}
              </button>
            ))}
          </div>
        )}
        <p className="px-1 text-xs text-gray-500">
          {groups.length} {groups.length === 1 ? "prodotto" : "prodotti"} · {storeCount} {storeCount === 1 ? "negozio" : "negozi"} · prezzi al kg, al litro o al pezzo, sull&apos;ultimo acquisto in ogni negozio
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.category} className="space-y-1.5">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{section.category}</h3>
          {section.items.map((g) => {
            const best = g.stores[0];
            const worst = g.stores[g.stores.length - 1];
            const compared = g.stores.length > 1;
            const saving = compared && worst.lastUnit > 0 ? Math.round((1 - best.lastUnit / worst.lastUnit) * 100) : 0;
            const open = openKey === g.key;
            const product = g.productId ? catalog.find((p) => p.id === g.productId) : undefined;
            // andamento: ultimo acquisto rispetto a quello prima (qualsiasi negozio)
            const [lastBuy, prevBuy] = g.purchases;
            const trend = prevBuy && prevBuy.unitValue > 0 ? Math.round((lastBuy.unitValue / prevBuy.unitValue - 1) * 100) : 0;
            return (
              <Card key={g.key} className="py-0">
                <CardContent className="p-0">
                  <button
                    onClick={() => setOpenKey(open ? null : g.key)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    aria-expanded={open}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-gray-800">{g.label}</p>
                      <p className="truncate text-xs text-gray-500">
                        {compared ? (
                          <>
                            <span className="font-medium text-emerald-600">{best.label}</span>
                            {saving > 0 && <> · −{saving}% vs {worst.label}</>}
                          </>
                        ) : (
                          <>solo da {best.label} · {formatDate(best.lastDate, { day: "numeric", month: "short" })}</>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-semibold text-gray-900">{formatUnitPrice(best.lastUnit, g.base)}</p>
                      <p className="text-xs text-gray-500">{g.count} {g.count === 1 ? "acquisto" : "acquisti"}</p>
                    </div>
                    <ChevronDown className={cn("h-5 w-5 shrink-0 text-gray-400 transition-transform", open && "rotate-180")} />
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-gray-100 px-3 py-3">
                      {compared && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Confronto negozi</p>
                          {g.stores.map((s, i) => (
                            <div key={s.key} className="flex items-center gap-2 text-sm">
                              <span className="flex w-5 shrink-0 justify-center">
                                {i === 0 && <Trophy className="h-4 w-4 text-emerald-500" aria-label="Più conveniente" />}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-gray-700">{s.label}</span>
                              <span className="shrink-0 text-right">
                                <span className="font-medium text-gray-900">{formatUnitPrice(s.lastUnit, g.base)}</span>
                                <span className="block text-xs text-gray-500">
                                  {formatDate(s.lastDate, { day: "numeric", month: "short" })}
                                  {s.count > 1 && <> · {s.count} volte</>}
                                  {s.minUnit < s.lastUnit - 0.005 && <> · min {formatUnitPrice(s.minUnit, g.base)}</>}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {trend !== 0 && (
                        <p className={cn("flex items-center gap-1.5 text-sm", trend > 0 ? "text-red-600" : "text-emerald-600")}>
                          {trend > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          Ultimo prezzo {trend > 0 ? "+" : ""}{trend}% rispetto all&apos;acquisto prima
                        </p>
                      )}

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ultimi acquisti</p>
                        {g.purchases.slice(0, 6).map((pu, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-gray-700">
                              {formatDate(pu.date, { day: "numeric", month: "short" })} · {pu.store}
                              <span className="text-gray-500"> · {pu.quantity.toLocaleString("it-IT")} {ITEM_UNITS.find((u) => u.value === pu.unit)?.label ?? pu.unit}</span>
                            </span>
                            <span className="shrink-0 text-gray-900">{pu.price.toLocaleString("it-IT", { style: "currency", currency: "CAD" })}</span>
                          </div>
                        ))}
                      </div>

                      {product && (
                        <button
                          onClick={() => setEditing({ product, purchases: groups.filter((x) => x.productId === product.id).reduce((n, x) => n + x.count, 0) })}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                          Modifica o unisci prodotto
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
      {visible.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Nessun prodotto trovato.</p>}

      {editing && (
        <ProductEditModal
          product={editing.product}
          products={catalog}
          categories={categoryOrder}
          purchases={editing.purchases}
          onClose={() => setEditing(null)}
          onChanged={() => { setEditing(null); setOpenKey(null); load(); }}
        />
      )}
    </div>
  );
}
