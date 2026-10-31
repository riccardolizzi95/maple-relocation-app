"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal, flushSync } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseCategory } from "@/lib/types";
import { cn, formatCAD, formatEUR } from "@/lib/utils";
import { formatDate, parseDateKey, todayKey } from "@/lib/dates";
import ModalShell from "@/components/ui/ModalShell";
import { EXPENSE_CATEGORIES } from "./categories";
import { toast } from "@/components/ui/Toaster";
import { addPending, isNetworkError } from "@/lib/pending-expenses";
import { compressImage, openReceipt, removeReceipt, uploadReceipt } from "@/lib/receipts";
import { Camera, Eye, X, ShoppingBasket, Plus, ChevronDown, Trash2, CopyPlus, CircleCheck, TriangleAlert } from "lucide-react";
import { ITEM_UNITS, formatUnitPrice, productKey, storeKey, unitPrice } from "@/lib/products";
import type { ItemUnit, Product } from "@/lib/types";
import ProductPicker from "./ProductPicker";

const CATEGORIES = EXPENSE_CATEGORIES;

/** Descrizione già usata in passato, con la categoria dell'ultima volta. */
export interface ExpenseSuggestion {
  description: string;
  category: ExpenseCategory;
}

interface Props {
  item: Expense | null;
  /** "Duplica": precompila da questa spesa, ma salva come nuova con la data di oggi */
  template?: Expense | null;
  fallbackRate: number;
  suggestions?: ExpenseSuggestion[];
  /** negozi già usati, per scegliere sempre lo stesso nome */
  storeSuggestions?: string[];
  onClose: () => void;
  /** pending = salvata solo sul telefono (offline), da sincronizzare */
  onSaved: (expense: Expense, pending?: boolean) => void;
  /** solo in modifica: azioni che in lista sono anche negli swipe */
  onDuplicate?: () => void;
  onDelete?: () => void;
}

interface PastBuy {
  productId: string;
  quantity: number;
  unit: ItemUnit;
  price: number;
  store: string;
}
interface PastBuyRow {
  product_id: string;
  quantity: number;
  unit: ItemUnit;
  price_cad: number;
  expenses: { store: string | null; description: string; date: string } | null;
}

