"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import DetailSheet, { DetailRow } from "@/components/ui/DetailSheet";
import type { Ticket } from "./TicketsView";
import {
  Bug,
  Lightbulb,
  Smartphone,
  Monitor,
  Download,
  Trash2,
  CheckCheck,
  RotateCcw,
  Wrench,
  Plus,
  ArrowRight,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";

export interface TicketEvent {
  id: string;
  ticket_id: string;
  type: "creato" | "stato" | "fix" | "riaperto" | "risolto" | "commento";
  message: string | null;
  old_status: string | null;
  new_status: string | null;
  author_id: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  "aperto": "Aperto",
  "in-lavorazione": "In lavorazione",
  "da-verificare": "Da verificare",
  "risolto": "Risolto",
};

const EVENT_META: Record<TicketEvent["type"], { icon: typeof Plus; cls: string; label: string }> = {
  creato: { icon: Plus, cls: "bg-gray-100 text-gray-500", label: "Ticket aperto" },
  stato: { icon: ArrowRight, cls: "bg-blue-50 text-blue-600", label: "Cambio stato" },
  fix: { icon: Wrench, cls: "bg-purple-50 text-purple-600", label: "Fix applicato" },
  riaperto: { icon: RotateCcw, cls: "bg-amber-50 text-amber-600", label: "Riaperto" },
  risolto: { icon: CheckCheck, cls: "bg-emerald-50 text-emerald-600", label: "Confermato risolto" },
  commento: { icon: MessageSquare, cls: "bg-maple-50 text-maple-500", label: "Commento" },
};

function eventTitle(ev: TicketEvent): string {
  if (ev.type === "stato" && ev.old_status && ev.new_status) {
    return `${STATUS_LABEL[ev.old_status] ?? ev.old_status} → ${STATUS_LABEL[ev.new_status] ?? ev.new_status}`;
  }
  return EVENT_META[ev.type].label;
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  ticket: Ticket;
  authorName: (id: string | null) => string;
  currentUserId: string;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Ticket>) => Promise<void>;
  onDelete: (id: string) => void;
  onExport: (t: Ticket) => void;
}

