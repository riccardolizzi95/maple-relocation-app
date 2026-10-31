"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Housing, HousingStatus, HousingContact, HousingDate, TriState } from "@/lib/types";
import EditableSelect from "@/components/ui/EditableSelect";
import ModalShell from "@/components/ui/ModalShell";
import {
  Home,
  Calendar,
  Users,
  DollarSign,
  FileText,
  StickyNote,
  Sparkles,
} from "lucide-react";

const STATUS_OPTIONS: { value: HousingStatus; label: string }[] = [
  { value: "da-vedere", label: "Da vedere" },
  { value: "contattato", label: "Contattato" },
  { value: "visto", label: "Visto" },
  { value: "candidato", label: "Candidato" },
  { value: "scartato", label: "Scartato" },
];

const TRI_OPTIONS: { value: TriState; label: string }[] = [
  { value: "si", label: "Sì" },
  { value: "no", label: "No" },
  { value: "parziale", label: "Parziale" },
];

type SectionKey = "info" | "date" | "contatti" | "offerta" | "condizioni" | "note";

const SECTIONS: { key: SectionKey; label: string; Icon: typeof Home }[] = [
  { key: "info", label: "Info", Icon: Home },
  { key: "date", label: "Date", Icon: Calendar },
  { key: "contatti", label: "Contatti", Icon: Users },
  { key: "offerta", label: "Offerta", Icon: DollarSign },
  { key: "condizioni", label: "Contratto", Icon: FileText },
  { key: "note", label: "Note", Icon: StickyNote },
];

interface Props {
  item: Housing | null;
  onClose: () => void;
  onSaved: (item: Housing) => void;
}

type DraftContact = Omit<HousingContact, "id" | "housing_id" | "created_at"> & { id?: string; _tempId?: string };
type DraftDate = Omit<HousingDate, "id" | "housing_id" | "created_at"> & { id?: string; _tempId?: string };

