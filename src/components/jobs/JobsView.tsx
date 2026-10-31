"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { JobApplication, JobStatus, JobContact, JobInterview, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { daysUntil, formatDate, todayKey } from "@/lib/dates";
import { openReceipt as openStoredFile, removeReceipt as removeStoredFile } from "@/lib/receipts";
import { toast } from "@/components/ui/Toaster";
import { Card, CardContent } from "@/components/ui/card";
import DetailSheet, { DetailRow } from "@/components/ui/DetailSheet";
import {
  Plus,
  Pencil,
  Trash2,
  Briefcase,
  MapPin,
  ExternalLink,
  User,
  Calendar,
  LayoutList,
  Columns3,
  Users,
  Phone,
  Mail,
  Search,
  Clock,
  FileText,
  ChevronDown,
} from "lucide-react";
import JobModal from "./JobModal";
import { JOB_STATUSES, jobStatus } from "./status";
import { FOLLOWUP_DAYS } from "@/lib/job-followup-rules";

type SortMode = "recent" | "updated" | "company";

interface Props {
  initialItems: JobApplication[];
  profiles: Pick<Profile, "id" | "full_name">[];
  currentUserId: string;
  /** oggi nel fuso dell'utente (dal server: niente differenze tra pagina e app) */
  today: string;
  /** candidatura da aprire subito (link da notifica: /jobs?id=...) */
  initialOpenId?: string | null;
}