export default function TicketDetail({
  ticket,
  authorName,
  currentUserId,
  onClose,
  onPatch,
  onDelete,
  onExport,
}: Props) {
  const [events, setEvents] = useState<TicketEvent[] | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenText, setReopenText] = useState("");
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Chi ha scritto un evento: null = update via SQL diretto (Claude)
  const eventAuthor = (ev: TicketEvent) =>
    ev.author_id ? authorName(ev.author_id) : "Claude";

  async function loadEvents() {
    const { data } = await supabase
      .from("ticket_events")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true });
    setEvents((data as TicketEvent[]) ?? []);
  }

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, ticket.status]);

  async function sendComment() {
    const text = comment.trim();
    if (!text || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("ticket_events")
      .insert({ ticket_id: ticket.id, type: "commento", message: text, author_id: currentUserId })
      .select()
      .single();
    setSending(false);
    if (!error && data) {
      setEvents((prev) => [...(prev ?? []), data as TicketEvent]);
      setComment("");
    }
  }

  async function confirmResolved() {
    await onPatch(ticket.id, { status: "risolto" });
  }

  async function submitReopen() {
    if (!reopenText.trim()) return;
    await onPatch(ticket.id, { status: "aperto", reopen_reason: reopenText.trim() });
    setReopening(false);
    setReopenText("");
  }

  const isOwner = ticket.created_by === currentUserId;
  const canVerify = ticket.status === "da-verificare" && isOwner;

  return (
    <DetailSheet
      title={ticket.title}
      subtitle={`${ticket.page ?? "Generale"} · aperto da ${authorName(ticket.created_by)}`}
      onClose={onClose}
    >
      {/* Badge riga */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            ticket.type === "bug" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
          )}
        >
          {ticket.type === "bug" ? <Bug className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
          {ticket.type === "bug" ? "Bug" : "Miglioria"}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            {
              "aperto": "bg-amber-50 text-amber-700",
              "in-lavorazione": "bg-blue-50 text-blue-700",
              "da-verificare": "bg-purple-50 text-purple-700",
              "risolto": "bg-emerald-50 text-emerald-700",
            }[ticket.status]
          )}
        >
          {STATUS_LABEL[ticket.status]}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
          priorità {ticket.priority}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
          {ticket.origin === "mobile" ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
          {ticket.origin ?? "?"}
        </span>
      </div>

      {/* Verifica risoluzione — il blocco più importante quando tocca all'utente */}
      {canVerify && (
        <div className="rounded-xl bg-purple-50 p-3 ring-1 ring-purple-100">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-purple-800">
            <Wrench className="h-4 w-4" />
            Fix applicato, tocca a te
          </p>
          {ticket.resolution_note && (
            <p className="mt-1.5 text-xs leading-relaxed text-purple-800/90">{ticket.resolution_note}</p>
          )}
          {reopening ? (
            <div className="mt-2.5 space-y-2">
              <textarea
                value={reopenText}
                onChange={(e) => setReopenText(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Spiega cosa non funziona ancora: cosa vedi, dove, su quale dispositivo..."
                className="block w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitReopen}
                  disabled={!reopenText.trim()}
                  className="rounded-lg bg-maple-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
                >
                  Riapri ticket
                </button>
                <button
                  onClick={() => { setReopening(false); setReopenText(""); }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={confirmResolved}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Confermo risolto
              </button>
              <button
                onClick={() => setReopening(true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 shadow-sm hover:bg-purple-50 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Non risolto
              </button>
            </div>
          )}
        </div>
      )}
      {ticket.status === "da-verificare" && !isOwner && (
        <p className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700">
          Fix applicato, in attesa di verifica da parte di {authorName(ticket.created_by)}.
        </p>
      )}

      {/* Dettagli */}
      <div className="space-y-2.5">
        {ticket.description && (
          <DetailRow label={ticket.type === "bug" ? "Cosa succede" : "Richiesta"}>
            <span className="whitespace-pre-wrap">{ticket.description}</span>
          </DetailRow>
        )}
        {ticket.steps && (
          <DetailRow label={ticket.type === "bug" ? "Passi" : "Dettagli"}>
            <span className="whitespace-pre-wrap">{ticket.steps}</span>
          </DetailRow>
        )}
        {ticket.device && <DetailRow label="Dispositivo">{ticket.device}</DetailRow>}
        <DetailRow label="Aperto il">{new Date(ticket.created_at).toLocaleString("it-IT")}</DetailRow>
      </div>

      {/* Storia */}
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">Storia</p>
        {events === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="relative space-y-3 pl-1">
            {/* linea verticale */}
            <div className="absolute top-2 bottom-2 left-[15px] w-px bg-gray-200" aria-hidden />
            {events.map((ev) => {
              const meta = EVENT_META[ev.type];
              const Icon = meta.icon;
              const isClaude = ev.author_id === null;
              return (
                <div key={ev.id} className="relative flex gap-2.5">
                  <div className={cn("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-2 ring-white", meta.cls)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-xs font-medium text-gray-700">
                      {eventTitle(ev)}
                      <span className="ml-1.5 inline-flex items-center gap-0.5 font-normal text-gray-400">
                        {isClaude && <Sparkles className="h-3 w-3" />}
                        {eventAuthor(ev)} · {fmtWhen(ev.created_at)}
                      </span>
                    </p>
                    {ev.message && (
                      <p
                        className={cn(
                          "mt-1 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap",
                          ev.type === "commento"
                            ? "bg-gray-50 text-gray-700 ring-1 ring-gray-100"
                            : ev.type === "fix"
                              ? "bg-purple-50 text-purple-800"
                              : ev.type === "riaperto"
                                ? "bg-amber-50 text-amber-800"
                                : "bg-gray-50 text-gray-600"
                        )}
                      >
                        {ev.message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Composer commento */}
        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={1}
            placeholder="Aggiungi un commento o un dettaglio..."
            className="block max-h-28 min-h-[38px] w-full flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
            }}
          />
          <button
            onClick={sendComment}
            disabled={!comment.trim() || sending}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-maple-500 text-white shadow-sm hover:bg-maple-600 disabled:opacity-40 transition-colors"
            title="Invia commento"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          I commenti finiscono nella storia e nel file per Claude: usali per aggiungere contesto.
        </p>
      </div>

      {/* Azioni secondarie */}
      <div className="flex gap-2 border-t border-gray-100 pt-3">
        <button
          onClick={() => onExport(ticket)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Scarica per Claude
        </button>
        <button
          onClick={() => onDelete(ticket.id)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-500 shadow-sm hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Elimina
        </button>
      </div>
    </DetailSheet>
  );
}
