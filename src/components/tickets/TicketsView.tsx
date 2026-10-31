"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { todayKey } from "@/lib/dates";
import ModalShell from "@/components/ui/ModalShell";
import TicketDetail, { TicketEvent } from "./TicketDetail";
import {
  Bug,
  Lightbulb,
  Plus,
  Download,
  Smartphone,
  Monitor,
  Wrench,
  ChevronRight,
} from "lucide-react";

export interface Ticket {
  id: string;
  title: string;
  type: "bug" | "miglioria";
  page: string | null;
  priority: "alta" | "media" | "bassa";
  status: "aperto" | "in-lavorazione" | "da-verificare" | "risolto";
  description: string | null;
  steps: string | null;
  device: string | null;
  origin: "mobile" | "desktop" | null;
  resolution_note: string | null;
  reopen_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const PAGES = ["Dashboard", "Checklist", "Alloggio", "Lavoro", "Budget", "Documenti", "Guide AI", "Note", "Impostazioni", "Generale"];

const STATUS_STYLE: Record<Ticket["status"], string> = {
  "aperto": "bg-amber-50 text-amber-700",
  "in-lavorazione": "bg-blue-50 text-blue-700",
  "da-verificare": "bg-purple-50 text-purple-700",
  "risolto": "bg-emerald-50 text-emerald-700",
};
const STATUS_LABEL: Record<Ticket["status"], string> = {
  "aperto": "Aperto",
  "in-lavorazione": "In lavorazione",
  "da-verificare": "Da verificare",
  "risolto": "Risolto",
};

interface Props {
  initialTickets: Ticket[];
  profiles: { id: string; full_name: string }[];
  currentUserId: string;
}

const EVENT_LABEL: Record<TicketEvent["type"], string> = {
  creato: "ticket aperto",
  stato: "cambio stato",
  fix: "fix applicato (da-verificare)",
  riaperto: "riaperto",
  risolto: "confermato risolto",
  commento: "commento",
};

/** Genera il markdown strutturato di un ticket (storia inclusa), pronto da consegnare a Claude Code. */
function ticketToMarkdown(t: Ticket, authorName: (id: string | null) => string, events: TicketEvent[]): string {
  const history = events
    .map((ev) => {
      const who = ev.author_id ? authorName(ev.author_id) : "Claude";
      const when = new Date(ev.created_at).toLocaleString("it-IT");
      const detail =
        ev.type === "stato" && ev.old_status && ev.new_status
          ? `${ev.old_status} → ${ev.new_status}`
          : EVENT_LABEL[ev.type];
      return `- ${when} — **${who}** — ${detail}${ev.message ? `: ${ev.message}` : ""}`;
    })
    .join("\n");

  return `# Ticket Maple — ${t.type === "bug" ? "BUG" : "MIGLIORIA"}: ${t.title}

> Istruzioni per Claude Code: questo ticket arriva dall'app Maple
> (repo nella cartella maple/, Next.js 16 + Supabase + Tailwind).
> Leggi CLAUDE.md per lo stato del progetto, individua i file coinvolti
> partendo dalla sezione indicata, applica la correzione/miglioria
> mantenendo intatte le funzionalità esistenti, poi commit + push.
> A fix fatto: segna il ticket come "da-verificare" nel DB (tabella
> tickets) compilando resolution_note con cosa hai cambiato — il cambio
> di stato finisce da solo nella storia (trigger su ticket_events).
> Leggi la sezione Storia qui sotto: contiene commenti e riaperture
> con contesto aggiuntivo dell'utente.

## Dettagli
- **ID**: ${t.id}
- **Tipo**: ${t.type}
- **Sezione app**: ${t.page ?? "non indicata"}
- **Origine**: ${t.origin ?? "?"} (${t.device ?? "dispositivo non indicato"})
- **Priorità**: ${t.priority}
- **Stato**: ${STATUS_LABEL[t.status]}
- **Aperto da**: ${authorName(t.created_by)}
- **Data**: ${new Date(t.created_at).toLocaleString("it-IT")}

## Descrizione
${t.description ?? "(vuota)"}

${t.steps ? `## Passi per riprodurre / dettagli\n${t.steps}\n\n` : ""}## Storia
${history || "(nessun evento registrato)"}

## Criteri di completamento
- Il comportamento descritto è ${t.type === "bug" ? "corretto" : "implementato"}
- Nessuna regressione sulle funzionalità esistenti della sezione
- Verificato su mobile (uso principale dell'app)
- Ticket segnato "da-verificare" con resolution_note; CLAUDE.md aggiornato; commit + push
`;
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TicketsView({ initialTickets, profiles, currentUserId }: Props) {
  const [tickets, setTickets] = useState(initialTickets);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Ticket["status"] | "all">("all");
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep-link: /tickets?id=<uuid> apre direttamente la scheda del ticket
  // (usato da notifiche push e campanella). Reagisce anche alle nuove
  // navigazioni quando la pagina è già aperta.
  const urlId = searchParams.get("id");
  const [seenUrlId, setSeenUrlId] = useState<string | null>(null);
  if (urlId !== seenUrlId) {
    // aggiornamento durante il render (pattern React "stato da prop"), niente effetto
    setSeenUrlId(urlId);
    if (urlId) setDetailId(urlId);
  }

  function closeDetail() {
    setDetailId(null);
    if (urlId) router.replace("/tickets"); // ripulisce l'URL così un refresh non riapre
  }

  const authorName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? "—";

  const open = tickets.filter((t) => t.status !== "risolto");
  const detail = detailId ? tickets.find((t) => t.id === detailId) ?? null : null;

  async function updateTicket(id: string, patch: Partial<Ticket>) {
    setTickets((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminare questo ticket? Verrà persa anche la sua storia.")) return;
    closeDetail();
    setTickets((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("tickets").delete().eq("id", id);
    router.refresh();
  }

  async function fetchEvents(ticketIds: string[]): Promise<Map<string, TicketEvent[]>> {
    const { data } = await supabase
      .from("ticket_events")
      .select("*")
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: true });
    const byTicket = new Map<string, TicketEvent[]>();
    for (const ev of (data as TicketEvent[]) ?? []) {
      const list = byTicket.get(ev.ticket_id) ?? [];
      list.push(ev);
      byTicket.set(ev.ticket_id, list);
    }
    return byTicket;
  }

  async function exportOne(t: Ticket) {
    const events = (await fetchEvents([t.id])).get(t.id) ?? [];
    const slug = t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    download(`ticket-${t.type}-${slug}.md`, ticketToMarkdown(t, authorName, events));
  }

  async function exportAllOpen() {
    const byTicket = await fetchEvents(open.map((t) => t.id));
    const content = open
      .map((t) => ticketToMarkdown(t, authorName, byTicket.get(t.id) ?? []))
      .join("\n\n---\n\n");
    download(`tickets-maple-aperti-${todayKey()}.md`, content);
  }

  const visible = statusFilter === "all" ? tickets : tickets.filter((t) => t.status === statusFilter);
  const countBy = (st: Ticket["status"]) => tickets.filter((t) => t.status === st).length;

  return (
    <>
      {/* Contatori per stato + filtro */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
        <button
          onClick={() => setStatusFilter("all")}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            statusFilter === "all" ? "bg-maple-500 text-white shadow-sm" : "bg-white text-gray-500 ring-1 ring-gray-200"
          )}
        >
          Tutti
          <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", statusFilter === "all" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400")}>
            {tickets.length}
          </span>
        </button>
        {(Object.keys(STATUS_LABEL) as Ticket["status"][]).map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === st ? "bg-maple-500 text-white shadow-sm" : "bg-white text-gray-500 ring-1 ring-gray-200"
            )}
          >
            {STATUS_LABEL[st]}
            <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", statusFilter === st ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400")}>
              {countBy(st)}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-gray-500">
          I tuoi ticket{tickets.some((t) => t.created_by !== currentUserId) ? " e quelli degli altri utenti (sei admin)" : ""}.
        </p>
        <div className="flex shrink-0 gap-2">
          {open.length > 0 && (
            <button
              onClick={exportAllOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
              title="Scarica tutti i ticket aperti"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tutti gli aperti</span>
            </button>
          )}
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuovo
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
          {tickets.length === 0
            ? "Nessun ticket. Quando noti un bug o vuoi una miglioria, aprine uno qui."
            : "Nessun ticket in questo stato."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => setDetailId(t.id)}
              className="block w-full rounded-lg bg-white text-left ring-1 ring-foreground/10 transition-shadow hover:shadow-sm active:bg-gray-50"
            >
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  t.type === "bug" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"
                )}>
                  {t.type === "bug" ? <Bug className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{t.title}</p>
                  <p className="flex items-center gap-1 text-[11px] text-gray-400">
                    {t.origin === "mobile" ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                    {t.page ?? "Generale"} · {t.priority} · {authorName(t.created_by)} · {new Date(t.created_at).toLocaleDateString("it-IT")}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-1 text-[11px] font-medium", STATUS_STYLE[t.status])}>
                  {STATUS_LABEL[t.status]}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </div>

              {/* Invito alla verifica: il flusso completo vive nel dettaglio */}
              {t.status === "da-verificare" && t.created_by === currentUserId && (
                <p className="flex items-center gap-1.5 border-t border-gray-200/70 px-3 py-2 text-xs font-medium text-purple-700">
                  <Wrench className="h-3.5 w-3.5" />
                  Fix applicato — apri per verificare
                </p>
              )}
              {t.status === "aperto" && t.reopen_reason && (
                <p className="border-t border-gray-200/70 px-3 py-2 text-xs text-amber-700">
                  <span className="font-semibold">Riaperto:</span> {t.reopen_reason}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {detail && (
        <TicketDetail
          ticket={detail}
          authorName={authorName}
          currentUserId={currentUserId}
          onClose={closeDetail}
          onPatch={updateTicket}
          onDelete={handleDelete}
          onExport={exportOne}
        />
      )}

      {createOpen && (
        <CreateTicketModal
          currentUserId={currentUserId}
          onClose={() => setCreateOpen(false)}
          onCreated={(t) => {
            setTickets((prev) => [t, ...prev]);
            setCreateOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function CreateTicketModal({
  currentUserId,
  onClose,
  onCreated,
}: {
  currentUserId: string;
  onClose: () => void;
  onCreated: (t: Ticket) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"bug" | "miglioria">("bug");
  const [page, setPage] = useState("Generale");
  const [priority, setPriority] = useState<"alta" | "media" | "bassa">("media");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const inputCls =
    "mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const isMobile = window.matchMedia("(max-width: 767px)").matches ||
      /iPhone|Android/i.test(navigator.userAgent);
    const device = `${window.innerWidth}x${window.innerHeight} · ${navigator.userAgent.includes("iPhone") ? "iPhone" : navigator.userAgent.includes("Android") ? "Android" : "Desktop"}`;
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        title: title.trim(),
        type,
        page,
        priority,
        description: description.trim() || null,
        steps: steps.trim() || null,
        device,
        origin: isMobile ? "mobile" : "desktop",
        created_by: currentUserId,
      })
      .select()
      .single();
    setSaving(false);
    if (!error && data) onCreated(data as Ticket);
  }

  const footer = (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors">
        Annulla
      </button>
      <button type="submit" form="ticket-form" disabled={saving} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors">
        {saving ? "Creazione..." : "Crea ticket"}
      </button>
    </div>
  );

  return (
    <ModalShell title="Nuovo ticket" onClose={onClose} footer={footer}>
      <form id="ticket-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {(["bug", "miglioria"] as const).map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setType(tp)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                type === tp
                  ? tp === "bug"
                    ? "border-red-200 bg-red-50 text-red-600"
                    : "border-amber-200 bg-amber-50 text-amber-600"
                  : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
              )}
            >
              {tp === "bug" ? <Bug className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
              {tp === "bug" ? "Bug" : "Miglioria"}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600">Titolo *</label>
          <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="es. La data sfora dallo schermo in Checklist" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-600">Sezione</label>
            <select value={page} onChange={(e) => setPage(e.target.value)} className={inputCls}>
              {PAGES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">Priorità</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as "alta" | "media" | "bassa")} className={inputCls}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="bassa">Bassa</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600">
            {type === "bug" ? "Cosa succede? *" : "Cosa vorresti? *"}
          </label>
          <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder={type === "bug" ? "Descrivi il comportamento sbagliato e quello atteso" : "Descrivi la miglioria e perché è utile"} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600">
            {type === "bug" ? "Passi per riprodurre" : "Dettagli aggiuntivi"}
          </label>
          <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder={type === "bug" ? "1. Apro Budget\n2. Tocco Nuova spesa\n3. ..." : "Esempi, riferimenti, priorità..."} />
        </div>

        <p className="text-[11px] text-gray-400">
          Origine (mobile/desktop), dispositivo e dimensioni schermo vengono allegati automaticamente.
        </p>
      </form>
    </ModalShell>
  );
}