export default function ExpenseModal({ item, template = null, fallbackRate, suggestions = [], storeSuggestions = [], onClose, onSaved, onDuplicate, onDelete }: Props) {
  const isEditing = !!item;
  // sorgente dei valori iniziali: la spesa in modifica o quella da duplicare
  const src = item ?? template;
  const [amountCad, setAmountCad] = useState(src?.amount_cad?.toString() ?? "");
  // si riapre nella valuta in cui era stata inserita (conta per il riallineamento giornaliero dei tassi)
  const [inputMode, setInputMode] = useState<"cad" | "eur">(src?.input_currency === "EUR" ? "eur" : "cad");
  const [category, setCategory] = useState<ExpenseCategory>(src?.category ?? "altro");
  const [description, setDescription] = useState(src?.description ?? "");
  const [date, setDate] = useState(item?.date ?? todayKey());
  const [recurring, setRecurring] = useState(item?.recurring ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // la categoria si propone da sola dalla descrizione finché l'utente non la sceglie a mano
  const [categoryTouched, setCategoryTouched] = useState(!!src);
  const [rate, setRate] = useState(src?.exchange_rate ?? fallbackRate);
  const [rateSource, setRateSource] = useState<"bce" | "storico" | "fallback">(
    item?.exchange_rate ? "bce" : "fallback"
  );
  // giorno BCE del tasso applicato (nel weekend è il venerdì); null = tasso già salvato sulla spesa
  const [rateDay, setRateDay] = useState<string | null>(null);
  // data per cui il tasso è già stato caricato: "in caricamento" = la data è cambiata da allora
  const [rateDate, setRateDate] = useState<string | null>(item?.date ?? null);
  // in modifica il tasso si ricarica solo se cambi la data
  const keepsSavedRate = isEditing && date === item?.date;
  const rateFetching = !keepsSavedRate && !!date && rateDate !== date;
  const [amountEur, setAmountEur] = useState(
    src ? (Number(src.amount_cad) / (src.exchange_rate ?? fallbackRate)).toFixed(2) : ""
  );
  const supabase = createClient();

  // Prodotti (facoltativi): servono al confronto prezzi tra negozi
  // productId = prodotto dell'anagrafica (null = testo libero, collegato o creato al salvataggio)
  type DraftItem = { key: string; name: string; quantity: string; unit: ItemUnit; price: string; productId: string | null };
  const newRow = (): DraftItem => ({ key: crypto.randomUUID(), name: "", quantity: "1", unit: "pz", price: "", productId: null });
  const [itemsOpen, setItemsOpen] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [store, setStore] = useState(src?.store ?? "");
  // anagrafica prodotti e categorie (matchcode product_category), caricate all'apertura della sezione
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  // acquisti passati (più recenti prima): ultimo prezzo/quantità e prodotti frequenti per negozio
  const [history, setHistory] = useState<PastBuy[]>([]);
  // campi delle righe, per spostare il cursore con "Avanti" sulla tastiera
  const fields = useRef(new Map<string, { name?: HTMLInputElement | null; qty?: HTMLInputElement | null; price?: HTMLInputElement | null }>());
  const fieldRef = (key: string, field: "name" | "qty" | "price") => (el: HTMLInputElement | null) => {
    fields.current.set(key, { ...fields.current.get(key), [field]: el });
  };
  function focusField(key: string, field: "name" | "qty" | "price") {
    const el = fields.current.get(key)?.[field];
    el?.focus();
    if (field !== "name") el?.select();
  }

  function loadCatalog() {
    if (catalogLoaded) return;
    setCatalogLoaded(true);
    supabase.from("products").select("*").order("name").then(({ data }) => setCatalog((data ?? []) as Product[]));
    supabase
      .from("expense_items")
      .select("product_id, quantity, unit, price_cad, expenses(store, description, date)")
      .not("product_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data }) => setHistory(((data ?? []) as unknown as PastBuyRow[]).flatMap((r) => r.expenses ? [{
        productId: r.product_id,
        quantity: Number(r.quantity),
        unit: r.unit,
        price: Number(r.price_cad),
        store: storeKey((r.expenses.store || r.expenses.description).trim()),
      }] : [])));
    supabase
      .from("lookup_values")
      .select("value")
      .eq("list_key", "product_category")
      .order("position")
      .then(({ data }) => setProductCategories((data ?? []).map((r) => r.value)));
  }

  // in modifica: carica i prodotti già salvati (e apre la sezione se ce ne sono)
  useEffect(() => {
    if (!item) return;
    supabase
      .from("expense_items")
      .select("name, quantity, unit, price_cad, product_id")
      .eq("expense_id", item.id)
      .order("created_at")
      .then(({ data }) => {
        if (!data?.length) return;
        setItems(withEmptyRow(data.map((r) => ({
          key: crypto.randomUUID(),
          name: r.name,
          quantity: String(r.quantity),
          unit: r.unit as ItemUnit,
          price: String(r.price_cad),
          productId: r.product_id,
        }))));
        setItemsOpen(true);
        loadCatalog();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo all'apertura del modal
  }, []);

  /** In fondo c'è sempre una riga vuota: si scrive il prodotto successivo senza toccare "Aggiungi". */
  function withEmptyRow(list: DraftItem[]): DraftItem[] {
    const last = list[list.length - 1];
    return !last || last.name.trim() || last.price.trim() ? [...list, newRow()] : list;
  }

  function openItems() {
    setItemsOpen(true);
    if (!store.trim()) setStore(description.trim());
    setItems((prev) => withEmptyRow(prev));
    loadCatalog();
  }

  const shopKey = storeKey(store.trim());
  /** ultimo acquisto del prodotto: nello stesso negozio se c'è, altrimenti ovunque */
  function lastBuy(productId: string) {
    return history.find((h) => h.productId === productId && h.store === shopKey) ?? history.find((h) => h.productId === productId);
  }
  // prodotti comprati più spesso in questo negozio (o in generale), non ancora in lista
  const inList = new Set(items.map((r) => r.productId).filter(Boolean));
  const frequent = (() => {
    const counts = new Map<string, number>();
    for (const h of history) {
      if (shopKey && h.store !== shopKey) continue;
      counts.set(h.productId, (counts.get(h.productId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => catalog.find((p) => p.id === id))
      .filter((p): p is Product => !!p && !inList.has(p.id));
  })();

  /** Prodotto scelto (dal menu o da "comprati spesso"): unità e quantità dell'ultima volta, poi il cursore va dove serve. */
  function applyProduct(key: string, prod: Product) {
    const last = lastBuy(prod.id);
    const unit = last?.unit ?? prod.default_unit;
    const weighed = unit === "kg" || unit === "g";
    // a peso la quantità cambia ogni volta: resta da scrivere
    const quantity = weighed ? "" : String(last?.quantity ?? 1);
    flushSync(() => {
      setItems((prev) => withEmptyRow(prev.map((r) => (r.key === key ? { ...r, name: prod.name, productId: prod.id, unit, quantity } : r))));
    });
    focusField(key, weighed ? "qty" : "price");
  }

  function addFrequent(prod: Product) {
    const target = items.find((r) => !r.name.trim() && !r.price.trim()) ?? newRow();
    if (!items.includes(target)) flushSync(() => setItems((prev) => [...prev, target]));
    applyProduct(target.key, prod);
  }

  /** "Avanti" dal prezzo: al nome della riga successiva (che esiste sempre). */
  function nextRow(key: string) {
    const idx = items.findIndex((r) => r.key === key);
    let next = items[idx + 1];
    if (!next) {
      next = newRow();
      flushSync(() => setItems((prev) => [...prev, next!]));
    }
    focusField(next.key, "name");
  }

  /** Crea il prodotto in anagrafica (se esiste già con quel nome, restituisce quello). */
  async function createProduct(name: string, category: string, unit: ItemUnit): Promise<Product | null> {
    const { data, error } = await supabase.from("products").insert({ name, category, default_unit: unit }).select().single();
    if (data) {
      setCatalog((prev) => [...prev, data as Product].sort((a, b) => a.name.localeCompare(b.name)));
      return data as Product;
    }
    if (error?.code === "23505") {
      // confronto in JS: con ilike "%" nel nome ("latte 2%") farebbe da jolly
      const { data: all } = await supabase.from("products").select("*");
      return ((all ?? []) as Product[]).find((p) => productKey(p.name) === productKey(name)) ?? null;
    }
    return null;
  }


  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => withEmptyRow(prev.map((r) => (r.key === key ? { ...r, ...patch } : r))));
  }

  const validItems = items
    .map((r) => ({ name: r.name.trim(), quantity: parseFloat(r.quantity), unit: r.unit, price_cad: parseFloat(r.price), productId: r.productId }))
    .filter((r) => r.name && r.quantity > 0 && r.price_cad >= 0 && !Number.isNaN(r.price_cad));
  const itemsTotal = validItems.reduce((s, r) => s + r.price_cad, 0);

  async function saveItems(expenseId: string) {
    if (!itemsOpen) return;
    if (isEditing) await supabase.from("expense_items").delete().eq("expense_id", expenseId);
    if (validItems.length) {
      // prodotti nuovi scritti senza scegliere la categoria: la propone l'AI (poi si cambia da "Modifica prodotto")
      const toClassify = validItems
        .filter((r) => !r.productId && !catalog.some((p) => productKey(p.name) === productKey(r.name)))
        .map((r) => r.name);
      let guessed: Record<string, string> = {};
      if (toClassify.length) {
        guessed = await fetch("/api/products/categorize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ names: toClassify }),
        })
          .then((res) => (res.ok ? res.json() : { categories: {} }))
          .then((json) => json.categories ?? {})
          .catch(() => ({}));
      }

      // ogni riga va collegata a un prodotto dell'anagrafica: scelto, già esistente con quel nome, o nuovo
      const rows = [];
      for (const r of validItems) {
        let productId = r.productId;
        let name = r.name;
        if (!productId) {
          const existing = catalog.find((p) => productKey(p.name) === productKey(r.name));
          const product = existing ?? (await createProduct(r.name, guessed[r.name] ?? "Altro", r.unit));
          productId = product?.id ?? null;
          if (product) name = product.name;
        }
        rows.push({ expense_id: expenseId, name, quantity: r.quantity, unit: r.unit, price_cad: r.price_cad, product_id: productId });
      }
      const { error } = await supabase.from("expense_items").insert(rows);
      if (error) toast(`Spesa salvata, ma i prodotti no: ${error.message}`, "error");
    }
  }

  // Scontrino: nuova foto (già compressa) e/o rimozione di quella salvata
  const [receiptFile, setReceiptFile] = useState<Blob | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const existingReceipt = removeExistingReceipt ? null : item?.receipt_path ?? null;

  async function handleReceiptPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riscegliere lo stesso file
    if (!file) return;
    setReceiptBusy(true);
    const blob = await compressImage(file);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(blob);
    setReceiptPreview(blob.type.startsWith("image/") ? URL.createObjectURL(blob) : null);
    setReceiptBusy(false);
  }

  // scontrino a tutto schermo (anche mentre si scrivono i prodotti); pinch per ingrandire
  const [viewer, setViewer] = useState<string | null>(null);
  const canViewReceipt = !!receiptPreview || !!existingReceipt;
  async function viewReceipt() {
    if (receiptPreview) { setViewer(receiptPreview); return; }
    if (!existingReceipt) return;
    if (existingReceipt.endsWith(".pdf")) {
      if (!(await openReceipt(existingReceipt))) toast("Impossibile aprire lo scontrino.", "error");
      return;
    }
    const json = await fetch(`/api/document-url?path=${encodeURIComponent(existingReceipt)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (json?.url) setViewer(json.url);
    else toast("Impossibile aprire lo scontrino.", "error");
  }

  function clearReceipt() {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(null);
    setReceiptPreview(null);
    if (item?.receipt_path) setRemoveExistingReceipt(true);
  }

  // Snapshot degli importi correnti: la callback del tasso NON deve dipendere
  // dagli importi, altrimenti si riattiva a ogni tasto e riscrive il campo
  // mentre l'utente digita (bug del ",00" che bloccava l'inserimento in EUR)
  const amountsRef = useRef({ cad: amountCad, eur: amountEur, mode: inputMode });
  useEffect(() => {
    amountsRef.current = { cad: amountCad, eur: amountEur, mode: inputMode };
  }, [amountCad, amountEur, inputMode]);

  useEffect(() => {
    if (!date || keepsSavedRate) return;
    let alive = true; // se la data cambia di nuovo, la risposta vecchia si scarta
    fetch(`/api/exchange-rate?date=${date}`)
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        setRate(json.rate);
        setRateSource(json.source);
        setRateDay(json.date ?? null);
        // ricalcola solo il campo derivato, mai quello che l'utente sta scrivendo
        const { cad, eur, mode } = amountsRef.current;
        if (mode === "cad" && cad) {
          setAmountEur((parseFloat(cad) / json.rate).toFixed(2));
        } else if (mode === "eur" && eur) {
          setAmountCad((parseFloat(eur) * json.rate).toFixed(2));
        }
      })
      .catch(() => {
        if (!alive) return;
        setRate(fallbackRate);
        setRateSource("fallback");
        setRateDay(null);
      })
      .finally(() => {
        if (alive) setRateDate(date);
      });
    return () => { alive = false; };
  }, [date, keepsSavedRate, fallbackRate]);

  function handleCadChange(raw: string) {
    const val = raw.replace(",", ".");
    setAmountCad(val);
    if (val) setAmountEur((parseFloat(val) / rate).toFixed(2));
    else setAmountEur("");
  }

  function handleEurChange(raw: string) {
    const val = raw.replace(",", ".");
    setAmountEur(val);
    if (val) setAmountCad((parseFloat(val) * rate).toFixed(2));
    else setAmountCad("");
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    if (categoryTouched) return;
    const known = suggestions.find((s) => s.description.toLowerCase() === value.trim().toLowerCase());
    if (known) setCategory(known.category);
  }

  function pickSuggestion(s: ExpenseSuggestion) {
    setDescription(s.description);
    if (!categoryTouched) setCategory(s.category);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(amountCad);
    if (!amount || amount <= 0) {
      setError("Inserisci un importo valido.");
      return;
    }
    setLoading(true);
    setError(null);

    const payload = {
      amount_cad: amount,
      category,
      description: description.trim(),
      date,
      exchange_rate: rate,
      recurring,
      input_currency: inputMode === "eur" ? "EUR" : "CAD",
      // il negozio conta solo se si usano i prodotti; altrimenti resta quello che c'era
      store: itemsOpen ? store.trim() || null : src?.store ?? null,
    };

    if (isEditing) {
      let receipt_path = existingReceipt;
      if (receiptFile) {
        const up = await uploadReceipt(supabase, item.id, receiptFile);
        if (!up.path) {
          setError(isNetworkError(up.error) ? "Sei offline: riprova quando torna la rete." : `Caricamento scontrino non riuscito: ${up.error?.message}`);
          setLoading(false);
          return;
        }
        receipt_path = up.path;
      }
      const { data, error } = await supabase
        .from("expenses")
        .update({ ...payload, receipt_path })
        .eq("id", item.id)
        .select()
        .single();
      if (!error && data) {
        // la foto sostituita o tolta non serve più
        if (item.receipt_path && item.receipt_path !== receipt_path) removeReceipt(supabase, item.receipt_path);
        await saveItems(item.id);
        onSaved(data as Expense);
      } else {
        if (receiptFile && receipt_path) removeReceipt(supabase, receipt_path);
        setError(isNetworkError(error) ? "Sei offline: riprova quando torna la rete." : `Salvataggio non riuscito: ${error?.message ?? "errore sconosciuto"}`);
      }
    } else {
      // id generato qui: se la rete cade, la stessa spesa può essere reinviata senza doppioni
      const id = crypto.randomUUID();
      let receipt_path: string | null = null;
      let receiptLost = false;
      if (receiptFile) {
        const up = await uploadReceipt(supabase, id, receiptFile);
        if (up.path) receipt_path = up.path;
        else if (isNetworkError(up.error)) receiptLost = true; // offline: la spesa parte comunque
        else {
          setError(`Caricamento scontrino non riuscito: ${up.error?.message}`);
          setLoading(false);
          return;
        }
      }
      let { data, error } = await supabase
        .from("expenses")
        .insert({ ...payload, id, receipt_path })
        .select()
        .single();
      if (error?.code === "23505") {
        // id già presente: il primo invio era arrivato ma la risposta si era persa
        ({ data, error } = await supabase.from("expenses").select().eq("id", id).single());
      }
      if (!error && data) {
        await saveItems(id);
        onSaved(data as Expense);
      } else if (isNetworkError(error)) {
        const offline = {
          ...payload,
          id,
          receipt_path: null,
          created_by: null,
          created_at: new Date().toISOString(),
          recurring_of: null,
        } as Expense;
        addPending(offline);
        const missing = [receiptFile || receiptLost ? "scontrino" : null, validItems.length ? "prodotti" : null].filter(Boolean);
        toast(
          missing.length
            ? `Sei offline: spesa salvata sul telefono (senza ${missing.join(" e ")}, aggiungili dopo). La invio appena torna la rete.`
            : "Sei offline: spesa salvata sul telefono, la invio appena torna la rete.",
          "offline"
        );
        onSaved(offline, true);
      } else {
        if (receipt_path) removeReceipt(supabase, receipt_path);
        setError(`Salvataggio non riuscito: ${error?.message ?? "errore sconosciuto"}`);
      }
    }

    setLoading(false);
  }

  const q = description.trim().toLowerCase();
  const suggestionChips = isEditing
    ? []
    : suggestions
        .filter((s) => {
          const d = s.description.toLowerCase();
          return d !== q && (!q || d.includes(q));
        })
        .slice(0, 4);

  const cadNum = parseFloat(amountCad) || 0;

  const inputCls =
    "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  const footer = (
    <div className="flex items-center justify-end gap-2">
      {isEditing && (onDelete || onDuplicate) && (
        <div className="mr-auto flex items-center gap-1">
          {onDelete && (
            <button
              type="button"
              onClick={() => { if (confirm("Eliminare questa spesa?")) onDelete(); }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden min-[400px]:inline">Elimina</span>
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <CopyPlus className="h-4 w-4" />
              <span className="hidden min-[400px]:inline">Duplica</span>
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
      >
        Annulla
      </button>
      <button
        type="submit"
        form="expense-form"
        disabled={loading || receiptBusy}
        className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
      >
        {loading ? "Salvataggio..." : isEditing ? "Salva" : "Aggiungi"}
      </button>
    </div>
  );

  return (
    <ModalShell
      title={isEditing ? "Modifica spesa" : template ? "Duplica spesa" : "Nuova spesa"}
      onClose={onClose}
      footer={footer}
    >
        <form id="expense-form" onSubmit={handleSubmit} className="min-w-0 space-y-4">
          {/* Amount with toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-600">Importo *</label>
              <div className="flex rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setInputMode("cad")}
                  className={inputMode === "cad" ? "bg-maple-500 text-white px-3.5 py-1.5 font-medium" : "text-gray-500 px-3.5 py-1.5 hover:bg-gray-50"}
                >
                  CAD
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("eur")}
                  className={inputMode === "eur" ? "bg-maple-500 text-white px-3.5 py-1.5 font-medium" : "text-gray-500 px-3.5 py-1.5 hover:bg-gray-50"}
                >
                  EUR
                </button>
              </div>
            </div>
            {inputMode === "cad" ? (
              <div>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={amountCad}
                  onChange={(e) => handleCadChange(e.target.value)}
                  className={inputCls}
                  placeholder="0.00 CAD"
                />
                {cadNum > 0 && (
                  <p className="mt-1 text-xs text-gray-400">≈ {formatEUR(cadNum / rate)}</p>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={amountEur}
                  onChange={(e) => handleEurChange(e.target.value)}
                  className={inputCls}
                  placeholder="0.00 EUR"
                />
                {cadNum > 0 && (
                  <p className="mt-1 text-xs text-gray-400">= {formatCAD(cadNum)}</p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600">Descrizione *</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              className={`mt-1.5 ${inputCls}`}
              placeholder="Spesa al supermercato, metro pass..."
            />
            {suggestionChips.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestionChips.map((s) => (
                  <button
                    key={s.description}
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 hover:bg-maple-50 hover:text-maple-600 transition-colors"
                  >
                    {s.description}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600">Categoria</label>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value as ExpenseCategory); setCategoryTouched(true); }}
                className={`mt-1.5 ${inputCls}`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`mt-1.5 ${inputCls}`}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-maple-500 focus:ring-maple-400"
            />
            <span className="text-sm text-gray-700">
              Spesa ricorrente
              <span className="block text-xs text-gray-500">Si ripete automaticamente il 1° di ogni mese (affitto, abbonamenti...)</span>
            </span>
          </label>

          {/* Scontrino (prima dei prodotti: si guarda mentre li si scrive) */}
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={viewReceipt}
                disabled={!canViewReceipt}
                className="shrink-0"
                aria-label="Vedi lo scontrino a tutto schermo"
              >
                {receiptPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- anteprima locale (blob:), niente ottimizzazione
                  <img src={receiptPreview} alt="" className="h-14 w-14 rounded-md object-cover ring-1 ring-gray-200" />
                ) : (
                  <span className={cn("flex h-14 w-14 items-center justify-center rounded-md bg-white ring-1 ring-gray-200", existingReceipt ? "text-maple-500" : "text-gray-300")}>
                    {existingReceipt ? <Eye className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                  </span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700">Scontrino</p>
                <p className="text-xs text-gray-500">
                  {receiptBusy
                    ? "Preparo la foto..."
                    : receiptFile
                      ? "Pronto: si carica al salvataggio"
                      : existingReceipt
                        ? "Allegato: tocca per vederlo"
                        : "Facoltativo: foto o PDF"}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-maple-600 ring-1 ring-gray-200 hover:bg-maple-50">
                <Camera className="h-4 w-4" />
                {receiptFile || existingReceipt ? "Cambia foto" : "Aggiungi foto"}
                <input type="file" accept="image/*,application/pdf" onChange={handleReceiptPick} className="hidden" />
              </label>
              {canViewReceipt && (
                <button
                  type="button"
                  onClick={viewReceipt}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                >
                  <Eye className="h-4 w-4" />
                  Vedi
                </button>
              )}
              {(receiptFile || existingReceipt) && (
                <button
                  type="button"
                  onClick={clearReceipt}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                  Togli
                </button>
              )}
            </div>
          </div>

          {/* Prodotti (facoltativi): "Avanti" sulla tastiera passa nome → quantità → prezzo → prodotto dopo */}
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            {!itemsOpen ? (
              <button type="button" onClick={openItems} className="flex w-full items-center gap-2.5 py-0.5 text-left">
                <ShoppingBasket className="h-5 w-5 shrink-0 text-gray-400" />
                <span className="flex-1 text-sm font-medium text-gray-700">
                  Aggiungi i prodotti
                  <span className="block text-xs font-normal text-gray-500">Facoltativo: per confrontare i prezzi tra negozi</span>
                </span>
                <ChevronDown className="h-5 w-5 text-gray-400" />
              </button>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-700">Prodotti</p>
                  {canViewReceipt && (
                    <button
                      type="button"
                      onClick={viewReceipt}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-maple-600 hover:bg-white"
                    >
                      <Eye className="h-4 w-4" />
                      Guarda lo scontrino
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Negozio</label>
                  <input
                    type="text"
                    list="maple-stores"
                    value={store}
                    onChange={(e) => setStore(e.target.value)}
                    className={cn(inputCls, "mt-1")}
                    placeholder="Supermercato, farmacia..."
                  />
                  <datalist id="maple-stores">
                    {storeSuggestions.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>

                {frequent.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500">{shopKey ? `Comprati spesso da ${store.trim()}` : "Comprati spesso"}: tocca per aggiungere</p>
                    <div className="no-scrollbar -mx-1 mt-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                      {frequent.slice(0, 12).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addFrequent(p)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm text-gray-700 ring-1 ring-gray-200 hover:bg-maple-50 hover:text-maple-600"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {items.map((r, idx) => {
                  const q = parseFloat(r.quantity);
                  const p = parseFloat(r.price);
                  const up = q > 0 && p >= 0 ? unitPrice(p, q, r.unit) : null;
                  const isTrailing = idx === items.length - 1 && !r.name.trim() && !r.price.trim();
                  const last = r.productId ? lastBuy(r.productId) : undefined;
                  return (
                    <div key={r.key} className={cn("space-y-1.5 rounded-lg p-2 ring-1", isTrailing ? "bg-white/60 ring-gray-200/60" : "bg-white ring-gray-200")}>
                      <div className="flex items-center gap-1.5">
                        <ProductPicker
                          value={r.name}
                          productId={r.productId}
                          products={catalog}
                          categories={productCategories}
                          inputClassName={inputCls}
                          emptySuggestions={frequent}
                          inputRef={fieldRef(r.key, "name")}
                          onEnter={() => focusField(r.key, "qty")}
                          onType={(name) => updateItem(r.key, { name, productId: null })}
                          onPick={(prod) => applyProduct(r.key, prod)}
                          onCreate={async (name, category) => {
                            const prod = await createProduct(name, category, r.unit);
                            if (prod) updateItem(r.key, { name: prod.name, productId: prod.id });
                            else toast("Non sono riuscito a creare il prodotto, riprova.", "error");
                          }}
                        />
                        {!isTrailing && (
                          <button
                            type="button"
                            onClick={() => setItems((prev) => withEmptyRow(prev.filter((x) => x.key !== r.key)))}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
                            aria-label="Togli prodotto"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      {!isTrailing && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <input
                              ref={fieldRef(r.key, "qty")}
                              type="text"
                              inputMode="decimal"
                              enterKeyHint="next"
                              value={r.quantity}
                              onChange={(e) => updateItem(r.key, { quantity: e.target.value.replace(",", ".") })}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusField(r.key, "price"); } }}
                              className={cn(inputCls, "w-20 shrink-0")}
                              placeholder={r.unit === "kg" ? "Peso" : "Qtà"}
                              aria-label="Quantità"
                            />
                            <select
                              value={r.unit}
                              onChange={(e) => updateItem(r.key, { unit: e.target.value as ItemUnit })}
                              className={cn(inputCls, "w-[4.75rem] shrink-0")}
                              aria-label="Unità"
                            >
                              {ITEM_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                            </select>
                            <input
                              ref={fieldRef(r.key, "price")}
                              type="text"
                              inputMode="decimal"
                              enterKeyHint="next"
                              value={r.price}
                              onChange={(e) => updateItem(r.key, { price: e.target.value.replace(",", ".") })}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nextRow(r.key); } }}
                              className={cn(inputCls, "min-w-0 flex-1")}
                              placeholder={last ? `ult. ${last.price.toFixed(2)} $` : "Prezzo $"}
                              aria-label="Prezzo totale della riga"
                            />
                          </div>
                          {up && r.name.trim() && (q !== 1 || r.unit !== "pz") && (
                            <p className="px-0.5 text-xs text-gray-500">= {formatUnitPrice(up.value, up.base)}</p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {validItems.length > 0 && (() => {
                  const diff = cadNum > 0 ? cadNum - itemsTotal : 0;
                  const matches = cadNum > 0 && Math.abs(diff) < 0.01;
                  return (
                    <div className="space-y-2 rounded-lg bg-white px-3 py-2.5 ring-1 ring-gray-200">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-gray-600">{validItems.length} {validItems.length === 1 ? "prodotto" : "prodotti"}</span>
                        <span className="font-semibold text-gray-900">{formatCAD(itemsTotal)}</span>
                      </div>
                      {cadNum > 0 && (
                        <p className={cn("flex items-center gap-1.5 text-sm", matches ? "text-emerald-600" : "text-amber-700")}>
                          {matches ? <CircleCheck className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
                          {matches
                            ? "Coincide con il totale della spesa"
                            : diff > 0
                              ? `Mancano ${formatCAD(diff)} rispetto al totale (${formatCAD(cadNum)})`
                              : `Superano il totale (${formatCAD(cadNum)}) di ${formatCAD(-diff)}`}
                        </p>
                      )}
                      {!matches && (
                        <button
                          type="button"
                          onClick={() => handleCadChange(itemsTotal.toFixed(2))}
                          className="w-full rounded-lg bg-maple-50 px-3 py-2 text-sm font-medium text-maple-600 hover:bg-maple-100"
                        >
                          Usa {formatCAD(itemsTotal)} come importo della spesa
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Rate info */}
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <span>
              Tasso BCE{rateDay && <> del {formatDate(rateDay, { weekday: "short", day: "numeric", month: "short" })}</>}: 1 EUR ={" "}
              <strong>{rate.toFixed(4)}</strong> CAD
            </span>
            {rateFetching && <span className="ml-2 text-amber-500">Caricamento...</span>}
            {!rateFetching && rateSource === "fallback" && (
              <span className="ml-2 text-amber-500">(servizio tassi non raggiungibile: uso l&apos;ultimo noto)</span>
            )}
            {!rateFetching && rateDay && date && rateDay < date && (
              <p className="mt-0.5 text-xs text-gray-500">
                {[0, 6].includes(parseDateKey(date).getDay())
                  ? "Nel weekend la BCE non pubblica: vale il tasso del venerdì."
                  : "Il tasso di questo giorno non è ancora pubblicato: la spesa si aggiorna da sola in giornata."}
              </p>
            )}
            {!rateFetching && keepsSavedRate && (
              <p className="mt-0.5 text-xs text-gray-500">Tasso salvato sulla spesa (si aggiorna se cambi la data).</p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
        </form>
        {viewer && createPortal(
          <div className="fixed inset-0 z-[60] overflow-auto bg-black/90" onClick={() => setViewer(null)}>
            <button
              type="button"
              onClick={() => setViewer(null)}
              className="fixed right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex h-11 items-center gap-1.5 rounded-full bg-white/90 px-4 text-sm font-semibold text-gray-900 shadow"
            >
              <X className="h-4 w-4" />
              Chiudi
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- foto locale o URL firmato temporaneo */}
            <img src={viewer} alt="Scontrino" className="mx-auto block w-full max-w-3xl pb-[env(safe-area-inset-bottom)] pt-[calc(4rem+env(safe-area-inset-top))]" />
          </div>,
          document.body
        )}
    </ModalShell>
  );
}
