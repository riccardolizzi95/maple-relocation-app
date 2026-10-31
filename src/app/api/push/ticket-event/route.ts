import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chiamato dal trigger DB (pg_net) quando un ticket cambia stato.
 * Il payload contiene SOLO l'id: destinatari e testo vengono riletti dal DB,
 * quindi una chiamata esterna non può fabbricare notifiche arbitrarie.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ticketId: string | undefined = body?.ticket_id;
  if (!ticketId || !UUID_RE.test(ticketId)) {
    return NextResponse.json({ error: "ticket_id non valido" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "service role mancante" }, { status: 503 });

  const { data: ticket } = await admin
    .from("tickets")
    .select("id, title, status, resolution_note, reopen_reason, created_by")
    .eq("id", ticketId)
    .single();
  if (!ticket) return NextResponse.json({ ok: true, sent: 0, reason: "ticket inesistente" });

  if (ticket.status === "da-verificare") {
    // Fix applicato: avvisa chi ha aperto il ticket
    if (!ticket.created_by) return NextResponse.json({ ok: true, sent: 0 });
    const { sent } = await sendPush([ticket.created_by], {
      title: `Ticket risolto: ${ticket.title}`,
      body: ticket.resolution_note ?? "Verifica e conferma la risoluzione.",
      url: `/tickets?id=${ticket.id}`,
      tag: `tk-verify-${ticket.id}`,
    });
    return NextResponse.json({ ok: true, sent });
  }

  if (ticket.status === "aperto" && ticket.reopen_reason) {
    // Riaperto: avvisa gli admin (escluso chi lo ha riaperto)
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    const targets = (admins ?? []).map((a) => a.id).filter((id) => id !== ticket.created_by);
    const { sent } = await sendPush(targets, {
      title: `Ticket riaperto: ${ticket.title}`,
      body: ticket.reopen_reason,
      url: `/tickets?id=${ticket.id}`,
      tag: `tk-reopen-${ticket.id}`,
    });
    return NextResponse.json({ ok: true, sent });
  }

  return NextResponse.json({ ok: true, sent: 0 });
}
