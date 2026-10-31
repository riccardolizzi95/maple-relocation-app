"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { LookupValue, AppSettings, BudgetSettings } from "@/lib/types";
import { cn, formatCAD } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { FAVORITABLE_SECTIONS } from "@/lib/sections";
import PushSettings from "./PushSettings";
import dynamic from "next/dynamic";

const RateChart = dynamic(() => import("./RateChart"), {
  loading: () => <div className="py-8 text-center text-xs text-gray-400">Caricamento grafico...</div>,
  ssr: false,
});
import { ChevronDown, ChevronUp, X, Plus } from "lucide-react";

/** Liste il cui valore è copiato come testo in un'altra tabella: da aggiornare quando si rinomina. */
const RENAME_PROPAGATION: Record<string, { table: string; column: string }> = {
  product_category: { table: "products", column: "category" },
  document_category: { table: "documents", column: "category" },
};

const LIST_KEYS: { key: string; label: string; description: string }[] = [
  { key: "job_platform", label: "Piattaforme lavoro", description: "Dove trovi gli annunci (LinkedIn, Indeed...)" },
  { key: "job_interview_type", label: "Tipi colloquio", description: "Primo incontro, Tecnico, HR..." },
  { key: "contact_role", label: "Ruoli contatto", description: "Hiring Manager, Recruiter, Agente..." },
  { key: "housing_date_type", label: "Tipi data alloggio", description: "Prima visita, Firma, Consegna chiavi..." },
  { key: "document_category", label: "Categorie documenti", description: "Identità, Visto, Contratti, Assicurazione..." },
  { key: "product_category", label: "Categorie prodotti", description: "Frutta e verdura, Latticini e uova, Pulizia casa..." },
];

interface Props {
  initialLookups: LookupValue[];
  initialAppSettings: AppSettings;
  initialBudgetSettings: BudgetSettings;
  /** somma dei limiti per categoria: se > 0 è il budget mensile (lib/budget.ts) */
  categoryCapsTotal: number;
  currentUserId: string;
  initialMobileFavorites: string[];
  rates: { date: string; rate: number }[];
}

