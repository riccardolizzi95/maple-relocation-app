"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Expense, ExpenseCategory, BudgetSettings, MonthlyBudget, Housing, Profile, CategoryBudget, Income } from "@/lib/types";
import { cn, formatCAD, formatEUR } from "@/lib/utils";
import { makeMoney, type DisplayCurrency } from "@/lib/money";
import { BUDGET_SOURCE_LABEL, effectiveMonthlyBudget } from "@/lib/budget";
import { addMonthsKey, daysUntil, formatDate } from "@/lib/dates";
import {
  getPendingServerSnapshot,
  getPendingSnapshot,
  removePending,
  subscribePending,
  syncPending,
} from "@/lib/pending-expenses";
import { toast } from "@/components/ui/Toaster";
import { removeReceipt } from "@/lib/receipts";
import { Card, CardContent } from "@/components/ui/card";
import FilterBar, { type FilterDef } from "@/components/ui/FilterBar";
import {
  ChevronLeft,
  ChevronRight,
  Settings2,
  Plus,
  CopyPlus,
  Trash2,
  Wallet,
  Receipt,
  ChartColumn,
  Package,
  Check,
  X,
  Repeat,
  CloudOff,
  ShoppingBasket,
  Paperclip,
  Search,
  Download,
} from "lucide-react";
import ExpenseModal, { type ExpenseSuggestion } from "./ExpenseModal";
import { CATEGORY_META, EXPENSE_CATEGORIES } from "./categories";
import { storeKey } from "@/lib/products";
import ProductsView from "./ProductsView";
import SwipeRow from "@/components/ui/SwipeRow";
import RunwayCard from "./RunwayCard";
import IncomeModal from "./IncomeModal";
import { housingMonthlyCost } from "@/lib/housing-cost";
import SettingsModal from "./SettingsModal";
import dynamic from "next/dynamic";

const BudgetStats = dynamic(() => import("./BudgetStats"), {
  loading: () => <div className="py-8 text-center text-sm text-gray-400">Caricamento grafici...</div>,
  ssr: false,
});
const BudgetForecast = dynamic(() => import("./BudgetForecast"), {
  loading: () => <div className="py-4 text-center text-sm text-gray-400">Caricamento previsione...</div>,
  ssr: false,
});

const CATEGORIES = EXPENSE_CATEGORIES;

interface Props {
  initialExpenses: Expense[];
  initialSettings: BudgetSettings;
  initialMonthlyBudgets: MonthlyBudget[];
  initialCategoryBudgets: CategoryBudget[];
  initialIncomes: Income[];
  /** valuta in cui mostrare gli importi (preferenza di chi guarda) */
  initialDisplayCurrency: DisplayCurrency;
  currentUserId: string;
  /** ultimo tasso BCE registrato dal cron giornaliero */
  latestRate: { date: string; rate: number } | null;
  currentMonthStart: string;
  departureDate: string | null;
  chosenHousing: Housing | null;
  /** oggi nel fuso dell'utente (dal server), per le etichette "Oggi"/"Ieri" */
  today: string;
  profiles: Pick<Profile, "id" | "full_name">[];
}