export default function JobsView({ initialItems, profiles, currentUserId, today, initialOpenId = null }: Props) {
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<"list" | "board">("list");
  const [filterStatus, setFilterStatus] = useState<JobStatus | "all">("all");
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<JobApplication | null>(null);
  // la scheda segue la candidatura nella lista (es. dopo un cambio di stato)
  const [sheetId, setSheetId] = useState<string | null>(initialOpenId);
  const sheetItem = sheetId ? items.find((i) => i.id === sheetId) ?? null : null;
  const supabase = createClient();
  const router = useRouter();

  const getOwnerName = (ownerId: string | null) => (ownerId ? profiles.find((p) => p.id === ownerId)?.full_name ?? null : null);

  // filtri a cascata: persona → stato → ricerca. I conteggi degli stati rispettano persona e ricerca
  const q = query.trim().toLowerCase();
  const byOwnerAndQuery = items.filter((item) => {
    if (filterOwner !== "all" && item.owner_id !== filterOwner) return false;
    if (q && ![item.company, item.role, item.location, item.platform, item.notes].some((v) => v?.toLowerCase().includes(q))) return false;
    return true;
  });
  const filtered = byOwnerAndQuery
    .filter((item) => filterStatus === "all" || item.status === filterStatus)
    .sort((a, b) => {
      if (sortMode === "company") return a.company.localeCompare(b.company, "it", { sensitivity: "base" });
      if (sortMode === "updated") return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      // più recenti: data di candidatura (o di inserimento, per quelle da inviare)
      return (b.applied_date ?? b.created_at.slice(0, 10)).localeCompare(a.applied_date ?? a.created_at.slice(0, 10))
        || b.created_at.localeCompare(a.created_at);
    });

  // con "Più recenti" la lista è divisa per giorno di candidatura (quelle senza data in cima)
  const groups: { key: string; label: string; items: JobApplication[] }[] = [];
  if (sortMode === "recent") {
    for (const item of filtered) {
      const key = item.applied_date ?? "";
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(item);
      else groups.push({ key, label: key ? dayLabel(key, today) : "Da inviare", items: [item] });
    }
  } else {
    groups.push({ key: "all", label: "", items: filtered });
  }

  function openNew() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEdit(item: JobApplication) {
    setEditingItem(item);
    setModalOpen(true);
  }

  function handleSaved(item: JobApplication) {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) return prev.map((i) => (i.id === item.id ? item : i));
      return [item, ...prev];
    });
    setModalOpen(false);
    setEditingItem(null);
    router.refresh();
  }

  async function handleDelete(id: string) {
    const before = items;
    const target = items.find((i) => i.id === id);
    setSheetId(null);
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase.from("job_applications").delete().eq("id", id);
    if (error) {
      setItems(before);
      toast(`Candidatura non eliminata: ${error.message}`, "error");
      return;
    }
    // contatti e colloqui spariscono con la candidatura (cascade); il file dell'annuncio va tolto a mano
    if (target?.listing_file_path) removeStoredFile(supabase, target.listing_file_path);
    router.refresh();
  }

  async function handleStatusChange(id: string, status: JobStatus) {
    const before = items;
    const current = items.find((i) => i.id === id);
    // passando a "Inviata" senza data, la candidatura è di oggi
    const patch: Partial<JobApplication> = { status, updated_at: new Date().toISOString() };
    if (status === "inviata" && current && !current.applied_date) patch.applied_date = todayKey();
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("job_applications").update(patch).eq("id", id);
    if (error) {
      setItems(before);
      toast(`Stato non aggiornato: ${error.message}`, "error");
      return;
    }
    router.refresh();
  }

  const chipCls = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors";
  const countCls = "rounded-full bg-black/5 px-1.5 text-xs font-semibold";

  return (
    <>
      {/* Persone (se le candidature sono di più persone) + azioni da PC */}
      <div className="flex items-center gap-2">
        {profiles.length > 1 && (
          <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5">
            {[{ id: "all", full_name: "Tutti" }, ...profiles].map((p) => {
              const count = p.id === "all" ? items.length : items.filter((i) => i.owner_id === p.id).length;
              const active = filterOwner === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setFilterOwner(p.id)}
                  className={cn(chipCls, active ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50")}
                >
                  {p.id !== "all" && <User className="h-3.5 w-3.5" />}
                  {p.full_name}
                  <span className={cn(countCls, active && "bg-white/20")}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {([
              { key: "list", label: "Lista", Icon: LayoutList },
              { key: "board", label: "Bacheca", Icon: Columns3 },
            ] as const).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                  view === key ? "bg-maple-500 text-white" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuova candidatura
          </button>
        </div>
      </div>

      {/* Stati con conteggio: sono anche il filtro (colori come i chip di Google Sheets) */}
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
        <button
          onClick={() => setFilterStatus("all")}
          className={cn(chipCls, filterStatus === "all" ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50")}
        >
          Tutti gli stati
          <span className={cn(countCls, filterStatus === "all" && "bg-white/20")}>{byOwnerAndQuery.length}</span>
        </button>
        {JOB_STATUSES.map((s) => {
          const count = byOwnerAndQuery.filter((i) => i.status === s.value).length;
          const active = filterStatus === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setFilterStatus(active ? "all" : s.value)}
              className={cn(
                chipCls,
                active ? cn(s.chip, "ring-2 ring-gray-900/70") : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50",
                !active && count === 0 && "opacity-50"
              )}
            >
              {!active && <span className={cn("h-2 w-2 rounded-full", s.dot)} />}
              {s.label}
              <span className={countCls}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Ricerca + ordinamento */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca azienda, ruolo, città..."
            className="block w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
          />
        </div>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          aria-label="Ordina"
          className="w-[8.5rem] shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm text-gray-700 shadow-sm focus:border-maple-400 focus:outline-none sm:w-auto"
        >
          <option value="recent">Più recenti</option>
          <option value="updated">Aggiornate</option>
          <option value="company">Azienda A–Z</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
              <Briefcase className="h-6 w-6" />
            </div>
            <p className="text-sm text-gray-500">
              {items.length === 0 ? "Nessuna candidatura. Aggiungine una!" : "Nessuna candidatura con questi filtri."}
            </p>
          </CardContent>
        </Card>
      ) : view === "board" ? (
        <>
          {/* la bacheca a colonne ha senso solo su schermi larghi: su telefono resta la lista */}
          <div className="no-scrollbar hidden gap-3 overflow-x-auto pb-4 lg:flex">
            {JOB_STATUSES.filter((s) => filterStatus === "all" || s.value === filterStatus).map((col) => {
              const colItems = filtered.filter((i) => i.status === col.value);
              return (
                <div key={col.value} className="w-72 flex-shrink-0">
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <span className={cn("rounded-full px-2.5 py-1 text-sm font-medium", col.chip)}>{col.label}</span>
                    <span className="text-sm text-gray-500">{colItems.length}</span>
                  </div>
                  <div className="max-h-[65vh] space-y-2 overflow-y-auto rounded-xl bg-gray-100/70 p-2 ring-1 ring-gray-200/60">
                    {colItems.length === 0 ? (
                      <p className="py-6 text-center text-sm text-gray-400">Nessuna</p>
                    ) : (
                      colItems.map((item) => (
                        <JobCard key={item.id} item={item} today={today} ownerName={getOwnerName(item.owner_id)} onOpen={() => setSheetId(item.id)} onStatusChange={handleStatusChange} compact />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid gap-2 lg:hidden">
            {filtered.map((item) => (
              <JobCard key={item.id} item={item} today={today} ownerName={getOwnerName(item.owner_id)} onOpen={() => setSheetId(item.id)} onStatusChange={handleStatusChange} />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key} className="space-y-1.5">
              {g.label && (
                <h3 className="flex items-baseline justify-between px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <span>{g.label}</span>
                  <span className="font-medium normal-case tracking-normal">{g.items.length} {g.items.length === 1 ? "candidatura" : "candidature"}</span>
                </h3>
              )}
              <div className="grid gap-2 lg:grid-cols-2">
                {g.items.map((item) => (
                  <JobCard key={item.id} item={item} today={today} ownerName={getOwnerName(item.owner_id)} onOpen={() => setSheetId(item.id)} onStatusChange={handleStatusChange} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* telefono: nuova candidatura dal + in basso (come nel Budget) */}
      <button
        onClick={openNew}
        aria-label="Nuova candidatura"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-maple-500 text-white shadow-lg shadow-maple-500/30 transition-transform active:scale-95 lg:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      {modalOpen && (
        <JobModal
          item={editingItem}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => { setModalOpen(false); setEditingItem(null); }}
          onSaved={handleSaved}
        />
      )}

      {sheetItem && !modalOpen && (
        <JobDetailSheet
          item={sheetItem}
          today={today}
          ownerName={getOwnerName(sheetItem.owner_id)}
          onClose={() => setSheetId(null)}
          onEdit={() => openEdit(sheetItem)}
          onDelete={() => { if (confirm(`Eliminare la candidatura a ${sheetItem.company}?`)) handleDelete(sheetItem.id); }}
          onStatusChange={(s) => handleStatusChange(sheetItem.id, s)}
        />
      )}
    </>
  );
}

/** Chip di stato che è anche un menu: si cambia lo stato senza aprire la candidatura. */
function StatusSelect({ value, onChange, size = "sm" }: { value: JobStatus; onChange: (s: JobStatus) => void; size?: "sm" | "md" }) {
  const s = jobStatus(value);
  return (
    <span className="relative inline-flex shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as JobStatus)}
        aria-label="Stato della candidatura"
        className={cn(
          "cursor-pointer appearance-none rounded-full border-0 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/30",
          size === "md" ? "py-1.5 pl-3.5 pr-8 text-sm" : "py-1 pl-3 pr-7 text-[13px]",
          s.chip
        )}
      >
        {JOB_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-70", size === "md" ? "right-2.5 h-4 w-4" : "right-2 h-3.5 w-3.5", s.chip.split(" ").find((c) => c.startsWith("text-")))} />
    </span>
  );
}

/** Scheda della candidatura in lista: tocco = dettaglio (con le azioni). */
function JobCard({
  item, today, ownerName, onOpen, onStatusChange, compact = false,
}: {
  item: JobApplication;
  today: string;
  ownerName: string | null;
  onOpen: () => void;
  onStatusChange: (id: string, status: JobStatus) => void;
  compact?: boolean;
}) {
  return (
    <Card className={cn("py-0 transition-shadow hover:shadow-md", item.status === "rifiutata" && "opacity-75")}>
      <CardContent className="p-0">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
          className={cn("cursor-pointer space-y-1.5 text-left", compact ? "px-3 py-2.5" : "px-3.5 py-3")}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cn("truncate font-semibold text-gray-900", compact ? "text-sm" : "text-[15px]")}>{item.company}</p>
              <p className="truncate text-sm text-gray-600">{item.role}</p>
            </div>
            <StatusSelect value={item.status} onChange={(s) => onStatusChange(item.id, s)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {ownerName && (
              <span className="inline-flex items-center gap-1 font-medium text-indigo-600">
                <User className="h-3.5 w-3.5" />
                {ownerName}
              </span>
            )}
            {item.location && !compact && (
              <span className="inline-flex min-w-0 max-w-[14rem] items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.location}</span>
              </span>
            )}
            {item.applied_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(item.applied_date, { day: "numeric", month: "short" })}
              </span>
            )}
            <WaitingBadge item={item} today={today} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function dayLabel(date: string, today: string) {
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

/**
 * Da quanti giorni una candidatura inviata aspetta risposta. Dal 30° giorno diventa
 * ambra: è il momento di un ping all'azienda (al 40° passa da sola a "Nessuna risposta").
 */
function WaitingBadge({ item, today }: { item: JobApplication; today: string }) {
  if (item.status !== "inviata" || !item.applied_date) return null;
  const days = -daysUntil(item.applied_date, today);
  if (days < 1) return null;
  const late = days >= FOLLOWUP_DAYS;
  return (
    <span
      title={late ? "Nessuna risposta da un mese: fai un ping all'azienda" : "Giorni dall'invio"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        late ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {late ? `${days} g · fai un ping?` : `${days} g`}
    </span>
  );
}

/* ─── Dettaglio (sola lettura + azioni; carica contatti e colloqui) ─── */

function JobDetailSheet({
  item, today, ownerName, onClose, onEdit, onDelete, onStatusChange,
}: {
  item: JobApplication;
  today: string;
  ownerName: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: JobStatus) => void;
}) {
  const [contacts, setContacts] = useState<JobContact[]>([]);
  const [interviews, setInterviews] = useState<JobInterview[]>([]);
  const [showListing, setShowListing] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.from("job_contacts").select("*").eq("job_id", item.id).order("created_at").then(({ data }) => {
      setContacts(data ?? []);
    });
    supabase.from("job_interviews").select("*").eq("job_id", item.id).order("date").then(({ data }) => {
      setInterviews(data ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const actionCls = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

  return (
    <DetailSheet title={item.company} subtitle={item.role} onClose={onClose}>
      {/* stato e azioni subito in alto */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusSelect value={item.status} onChange={onStatusChange} size="md" />
        <WaitingBadge item={item} today={today} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onEdit} className={cn(actionCls, "bg-maple-500 text-white hover:bg-maple-600")}>
          <Pencil className="h-4 w-4" />
          Modifica
        </button>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={cn(actionCls, "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
            <ExternalLink className="h-4 w-4" />
            Annuncio
          </a>
        )}
        {item.listing_file_path && (
          <button
            onClick={async () => { if (!(await openStoredFile(item.listing_file_path!))) toast("Impossibile aprire il file, riprova.", "error"); }}
            className={cn(actionCls, "bg-gray-100 text-gray-700 hover:bg-gray-200")}
          >
            <FileText className="h-4 w-4" />
            File annuncio
          </button>
        )}
        <button onClick={onDelete} className={cn(actionCls, "ml-auto text-red-600 hover:bg-red-50")}>
          <Trash2 className="h-4 w-4" />
          Elimina
        </button>
      </div>

      <div className="space-y-0.5 border-t border-gray-100 pt-2">
        <DetailRow label="Persona">{ownerName ?? <span className="text-gray-300">—</span>}</DetailRow>
        <DetailRow label="Candidatura">
          {item.applied_date
            ? formatDate(item.applied_date, { day: "numeric", month: "long", year: "numeric" })
            : <span className="text-gray-300">—</span>}
        </DetailRow>
        <DetailRow label="Piattaforma">{item.platform ?? <span className="text-gray-300">—</span>}</DetailRow>
        <DetailRow label="Città / Zona">{item.location ?? <span className="text-gray-300">—</span>}</DetailRow>
        <DetailRow label="Stipendio">{item.salary_range ?? <span className="text-gray-300">—</span>}</DetailRow>
        {item.benefits && <DetailRow label="Benefits">{item.benefits}</DetailRow>}
        {item.attachments_sent && item.attachments_sent.length > 0 && (
          <DetailRow label="Inviati">
            <span className="flex flex-wrap gap-1">
              {item.attachments_sent.map((a) => (
                <span key={a} className="rounded-full bg-maple-50 px-2 py-0.5 text-xs font-medium text-maple-600">{a}</span>
              ))}
            </span>
          </DetailRow>
        )}
        {/* campo contatto delle prime versioni (prima dei contatti multipli): se c'è, si vede */}
        {item.contact && <DetailRow label="Contatto">{item.contact}</DetailRow>}
      </div>

      {item.notes && (
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Note</p>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{item.notes}</p>
        </div>
      )}

      {interviews.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Calendar className="h-3.5 w-3.5" />
            Colloqui
          </p>
          <div className="space-y-2">
            {interviews.map((iv) => (
              <div key={iv.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-800">
                    {iv.date
                      ? new Date(iv.date).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "Data da definire"}
                  </span>
                  {iv.interview_type && (
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", jobStatus("colloquio").chip)}>{iv.interview_type}</span>
                  )}
                </div>
                {iv.notes && <p className="mt-0.5 text-sm text-gray-600">{iv.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Users className="h-3.5 w-3.5" />
            Contatti
          </p>
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-800">{c.name}</span>
                  {c.role && <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200">{c.role}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-maple-600 hover:underline">
                      <Mail className="h-3.5 w-3.5" />
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-maple-600 hover:underline">
                      <Phone className="h-3.5 w-3.5" />
                      {c.phone}
                    </a>
                  )}
                </div>
                {c.notes && <p className="mt-0.5 text-sm italic text-gray-500">{c.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {item.listing_text && (
        <div className="border-t border-gray-100 pt-3">
          <button
            onClick={() => setShowListing((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500"
            aria-expanded={showListing}
          >
            Testo dell&apos;annuncio
            <ChevronDown className={cn("h-4 w-4 transition-transform", showListing && "rotate-180")} />
          </button>
          {showListing && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.listing_text}</p>}
        </div>
      )}

      <p className="border-t border-gray-100 pt-2 text-xs text-gray-400">
        Inserita il {new Date(item.created_at).toLocaleDateString("it-IT")} · aggiornata il {new Date(item.updated_at).toLocaleDateString("it-IT")}
      </p>
    </DetailSheet>
  );
}