export default function SettingsView({
  initialLookups,
  initialAppSettings,
  initialBudgetSettings,
  categoryCapsTotal,
  currentUserId,
  initialMobileFavorites,
  rates,
}: Props) {
  const [lookups, setLookups] = useState(initialLookups);
  const [appSettings, setAppSettings] = useState(initialAppSettings);
  const [budgetSettings, setBudgetSettings] = useState(initialBudgetSettings);
  // stringhe locali: parseFloat a ogni tasto impedirebbe di digitare i decimali
  const [budgetStr, setBudgetStr] = useState(initialBudgetSettings.monthly_budget_cad?.toString() ?? "");
  const latestRate = rates.length ? rates.reduce((a, b) => (b.date > a.date ? b : a)) : null;
  const [mobileFavorites, setMobileFavorites] = useState<string[]>(initialMobileFavorites);
  const [savingApp, setSavingApp] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingFavorites, setSavingFavorites] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function saveAppSettings() {
    setSavingApp(true);
    await supabase.from("app_settings").upsert({
      id: appSettings.id || undefined,
      departure_date: appSettings.departure_date || null,
      airbnb_end_date: appSettings.airbnb_end_date || null,
      updated_at: new Date().toISOString(),
    });
    setSavingApp(false);
    router.refresh();
  }

  async function saveBudgetSettings() {
    setSavingBudget(true);
    const monthly = budgetStr ? parseFloat(budgetStr) : null;
    setBudgetSettings({ ...budgetSettings, monthly_budget_cad: monthly });
    // il tasso non si tocca: lo aggiorna ogni giorno il cron /api/rates/daily
    await supabase.from("budget_settings").upsert({
      id: budgetSettings.id || undefined,
      monthly_budget_cad: monthly,
      updated_at: new Date().toISOString(),
    });
    setSavingBudget(false);
    router.refresh();
  }

  function toggleFavorite(href: string) {
    setMobileFavorites((prev) => {
      if (prev.includes(href)) return prev.filter((f) => f !== href);
      if (prev.length >= 4) return prev;
      return [...prev, href];
    });
  }

  async function saveFavorites() {
    setSavingFavorites(true);
    await supabase.from("user_preferences").upsert(
      {
        user_id: currentUserId,
        key: "mobile_favorites",
        value: mobileFavorites as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" }
    );
    setSavingFavorites(false);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* La gestione utenti è ora una sezione dedicata (/users, dal drawer account) */}

      {/* General settings */}
      <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Generali</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-600">Data partenza</label>
            <input
              type="date"
              value={appSettings.departure_date ?? ""}
              onChange={(e) => setAppSettings({ ...appSettings, departure_date: e.target.value || null })}
              className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">Fine Airbnb</label>
            <input
              type="date"
              value={appSettings.airbnb_end_date ?? ""}
              onChange={(e) => setAppSettings({ ...appSettings, airbnb_end_date: e.target.value || null })}
              className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
            />
          </div>
        </div>
        <button onClick={saveAppSettings} disabled={savingApp} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors">
          {savingApp ? "Salvataggio..." : "Salva date"}
        </button>
      </section>

      {/* Notifiche push */}
      <PushSettings />

      <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Budget</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-600">Budget mensile (CAD)</label>
            {categoryCapsTotal > 0 ? (
              <>
                <p className="mt-1.5 text-sm text-gray-800">
                  <strong>{formatCAD(categoryCapsTotal)}</strong>
                  <span className="ml-1.5 text-xs text-gray-400">somma dei limiti per categoria</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">I limiti si modificano in Budget → Impostazioni.</p>
              </>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={budgetStr}
                onChange={(e) => setBudgetStr(e.target.value.replace(",", "."))}
                className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
              />
            )}
          </div>
          <div>
            <p className="block text-sm font-medium text-gray-600">Tasso EUR/CAD</p>
            <p className="mt-1.5 text-sm text-gray-800">
              {latestRate ? (
                <>1 EUR = <strong>{Number(latestRate.rate).toFixed(4)}</strong> CAD</>
              ) : (
                "—"
              )}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {latestRate
                ? `Tasso BCE del ${formatDate(latestRate.date, { weekday: "short", day: "numeric", month: "short" })}, si aggiorna da solo ogni giorno`
                : "Si aggiorna da solo ogni giorno"}
            </p>
          </div>
        </div>
        {categoryCapsTotal === 0 && (
          <button onClick={saveBudgetSettings} disabled={savingBudget} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors">
          {savingBudget ? "Salvataggio..." : "Salva budget"}
        </button>
        )}
      </section>

      {/* Andamento tasso di cambio */}
      <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-5 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Tasso di cambio EUR → CAD</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tasso di riferimento BCE registrato ogni giorno lavorativo (nel weekend vale quello del venerdì).
          </p>
        </div>
        <RateChart rates={rates} />
      </section>

      {/* Mobile favorites */}
      <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Barra di navigazione</h2>
          <p className="mt-1 text-sm text-gray-500">
            Scegli fino a 4 sezioni da mostrare nella barra mobile. La Dashboard è sempre visibile.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FAVORITABLE_SECTIONS.map((section) => {
            const selected = mobileFavorites.includes(section.href);
            const disabled = !selected && mobileFavorites.length >= 4;
            return (
              <button
                key={section.href}
                type="button"
                onClick={() => toggleFavorite(section.href)}
                disabled={disabled}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all",
                  selected
                    ? "border-maple-300 bg-maple-50 text-maple-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                  disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                <section.Icon className={cn("h-4 w-4 shrink-0", selected ? "text-maple-500" : "text-gray-400")} strokeWidth={1.75} />
                {section.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveFavorites}
            disabled={savingFavorites}
            className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
          >
            {savingFavorites ? "Salvataggio..." : "Salva preferiti"}
          </button>
          <span className="text-xs text-gray-400">
            {mobileFavorites.length}/4 selezionati
          </span>
        </div>
      </section>

      {/* Matchcode lists */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Liste personalizzabili</h2>
        <p className="text-sm text-gray-500">Gestisci le opzioni dei menu a tendina. Puoi aggiungere, rinominare, riordinare o eliminare voci.</p>
        {LIST_KEYS.map((list) => (
          <LookupListEditor
            key={list.key}
            listKey={list.key}
            label={list.label}
            description={list.description}
            items={lookups.filter((l) => l.list_key === list.key)}
            onUpdate={(updated) => {
              setLookups((prev) => [
                ...prev.filter((l) => l.list_key !== list.key),
                ...updated,
              ]);
            }}
          />
        ))}
      </section>
    </div>
  );
}

function LookupListEditor({
  listKey,
  label,
  description,
  items: initialItems,
  onUpdate,
}: {
  listKey: string;
  label: string;
  description: string;
  items: LookupValue[];
  onUpdate: (items: LookupValue[]) => void;
}) {
  const [items, setItems] = useState(initialItems.sort((a, b) => a.position - b.position));
  const [open, setOpen] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function handleAdd() {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    setSaving(true);
    const maxPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("lookup_values")
      .insert({ list_key: listKey, value: trimmed, position: maxPos })
      .select()
      .single();
    if (!error && data) {
      const updated = [...items, data as LookupValue];
      setItems(updated);
      onUpdate(updated);
    }
    setNewValue("");
    setSaving(false);
  }

  async function handleRename(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    const previous = items.find((i) => i.id === id)?.value;
    const { data, error } = await supabase.from("lookup_values").update({ value: trimmed }).eq("id", id).select().single();
    // le tabelle salvano il TESTO della voce: rinominandola si aggiornano anche loro
    const usedBy = RENAME_PROPAGATION[listKey];
    if (!error && usedBy && previous && previous !== trimmed) {
      await supabase.from(usedBy.table).update({ [usedBy.column]: trimmed }).eq(usedBy.column, previous);
    }
    if (!error && data) {
      const updated = items.map((i) => (i.id === id ? (data as LookupValue) : i));
      setItems(updated);
      onUpdate(updated);
    }
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await supabase.from("lookup_values").delete().eq("id", id);
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    onUpdate(updated);
  }

  async function handleMove(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const updated = [...items];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updated.forEach((item, i) => { item.position = i; });
    setItems(updated);
    onUpdate(updated);
    for (const item of updated) {
      await supabase.from("lookup_values").update({ position: item.position }).eq("id", item.id);
    }
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-foreground/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="text-left">
          <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
          <p className="text-xs text-gray-400">{description} · {items.length} voci</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2 py-1">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              {editingId === item.id ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(item.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => handleRename(item.id)}
                  autoFocus
                  className="flex-1 rounded-lg border border-maple-300 bg-white px-2 py-1 text-sm shadow-sm focus:outline-none"
                />
              ) : (
                <span
                  className="flex-1 text-sm text-gray-700 cursor-pointer hover:text-maple-600"
                  onClick={() => { setEditingId(item.id); setEditValue(item.value); }}
                  title="Clicca per rinominare"
                >
                  {item.value}
                </span>
              )}
              <button
                type="button"
                onClick={() => { if (confirm(`Eliminare "${item.value}"?`)) handleDelete(item.id); }}
                className="text-gray-300 hover:text-red-500 transition-colors"
                title="Elimina"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
              placeholder="Aggiungi voce..."
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !newValue.trim()}
              className="rounded-lg bg-maple-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