export default function HousingModal({ item, onClose, onSaved }: Props) {
  const isEditing = !!item;
  const supabase = createClient();

  const [section, setSection] = useState<SectionKey>("info");
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Compila da un annuncio (link o testo incollato) → /api/housing/parse
  const [importOpen, setImportOpen] = useState(!isEditing);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [address, setAddress] = useState(item?.address ?? "");
  const [neighborhood, setNeighborhood] = useState(item?.neighborhood ?? "");
  const [priceCad, setPriceCad] = useState(item?.price_cad?.toString() ?? "");
  const [listingUrl, setListingUrl] = useState(item?.listing_url ?? "");
  const [status, setStatus] = useState<HousingStatus>(item?.status ?? "da-vedere");
  const [rating, setRating] = useState(item?.rating ?? 0);

  const [offerAmount, setOfferAmount] = useState(item?.offer_amount_cad?.toString() ?? "");
  const [offerDeadline, setOfferDeadline] = useState(item?.offer_deadline ?? "");
  const [offerNotes, setOfferNotes] = useState(item?.offer_notes ?? "");

  const [utilitiesIncluded, setUtilitiesIncluded] = useState<TriState | "">(item?.utilities_included ?? "");
  const [utilitiesEstimate, setUtilitiesEstimate] = useState(item?.utilities_estimate_cad?.toString() ?? "");
  const [condoFeesIncluded, setCondoFeesIncluded] = useState<boolean | null>(item?.condo_fees_included ?? null);
  const [condoFeesCad, setCondoFeesCad] = useState(item?.condo_fees_cad?.toString() ?? "");
  const [furnished, setFurnished] = useState<TriState | "">(item?.furnished ?? "");
  const [furnishedNotes, setFurnishedNotes] = useState(item?.furnished_notes ?? "");
  const [depositCad, setDepositCad] = useState(item?.deposit_cad?.toString() ?? "");
  const [advanceMonths, setAdvanceMonths] = useState(item?.advance_months?.toString() ?? "");
  const [minLeaseMonths, setMinLeaseMonths] = useState(item?.min_lease_months?.toString() ?? "");
  const [cancellationTerms, setCancellationTerms] = useState(item?.cancellation_terms ?? "");
  const [contractNotes, setContractNotes] = useState(item?.contract_notes ?? "");

  const [pros, setPros] = useState(item?.pros ?? "");
  const [cons, setCons] = useState(item?.cons ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const [contacts, setContacts] = useState<DraftContact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(!isEditing);
  const [dates, setDates] = useState<DraftDate[]>([]);
  const [datesLoaded, setDatesLoaded] = useState(!isEditing);

  useEffect(() => {
    if (!isEditing) return;
    supabase.from("housing_contacts").select("*").eq("housing_id", item.id).order("created_at").then(({ data }) => {
      setContacts((data ?? []).map((c) => ({ ...c })));
      setContactsLoaded(true);
    });
    supabase.from("housing_dates").select("*").eq("housing_id", item.id).order("date").then(({ data }) => {
      setDates((data ?? []).map((d) => ({ ...d })));
      setDatesLoaded(true);
    });
  }, [isEditing, item?.id, supabase]);

  function addContact() {
    setContacts((prev) => [...prev, { role: "", name: "", email: null, phone: null, notes: null, _tempId: crypto.randomUUID() }]);
  }
  function removeContact(idx: number) { setContacts((prev) => prev.filter((_, i) => i !== idx)); }
  function updateContact(idx: number, field: string, value: string) {
    setContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value || null } : c));
  }

  function addDate() {
    setDates((prev) => [...prev, { date: "", type: "", notes: null, _tempId: crypto.randomUUID() }]);
  }
  function removeDate(idx: number) { setDates((prev) => prev.filter((_, i) => i !== idx)); }
  function updateDate(idx: number, field: string, value: string) {
    setDates((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: value || null } : d));
  }

  async function handleImport() {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/housing/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: importText }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.listingUrl && !listingUrl) setListingUrl(json.listingUrl);
        setImportMsg({ ok: false, text: json.error ?? "Non sono riuscito a leggere l'annuncio." });
        return;
      }
      const f = json.fields;
      const filled: string[] = [];
      // riempie solo i campi ancora vuoti: quello che hai già scritto non si tocca
      const fill = (label: string, current: string, set: (v: string) => void, value: string | number | null) => {
        if (current || value === null || value === undefined || value === "") return;
        set(String(value));
        filled.push(label);
      };
      fill("nome", name, setName, f.name);
      fill("indirizzo", address, setAddress, f.address);
      fill("quartiere", neighborhood, setNeighborhood, f.neighborhood);
      fill("prezzo", priceCad, setPriceCad, f.price_cad);
      fill("link", listingUrl, setListingUrl, f.listing_url);
      fill("stima utenze", utilitiesEstimate, setUtilitiesEstimate, f.utilities_estimate_cad);
      fill("note arredo", furnishedNotes, setFurnishedNotes, f.furnished_notes);
      fill("caparra", depositCad, setDepositCad, f.deposit_cad);
      fill("mesi anticipati", advanceMonths, setAdvanceMonths, f.advance_months);
      fill("durata minima", minLeaseMonths, setMinLeaseMonths, f.min_lease_months);
      fill("pro", pros, setPros, f.pros);
      fill("contro", cons, setCons, f.cons);
      fill("note", notes, setNotes, f.notes);
      if (!utilitiesIncluded && f.utilities_included) { setUtilitiesIncluded(f.utilities_included); filled.push("utenze"); }
      if (!furnished && f.furnished) { setFurnished(f.furnished); filled.push("arredato"); }
      if (f.contact && !contacts.some((c) => c.name?.trim().toLowerCase() === f.contact.name.toLowerCase())) {
        setContacts((prev) => [...prev, { ...f.contact, notes: null, _tempId: crypto.randomUUID() }]);
        filled.push("contatto");
      }
      setImportMsg(
        filled.length
          ? { ok: true, text: `Compilati: ${filled.join(", ")}. Controlla anche le schede Offerta, Contratto, Contatti e Note prima di salvare.` }
          : { ok: false, text: "Nell'annuncio non ho trovato dati nuovi da inserire." }
      );
      if (filled.length) setImportOpen(false);
    } catch {
      setImportMsg({ ok: false, text: "Connessione assente: riprova quando torna la rete." });
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSaveError(null);

    const payload = {
      name: name || null,
      address,
      neighborhood: neighborhood || null,
      price_cad: priceCad ? parseFloat(priceCad) : null,
      listing_url: listingUrl || null,
      status,
      rating: rating || null,
      pros: pros || null,
      cons: cons || null,
      notes: notes || null,
      offer_amount_cad: offerAmount ? parseFloat(offerAmount) : null,
      offer_deadline: offerDeadline || null,
      offer_notes: offerNotes || null,
      utilities_included: utilitiesIncluded || null,
      utilities_estimate_cad: utilitiesEstimate ? parseFloat(utilitiesEstimate) : null,
      condo_fees_included: condoFeesIncluded,
      condo_fees_cad: condoFeesCad ? parseFloat(condoFeesCad) : null,
      furnished: furnished || null,
      furnished_notes: furnishedNotes || null,
      deposit_cad: depositCad ? parseFloat(depositCad) : null,
      advance_months: advanceMonths ? parseInt(advanceMonths) : null,
      min_lease_months: minLeaseMonths ? parseInt(minLeaseMonths) : null,
      cancellation_terms: cancellationTerms || null,
      contract_notes: contractNotes || null,
      updated_at: new Date().toISOString(),
    };

    let saved: Housing | null = null;
    let failure: string | null = null;
    if (isEditing) {
      const { data, error } = await supabase.from("housing").update(payload).eq("id", item.id).select().single();
      if (!error && data) saved = data as Housing;
      else failure = error?.message ?? null;
    } else {
      const { data, error } = await supabase.from("housing").insert(payload).select().single();
      if (!error && data) saved = data as Housing;
      else failure = error?.message ?? null;
    }

    if (!saved) {
      setSaveError(`Salvataggio non riuscito: ${failure ?? "controlla la connessione e riprova"}`);
      setLoading(false);
      return;
    }

    if (isEditing) await supabase.from("housing_contacts").delete().eq("housing_id", saved.id);
    const validContacts = contacts.filter((c) => c.name?.trim());
    if (validContacts.length > 0) {
      await supabase.from("housing_contacts").insert(
        validContacts.map((c) => ({ housing_id: saved!.id, role: c.role || "Contatto", name: c.name, email: c.email, phone: c.phone, notes: c.notes }))
      );
    }

    if (isEditing) await supabase.from("housing_dates").delete().eq("housing_id", saved.id);
    const validDates = dates.filter((d) => d.date && d.type);
    if (validDates.length > 0) {
      await supabase.from("housing_dates").insert(
        validDates.map((d) => ({ housing_id: saved!.id, date: d.date, type: d.type, notes: d.notes }))
      );
    }

    onSaved(saved);
    setLoading(false);
  }

  const fieldCls =
    "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";
  const inputCls = `mt-1.5 ${fieldCls}`;

  const tabs = (
    <div className="no-scrollbar flex px-4 overflow-x-auto">
      {SECTIONS.map((s) => (
        <button key={s.key} type="button" onClick={() => setSection(s.key)}
          className={cn("flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
            section === s.key ? "border-maple-500 text-maple-600" : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          <s.Icon className="h-3.5 w-3.5" />
          {s.label}
        </button>
      ))}
    </div>
  );

  const footer = (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors">Annulla</button>
      <button type="submit" form="housing-form" disabled={loading} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors">
        {loading ? "Salvataggio..." : isEditing ? "Salva" : "Aggiungi"}
      </button>
    </div>
  );

  return (
    <ModalShell
      title={isEditing ? "Modifica alloggio" : "Nuovo alloggio"}
      onClose={onClose}
      tabs={tabs}
      footer={footer}
    >
      <form id="housing-form" onSubmit={handleSubmit} className="space-y-4">

            {section === "info" && (
              <>
                <div className="rounded-lg border border-dashed border-maple-200 bg-maple-50/40 p-3">
                  {!importOpen ? (
                    <button type="button" onClick={() => setImportOpen(true)} className="flex w-full items-center gap-2 text-left text-sm font-medium text-maple-600">
                      <Sparkles className="h-4 w-4" />
                      Compila da un annuncio
                      <span className="text-xs font-normal text-gray-400">link o testo</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                        <Sparkles className="h-4 w-4 text-maple-500" />
                        Compila da un annuncio
                      </p>
                      <textarea
                        rows={3}
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        className={cn(fieldCls, "resize-none")}
                        placeholder="Incolla il link (Kijiji, Rentals.ca...) o tutto il testo dell'annuncio"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-gray-400">Riempio solo i campi vuoti: controlla prima di salvare.</p>
                        <button
                          type="button"
                          onClick={handleImport}
                          disabled={importing || !importText.trim()}
                          className="shrink-0 rounded-lg bg-maple-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
                        >
                          {importing ? "Leggo l'annuncio..." : "Compila"}
                        </button>
                      </div>
                    </div>
                  )}
                  {importMsg && (
                    <p className={cn("mt-2 text-xs", importMsg.ok ? "text-emerald-700" : "text-red-600")}>{importMsg.text}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Nome *</label>
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="es. Bilocale Liberty Village" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Indirizzo *</label>
                    <input type="text" required value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="123 Queen St W" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Quartiere</label>
                    <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={inputCls} placeholder="Liberty Village" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Prezzo CAD/mese</label>
                    <input type="text" inputMode="decimal" value={priceCad} onChange={(e) => setPriceCad(e.target.value.replace(",", "."))} className={inputCls} placeholder="2000" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Link annuncio</label>
                  <input type="url" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} className={inputCls} placeholder="https://..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Stato</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value as HousingStatus)} className={inputCls}>
                      {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Voto</label>
                    <div className="mt-2 flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setRating(rating === star ? 0 : star)}
                          className={cn("text-2xl transition-colors", star <= rating ? "text-amber-400" : "text-gray-300 hover:text-amber-300")}
                        >★</button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === "date" && (
              <>
                {!datesLoaded ? <p className="text-sm text-gray-400">Caricamento...</p> : (
                  <>
                    {dates.length === 0 && <p className="text-sm text-gray-300">Nessuna data aggiunta.</p>}
                    {dates.map((d, idx) => (
                      <div key={d.id ?? d._tempId} className="rounded-lg border border-gray-200 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-400">Data {idx + 1}</span>
                          <button type="button" onClick={() => removeDate(idx)} className="text-xs text-red-500 hover:text-red-600">Rimuovi</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" value={d.date ?? ""} onChange={(e) => updateDate(idx, "date", e.target.value)} className={fieldCls} />
                          <EditableSelect listKey="housing_date_type" value={d.type ?? ""} onChange={(v) => updateDate(idx, "type", v)} placeholder="Tipo..." />
                        </div>
                        <input type="text" value={d.notes ?? ""} onChange={(e) => updateDate(idx, "notes", e.target.value)} className={fieldCls} placeholder="Note" />
                      </div>
                    ))}
                    <button type="button" onClick={addDate}
                      className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-400 hover:border-maple-400 hover:text-maple-600 transition-colors"
                    >+ Aggiungi data</button>
                  </>
                )}
              </>
            )}

            {section === "contatti" && (
              <>
                {!contactsLoaded ? <p className="text-sm text-gray-400">Caricamento...</p> : (
                  <>
                    {contacts.length === 0 && <p className="text-sm text-gray-300">Nessun contatto aggiunto.</p>}
                    {contacts.map((c, idx) => (
                      <div key={c.id ?? c._tempId} className="rounded-lg border border-gray-200 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-400">Contatto {idx + 1}</span>
                          <button type="button" onClick={() => removeContact(idx)} className="text-xs text-red-500 hover:text-red-600">Rimuovi</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={c.name ?? ""} onChange={(e) => updateContact(idx, "name", e.target.value)} className={fieldCls} placeholder="Nome *" />
                          <EditableSelect listKey="contact_role" value={c.role ?? ""} onChange={(v) => updateContact(idx, "role", v)} placeholder="Ruolo..." />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="email" value={c.email ?? ""} onChange={(e) => updateContact(idx, "email", e.target.value)} className={fieldCls} placeholder="Email" />
                          <input type="tel" value={c.phone ?? ""} onChange={(e) => updateContact(idx, "phone", e.target.value)} className={fieldCls} placeholder="Telefono" />
                        </div>
                        <input type="text" value={c.notes ?? ""} onChange={(e) => updateContact(idx, "notes", e.target.value)} className={fieldCls} placeholder="Note contatto" />
                      </div>
                    ))}
                    <button type="button" onClick={addContact}
                      className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-400 hover:border-maple-400 hover:text-maple-600 transition-colors"
                    >+ Aggiungi contatto</button>
                  </>
                )}
              </>
            )}

            {section === "offerta" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Importo offerta (CAD/mese)</label>
                    <input type="text" inputMode="decimal" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value.replace(",", "."))} className={inputCls} placeholder="1900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Scadenza risposta</label>
                    <input type="date" value={offerDeadline} onChange={(e) => setOfferDeadline(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Note offerta</label>
                  <textarea value={offerNotes} onChange={(e) => setOfferNotes(e.target.value)} rows={3} className={cn(inputCls, "resize-none")} placeholder="Condizioni proposte, negoziazione..." />
                </div>
              </>
            )}

            {section === "condizioni" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Utenze incluse</label>
                    <select value={utilitiesIncluded} onChange={(e) => setUtilitiesIncluded(e.target.value as TriState | "")} className={inputCls}>
                      <option value="">—</option>
                      {TRI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Stima utenze (CAD)</label>
                    <input type="text" inputMode="decimal" value={utilitiesEstimate} onChange={(e) => setUtilitiesEstimate(e.target.value.replace(",", "."))} className={inputCls} placeholder="150" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Spese condominiali incluse</label>
                    <select value={condoFeesIncluded === null ? "" : condoFeesIncluded ? "si" : "no"} onChange={(e) => setCondoFeesIncluded(e.target.value === "" ? null : e.target.value === "si")} className={inputCls}>
                      <option value="">—</option>
                      <option value="si">Sì</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Importo condominio (CAD)</label>
                    <input type="text" inputMode="decimal" value={condoFeesCad} onChange={(e) => setCondoFeesCad(e.target.value.replace(",", "."))} className={inputCls} placeholder="200" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Arredato</label>
                    <select value={furnished} onChange={(e) => setFurnished(e.target.value as TriState | "")} className={inputCls}>
                      <option value="">—</option>
                      {TRI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Note arredamento</label>
                    <input type="text" value={furnishedNotes} onChange={(e) => setFurnishedNotes(e.target.value)} className={inputCls} placeholder="Manca letto, lavatrice..." />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Caparra (CAD)</label>
                    <input type="text" inputMode="decimal" value={depositCad} onChange={(e) => setDepositCad(e.target.value.replace(",", "."))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Mesi anticipo</label>
                    <input type="number" min="0" value={advanceMonths} onChange={(e) => setAdvanceMonths(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Durata min. (mesi)</label>
                    <input type="number" min="0" value={minLeaseMonths} onChange={(e) => setMinLeaseMonths(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Clausole recesso / penali</label>
                  <textarea value={cancellationTerms} onChange={(e) => setCancellationTerms(e.target.value)} rows={2} className={cn(inputCls, "resize-none")} placeholder="60 giorni di preavviso..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Note contrattuali</label>
                  <textarea value={contractNotes} onChange={(e) => setContractNotes(e.target.value)} rows={2} className={cn(inputCls, "resize-none")} />
                </div>
              </>
            )}

            {section === "note" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Pro</label>
                  <textarea value={pros} onChange={(e) => setPros(e.target.value)} rows={3} className={cn(inputCls, "resize-none")} placeholder="Luminoso, vicino alla metro..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Contro</label>
                  <textarea value={cons} onChange={(e) => setCons(e.target.value)} rows={3} className={cn(inputCls, "resize-none")} placeholder="Rumoroso, senza lavastoviglie..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Note generali</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={cn(inputCls, "resize-none")} />
                </div>
              </>
            )}
        {saveError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</p>
        )}
      </form>
    </ModalShell>
  );
}