export default function BudgetView({ initialExpenses, initialSettings, initialMonthlyBudgets, initialCategoryBudgets, initialIncomes, initialDisplayCurrency, currentUserId, latestRate, currentMonthStart, departureDate, chosenHousing, today, profiles }: Props) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [settings, setSettings] = useState(initialSettings);
  const [monthlyBudgets, setMonthlyBudgets] = useState(initialMonthlyBudgets);
  const [categoryBudgets, setCategoryBudgets] = useState(initialCategoryBudgets);
  const [incomes, setIncomes] = useState(initialIncomes);
  // undefined = chiuso, null = nuova entrata, Income = modifica
  const [incomeModal, setIncomeModal] = useState<Income | null | undefined>(undefined);
  const [tab, setTab] = useState<"expenses" | "stats" | "products">("expenses");
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "all">("all");
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"day" | "inserted">("day");
  const [query, setQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState<string>(currentMonthStart);
  // cambio mese con frecce o swipe sul riepilogo: la direzione serve all'animazione
  const [monthSlide, setMonthSlide] = useState<"next" | "prev" | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const showAllMonths = filterMonth === "all";
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  // "Duplica": nuova spesa precompilata da una esistente (data di oggi)
  const [templateExpense, setTemplateExpense] = useState<Expense | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // spese inserite offline, in attesa di arrivare al DB
  const pending = useSyncExternalStore(subscribePending, getPendingSnapshot, getPendingServerSnapshot);
  const pendingIds = new Set(pending.map((p) => p.id));
  const allExpenses = [...pending.filter((p) => !expenses.some((e) => e.id === p.id)), ...expenses];

  // all'apertura e quando torna la rete: invia le spese rimaste sul telefono
  useEffect(() => {
    let running = false;
    async function sync() {
      if (running || getPendingSnapshot().length === 0) return;
      running = true;
      const synced = await syncPending(supabase);
      running = false;
      if (synced.length === 0) return;
      setExpenses((prev) => [...synced.filter((s) => !prev.some((e) => e.id === s.id)), ...prev]);
      toast(synced.length === 1 ? "Spesa offline sincronizzata." : `${synced.length} spese offline sincronizzate.`);
      router.refresh();
    }
    sync();
    // anche quando l'app torna in primo piano e, finché c'è qualcosa in coda, ogni 30 s:
    // con la rete instabile l'evento "online" spesso non arriva mai
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    const timer = window.setInterval(sync, 30_000);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, router]);

  // descrizioni già usate (le più frequenti prima), con la categoria dell'ultima volta
  const suggestions: ExpenseSuggestion[] = useMemo(() => {
    const map = new Map<string, ExpenseSuggestion & { count: number; last: string }>();
    for (const e of expenses) {
      const description = e.description.trim();
      if (!description) continue;
      const key = description.toLowerCase();
      const cur = map.get(key);
      if (!cur) map.set(key, { description, category: e.category, count: 1, last: e.date });
      else {
        cur.count++;
        if (e.date > cur.last) { cur.last = e.date; cur.category = e.category; }
      }
    }
    return [...map.values()]
      .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
      .map(({ description, category }) => ({ description, category }));
  }, [expenses]);

  // negozi già usati (dal campo negozio o dalla descrizione delle spese al supermercato), un nome per negozio
  const storeSuggestions = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const e of expenses) {
      const label = (e.store ?? (e.category === "cibo" || e.category === "casa" ? e.description : "")).trim();
      const key = storeKey(label);
      if (!key) continue;
      const cur = counts.get(key) ?? { label, n: 0 };
      cur.n++;
      counts.set(key, cur);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 20).map((c) => c.label);
  }, [expenses]);

  const authorName = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? null : null);

  // tasso "corrente": l'ultimo BCE registrato (fallback: quello in budget_settings, aggiornato dallo stesso cron)
  const rate = latestRate?.rate ?? (Number(settings.eur_cad_rate) || 1.5);
  // valuta di visualizzazione: preferenza per persona (user_preferences "display_currency")
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(initialDisplayCurrency);
  const money = useMemo(() => makeMoney(displayCurrency, rate), [displayCurrency, rate]);
  function changeCurrency(c: DisplayCurrency) {
    setDisplayCurrency(c);
    supabase
      .from("user_preferences")
      .upsert({ user_id: currentUserId, key: "display_currency", value: c, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" })
      .then(({ error }) => { if (error) console.warn("[budget] preferenza valuta non salvata:", error.message); });
  }
  // budget senza override del mese: somma dei limiti per categoria se ci sono, altrimenti il manuale
  const defaultBudget = effectiveMonthlyBudget(settings.monthly_budget_cad, categoryBudgets).amount;
  const selectedMonthKey = showAllMonths ? null : filterMonth.slice(0, 7);
  const monthOverride = selectedMonthKey ? monthlyBudgets.find((mb) => mb.month === selectedMonthKey) : null;
  const monthBudget = effectiveMonthlyBudget(settings.monthly_budget_cad, categoryBudgets, monthOverride ? Number(monthOverride.amount_cad) : null);
  const monthlyBudget = monthBudget.amount;
  // statistiche: il mese scelto, o quello corrente se la vista è "Tutti"
  const statsMonth = showAllMonths ? currentMonthStart : filterMonth;
  const statsOverride = monthlyBudgets.find((mb) => mb.month === statsMonth.slice(0, 7));
  const statsBudget = statsOverride ? Number(statsOverride.amount_cad) : defaultBudget;

  const monthExpenses = showAllMonths
    ? allExpenses
    : allExpenses.filter((e) => e.date >= filterMonth && e.date < addMonthsKey(filterMonth, 1));

  // la ricerca guarda in tutti i mesi: chi cerca un negozio vuole trovarle tutte
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const filtered = (searching ? allExpenses : monthExpenses)
    .filter((e) => {
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (filterPerson !== "all" && e.created_by !== filterPerson) return false;
      if (searching) {
        const haystack = `${e.description} ${CATEGORY_META[e.category]?.label ?? ""} ${authorName(e.created_by) ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) =>
      sortMode === "inserted"
        ? (b.created_at ?? "").localeCompare(a.created_at ?? "")
        : b.date.localeCompare(a.date) || (b.created_at ?? "").localeCompare(a.created_at ?? "")
    );

  // lista raggruppata per giorno, con il totale della giornata
  // ("Ultime inserite": un solo gruppo senza intestazione, la data va nella riga)
  const dayGroups: { date: string; total: number; items: Expense[] }[] = [];
  if (sortMode === "inserted" && filtered.length > 0) {
    dayGroups.push({ date: "", total: 0, items: filtered });
  } else for (const e of filtered) {
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.date === e.date) {
      last.items.push(e);
      last.total += money.of(e);
    } else {
      dayGroups.push({ date: e.date, total: money.of(e), items: [e] });
    }
  }

  function dayLabel(date: string) {
    const diff = daysUntil(date, today);
    if (diff === 0) return "Oggi";
    if (diff === -1) return "Ieri";
    return formatDate(date, {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    });
  }

  const totalMonth = monthExpenses.reduce((sum, e) => sum + Number(e.amount_cad), 0);
  const budgetPercent = monthlyBudget > 0 ? Math.round((totalMonth / monthlyBudget) * 100) : 0;
  const overBudget = monthlyBudget > 0 && totalMonth > monthlyBudget;


  function shiftMonth(step: 1 | -1) {
    if (filterMonth === "all") return;
    if (step === 1 && filterMonth >= currentMonthStart) return; // niente mesi futuri
    setMonthSlide(step === 1 ? "next" : "prev");
    setFilterMonth(addMonthsKey(filterMonth, step));
  }

  /** Swipe orizzontale sul riepilogo: verso sinistra il mese dopo, verso destra quello prima. */
  function onSummaryTouchEnd(e: React.TouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // era uno scroll verticale
    shiftMonth(dx < 0 ? 1 : -1);
  }

  function openDuplicate(expense: Expense) {
    setEditingExpense(null);
    setTemplateExpense(expense);
    setExpenseModalOpen(true);
  }

  function openNewExpense() {
    setEditingExpense(null);
    setTemplateExpense(null);
    setExpenseModalOpen(true);
  }

  function checkAlerts() {
    fetch("/api/budget/check", { method: "POST" })
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then((json) => {
        for (const a of json.alerts ?? []) toast(`${a.title} — ${a.body}`, a.level === 100 ? "error" : "warning");
      })
      .catch(() => undefined);
  }

  function handleSaved(expense: Expense, isPending?: boolean) {
    if (isPending) {
      // è già nella coda offline (e quindi in lista): niente refresh, il server non la conosce ancora
      setExpenseModalOpen(false);
      setEditingExpense(null);
      setTemplateExpense(null);
      return;
    }
    setExpenses((prev) => {
      const exists = prev.find((e) => e.id === expense.id);
      if (exists) return prev.map((e) => (e.id === expense.id ? expense : e));
      return [expense, ...prev];
    });
    setExpenseModalOpen(false);
    setEditingExpense(null);
    setTemplateExpense(null);
    router.refresh();
    checkAlerts();
  }

  function handleSettingsSaved(newSettings: BudgetSettings, newCategoryBudgets: CategoryBudget[]) {
    setSettings(newSettings);
    setCategoryBudgets(newCategoryBudgets);
    setSettingsModalOpen(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (pendingIds.has(id)) {
      removePending(id);
      return;
    }
    const removed = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      if (removed) setExpenses((prev) => [removed, ...prev]);
      toast("Eliminazione non riuscita: controlla la connessione e riprova.", "error");
      return;
    }
    if (removed?.receipt_path) removeReceipt(supabase, removed.receipt_path);
    router.refresh();
  }

  /** CSV per Excel/Numbers in italiano: ";" come separatore, virgola decimale, BOM per gli accenti. */
  async function exportCsv() {
    const num = (n: number) => n.toFixed(2).replace(".", ",");
    const cell = (v: string) => {
      // una cella che inizia con = + - @ verrebbe eseguita come formula
      const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
      return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const header = ["Data", "Descrizione", "Categoria", "Importo CAD", "Tasso EUR/CAD", "Importo EUR", "Inserita da", "Ricorrente"];
    const rows = filtered.map((e) => {
      const r = Number(e.exchange_rate ?? rate);
      return [
        formatDate(e.date),
        e.description,
        CATEGORY_META[e.category]?.label ?? e.category,
        num(Number(e.amount_cad)),
        String(r).replace(".", ","),
        num(Number(e.amount_cad) / r),
        authorName(e.created_by) ?? "",
        e.recurring || e.recurring_of ? "sì" : "",
      ];
    });
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
    const name = `maple-spese-${searching ? "ricerca" : showAllMonths ? "tutte" : filterMonth.slice(0, 7)}.csv`;
    const file = new File([csv], name, { type: "text/csv;charset=utf-8" });

    // sul telefono il foglio di condivisione (Salva su File, Mail...) funziona meglio del download
    if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const categoryFilter: FilterDef[] = [
    {
      key: "category",
      label: "Tutte le categorie",
      value: filterCategory,
      options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
      onChange: (v) => setFilterCategory(v as ExpenseCategory | "all"),
    },
    {
      key: "sort",
      label: "Ordina per",
      value: sortMode,
      defaultValue: "day",
      options: [
        { value: "day", label: "Per giorno" },
        { value: "inserted", label: "Ultime inserite" },
      ],
      onChange: (v) => setSortMode(v as "day" | "inserted"),
      isSort: true,
    },
    // filtro persona solo se ci sono spese attribuite (l'autore si salva dal 04/10/2026)
    ...(profiles.some((p) => expenses.some((e) => e.created_by === p.id))
      ? [{
          key: "person",
          label: "Tutte le persone",
          value: filterPerson,
          options: profiles
            .filter((p) => expenses.some((e) => e.created_by === p.id))
            .map((p) => ({ value: p.id, label: p.full_name ?? "—" })),
          onChange: (v: string) => setFilterPerson(v),
        }]
      : []),
  ];

  return (
    <>
      {/* Mese + quanto avete speso: il blocco principale, leggibile a colpo d'occhio */}
      <Card
        className="py-0"
        onTouchStart={(e) => { const t = e.touches[0]; swipeStart.current = { x: t.clientX, y: t.clientY }; }}
        onTouchEnd={onSummaryTouchEnd}
      >
        <CardContent className="space-y-2 px-3 py-3">
          <div className="flex items-center gap-1">
            {showAllMonths ? (
              <p className="flex-1 px-1 text-base font-semibold text-gray-900">Tutti i mesi</p>
            ) : (
              <>
                <button
                  onClick={() => shiftMonth(-1)}
                  aria-label="Mese precedente"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {/* il nome del mese apre il selettore del telefono */}
                <label className="relative flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg hover:bg-gray-50">
                  <span className="truncate text-base font-semibold capitalize text-gray-900">
                    {formatDate(filterMonth, { month: "long", year: "numeric" })}
                  </span>
                  <input
                    type="month"
                    value={filterMonth.slice(0, 7)}
                    max={currentMonthStart.slice(0, 7)}
                    onChange={(e) => { if (e.target.value) { setMonthSlide(null); setFilterMonth(e.target.value + "-01"); } }}
                    aria-label="Scegli il mese"
                    className="absolute inset-0 h-full cursor-pointer opacity-0"
                  />
                </label>
                <button
                  onClick={() => shiftMonth(1)}
                  disabled={filterMonth >= currentMonthStart}
                  aria-label="Mese successivo"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              onClick={() => setFilterMonth(showAllMonths ? currentMonthStart : "all")}
              className="h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-maple-600 hover:bg-maple-50 transition-colors"
            >
              {showAllMonths ? "Per mese" : "Tutti"}
            </button>
            <button
              onClick={() => setSettingsModalOpen(true)}
              aria-label="Impostazioni budget"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <Settings2 className="h-5 w-5" />
            </button>
          </div>

          <div
            key={filterMonth}
            className={cn(
              "px-1 animate-in fade-in duration-200",
              monthSlide === "next" && "slide-in-from-right-6",
              monthSlide === "prev" && "slide-in-from-left-6"
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-3xl font-semibold tracking-tight text-gray-900">
                {money.format(monthExpenses.reduce((sum, e) => sum + money.of(e), 0))}
              </p>
              <p className="shrink-0 text-sm text-gray-400">
                ≈ {money.currency === "EUR"
                  ? formatCAD(totalMonth)
                  : formatEUR(monthExpenses.reduce((sum, e) => sum + Number(e.amount_cad) / (e.exchange_rate ?? rate), 0))}
              </p>
            </div>
            {!showAllMonths && monthlyBudget > 0 ? (
              <>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all duration-500",
                      overBudget ? "bg-red-500" : budgetPercent > 80 ? "bg-amber-400" : "bg-maple-400"
                    )}
                    style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-sm text-gray-500">
                  {overBudget ? (
                    <span className="font-medium text-red-600">Oltre il budget di {money.format(money.fromCad(totalMonth - monthlyBudget))}</span>
                  ) : (
                    <>Restano <span className="font-medium text-gray-800">{money.format(money.fromCad(monthlyBudget - totalMonth))}</span></>
                  )}
                  {" "}su {money.format(money.fromCad(monthlyBudget))}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                {monthExpenses.length} {monthExpenses.length === 1 ? "spesa" : "spese"}{showAllMonths && " in tutto"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <RunwayCard
        settings={settings}
        expenses={allExpenses}
        incomes={incomes}
        today={today}
        departureDate={departureDate}
        fallbackRate={rate}
        chosenHousingMonthlyCad={chosenHousing ? housingMonthlyCost(chosenHousing)?.total ?? null : null}
        onEditSavings={() => setSettingsModalOpen(true)}
        onAddIncome={() => setIncomeModal(null)}
        onEditIncome={(n) => setIncomeModal(n)}
      />

      {/* Schede */}
      <div className="flex w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm sm:w-fit">
        {([
          { key: "expenses", label: "Spese", Icon: Receipt },
          { key: "stats", label: "Statistiche", Icon: ChartColumn },
          { key: "products", label: "Prodotti", Icon: ShoppingBasket },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-4",
              tab === key ? "bg-maple-500 text-white" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "products" ? (
        <ProductsView />
      ) : tab === "stats" ? (
        <>
          <BudgetStats
            expenses={allExpenses}
            departureDate={departureDate}
            monthStart={statsMonth}
            monthlyBudget={statsBudget}
            categoryBudgets={categoryBudgets}
            onEditLimits={() => setSettingsModalOpen(true)}
            today={today}
            money={money}
          />
          <BudgetForecast expenses={expenses} departureDate={departureDate} chosenHousing={chosenHousing} money={money} />
        </>
      ) : (
      <>
      {/* Ricerca (in tutti i mesi) + filtri; su telefono la nuova spesa è il "+" in basso */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca in tutte le spese..."
              className="block w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
            />
          </div>
          <FilterBar
            filters={categoryFilter}
            action={
              <button
                onClick={openNewExpense}
                className="hidden items-center gap-1.5 rounded-lg bg-maple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors sm:inline-flex"
              >
                <Plus className="h-4 w-4" />
                Nuova spesa
              </button>
            }
          />
        </div>
        {searching && (
          <p className="px-1 text-xs text-gray-500">
            {filtered.length} {filtered.length === 1 ? "spesa trovata" : "spese trovate"} in tutti i mesi · {money.format(filtered.reduce((s, e) => s + money.of(e), 0))}
          </p>
        )}
      </div>

      {/* Expense list */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-gray-100 text-gray-400 mb-3">
              <Wallet className="h-6 w-6" />
            </div>
            <p className="text-sm text-gray-500">{searching ? "Nessuna spesa trovata." : "Nessuna spesa per questo periodo."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {dayGroups.map((group) => (
            <div key={group.date} className="space-y-1.5">
              {group.date && (
                <div className="flex items-baseline justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{dayLabel(group.date)}</h3>
                  <span className="text-xs font-semibold text-gray-500">{money.format(group.total)}</span>
                </div>
              )}
              {group.items.map((expense) => {
                const cat = CATEGORIES.find((c) => c.value === expense.category);
                const CatIcon = cat?.Icon ?? Package;
                const isPending = pendingIds.has(expense.id);
                const author = authorName(expense.created_by);
                return (
                  <Card key={expense.id} className={cn("overflow-hidden py-0", isPending && "border-dashed border-amber-300")}>
                    <CardContent className="p-0">
                      {/* tocco = modifica (lì anche Duplica ed Elimina); swipe destra = duplica, sinistra = elimina */}
                      <SwipeRow
                        className="bg-card"
                        toRight={isPending ? undefined : {
                          Icon: CopyPlus, bg: "bg-blue-50", idle: "text-blue-300", active: "text-blue-600",
                          onTrigger: () => openDuplicate(expense),
                        }}
                        toLeft={{
                          Icon: Trash2, bg: "bg-red-50", idle: "text-red-300", active: "text-red-600",
                          onTrigger: () => { if (confirm("Eliminare questa spesa?")) handleDelete(expense.id); },
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isPending) {
                              if (confirm("Questa spesa è ancora solo sul telefono. Eliminarla?")) handleDelete(expense.id);
                              return;
                            }
                            setTemplateExpense(null); setEditingExpense(expense); setExpenseModalOpen(true);
                          }}
                          className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left"
                        >
                          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", cat?.color ?? "bg-gray-100 text-gray-500")}>
                            <CatIcon className="h-[18px] w-[18px]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="flex items-center gap-1.5 text-[15px] font-medium text-gray-800">
                              <span className="truncate">{expense.description}</span>
                              {(expense.recurring || expense.recurring_of) && (
                                <Repeat className="h-3.5 w-3.5 shrink-0 text-maple-400" aria-label="Ricorrente" />
                              )}
                              {expense.receipt_path && (
                                <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="Con scontrino" />
                              )}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {isPending ? (
                                <span className="inline-flex items-center gap-1 text-amber-600">
                                  <CloudOff className="h-3.5 w-3.5" />
                                  Da inviare: parte appena la rete risponde
                                </span>
                              ) : (
                                <>
                                  {sortMode === "inserted" && <>{formatDate(expense.date, { day: "numeric", month: "short" })} · </>}
                                  {cat?.label}
                                  {author && <> · {author}</>}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[15px] font-semibold text-gray-900">{money.format(money.of(expense))}</p>
                            <p className="text-xs text-gray-400">{money.formatOther(expense)}</p>
                          </div>
                        </button>
                      </SwipeRow>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
          <button
            onClick={exportCsv}
            className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Esporta queste spese (CSV)
          </button>
        </div>
      )}

      </>
      )}

      {expenseModalOpen && (
        <ExpenseModal
          item={editingExpense}
          template={templateExpense}
          onDuplicate={editingExpense ? () => openDuplicate(editingExpense) : undefined}
          onDelete={editingExpense ? () => {
            const id = editingExpense.id;
            setExpenseModalOpen(false);
            setEditingExpense(null);
            handleDelete(id);
          } : undefined}
          fallbackRate={rate}
          suggestions={suggestions}
          storeSuggestions={storeSuggestions}
          onClose={() => { setExpenseModalOpen(false); setEditingExpense(null); setTemplateExpense(null); }}
          onSaved={handleSaved}
        />
      )}

      {tab === "expenses" && (
        <button
          onClick={openNewExpense}
          aria-label="Nuova spesa"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-maple-500 text-white shadow-lg shadow-maple-500/30 transition-transform active:scale-95 sm:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {incomeModal !== undefined && (
        <IncomeModal
          item={incomeModal}
          fallbackRate={rate}
          onClose={() => setIncomeModal(undefined)}
          onSaved={(n) => {
            setIncomes((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
            setIncomeModal(undefined);
            toast("Entrata salvata.");
          }}
          onDeleted={(id) => {
            setIncomes((prev) => prev.filter((x) => x.id !== id));
            setIncomeModal(undefined);
          }}
        />
      )}

      {settingsModalOpen && (
        <SettingsModal
          settings={settings}
          categoryBudgets={categoryBudgets}
          top={
            <div className="space-y-3 rounded-lg bg-gray-50 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Mostra gli importi in</p>
                  <p className="text-xs text-gray-500">Solo per te</p>
                </div>
                <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  {(["CAD", "EUR"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => changeCurrency(c)}
                      className={cn("px-4 py-2 text-sm font-medium", displayCurrency === c ? "bg-maple-500 text-white" : "text-gray-500 hover:bg-gray-50")}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {!showAllMonths && (
                <div className="text-sm text-gray-700">
                  Budget di {formatDate(filterMonth, { month: "long", year: "numeric" })}:{" "}
                  <span className="font-medium">{formatCAD(monthlyBudget)}</span>
                  <span className="text-xs text-gray-500"> ({BUDGET_SOURCE_LABEL[monthBudget.source]})</span>
                  <MonthBudgetEditor
                    month={selectedMonthKey!}
                    current={monthOverride?.amount_cad ?? null}
                    defaultBudget={defaultBudget}
                    onSaved={(mb) => {
                      setMonthlyBudgets((prev) => {
                        const exists = prev.find((b) => b.month === mb.month);
                        if (exists) return prev.map((b) => (b.month === mb.month ? mb : b));
                        return [...prev, mb];
                      });
                    }}
                    onRemoved={(month) => {
                      setMonthlyBudgets((prev) => prev.filter((b) => b.month !== month));
                    }}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500">
                Tasso BCE{latestRate && <> del {formatDate(latestRate.date, { day: "numeric", month: "short" })}</>}: 1 EUR = {rate.toFixed(4)} CAD, aggiornato ogni giorno
              </p>
            </div>
          }
          onClose={() => setSettingsModalOpen(false)}
          onSaved={handleSettingsSaved}
        />
      )}
    </>
  );
}

function MonthBudgetEditor({
  month,
  current,
  defaultBudget,
  onSaved,
  onRemoved,
}: {
  month: string;
  current: number | null;
  defaultBudget: number;
  onSaved: (mb: MonthlyBudget) => void;
  onRemoved: (month: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current?.toString() ?? defaultBudget.toString());
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    const amount = parseFloat(value);
    if (!amount) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("monthly_budgets")
      .upsert({ month, amount_cad: amount }, { onConflict: "month" })
      .select()
      .single();

    if (!error && data) {
      onSaved(data as MonthlyBudget);
    }
    setEditing(false);
    setLoading(false);
  }

  async function handleRemove() {
    setLoading(true);
    await supabase.from("monthly_budgets").delete().eq("month", month);
    onRemoved(month);
    setEditing(false);
    setLoading(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="ml-2 rounded-lg px-2 py-1 text-sm font-medium text-maple-600 hover:bg-maple-50"
      >
        Cambia
      </button>
    );
  }

  // dentro il modulo delle impostazioni: tutti i pulsanti sono type="button" (niente invio del modulo)
  return (
    <span className="mt-2 flex items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(",", "."))}
        aria-label="Budget di questo mese in CAD"
        className="w-28 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-maple-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={loading}
        className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 transition-colors"
        title="Salva"
      >
        <Check className="h-5 w-5" />
      </button>
      {current !== null && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={loading}
          className="rounded-lg p-2 text-red-500 hover:bg-red-50 transition-colors"
          title="Torna al budget normale"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 transition-colors"
        title="Annulla"
      >
        <X className="h-5 w-5" />
      </button>
    </span>
  );
}
