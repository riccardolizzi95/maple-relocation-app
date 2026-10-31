import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embed, chunkText } from "@/lib/ai/nvidia";

// Vercel: l'ingestione di documenti (parsing + embeddings) può superare i 10s di default
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const EMBED_BATCH = 16;

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) };
  return { supabase, user };
}

/** Estrae il testo da un file caricato (txt, md, pdf). */
async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const buf = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } finally {
      await parser.destroy();
    }
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return await file.text();
  }
  throw new Error("Formato non supportato: usa .pdf, .txt o .md");
}

async function ingest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  name: string,
  type: "document" | "conversation" | "manual",
  text: string
) {
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("Nessun testo estraibile dal contenuto");

  const { data: source, error: srcErr } = await supabase
    .from("knowledge_sources")
    .insert({ name, type, created_by: userId })
    .select()
    .single();
  if (srcErr || !source) throw new Error("Impossibile creare la fonte");

  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const embeddings = await embed(batch, "passage");
      const rows = batch.map((content, j) => ({
        source_id: source.id,
        content,
        embedding: JSON.stringify(embeddings[j]),
      }));
      const { error: insErr } = await supabase.from("knowledge_chunks").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
  } catch (err) {
    // rollback della fonte se l'ingestione fallisce
    await supabase.from("knowledge_sources").delete().eq("id", source.id);
    throw err;
  }

  return { sourceId: source.id, chunks: chunks.length };
}

/** POST: multipart con "file", oppure JSON {name, text} per salvare contenuti dalla chat. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "File mancante" }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File troppo grande (max 5 MB)" }, { status: 400 });
      }
      const text = await extractText(file);
      const result = await ingest(supabase, user.id, file.name, "document", text);
      return NextResponse.json({ ok: true, ...result });
    }

    const { name, text } = await request.json();
    if (!name || !text) {
      return NextResponse.json({ error: "Nome e testo obbligatori" }, { status: 400 });
    }
    const result = await ingest(supabase, user.id, name, "conversation", text);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET: lista fonti con numero di blocchi. Con ?id=<sourceId> restituisce i blocchi della fonte. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const sourceId = request.nextUrl.searchParams.get("id");
  if (sourceId) {
    const { data: chunks, error } = await supabase
      .from("knowledge_chunks")
      .select("id, content, created_at")
      .eq("source_id", sourceId)
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ chunks: chunks ?? [] });
  }

  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("*, knowledge_chunks(count), owner:profiles!knowledge_sources_owner_id_fkey(full_name)")
    .order("created_at", { ascending: false });

  const result = (sources ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    trusted: s.trusted,
    owner_name: (s.owner as unknown as { full_name: string } | null)?.full_name ?? null,
    created_at: s.created_at,
    chunks: (s.knowledge_chunks as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ sources: result });
}

/** PATCH: {id, trusted} — segna una fonte come affidabile (o no). */
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id, trusted } = await request.json();
  if (!id || typeof trusted !== "boolean") {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }
  const { error } = await supabase
    .from("knowledge_sources")
    .update({ trusted })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE ?id=<sourceId> elimina fonte e blocchi; ?chunkId=<id> elimina un singolo blocco. */
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const chunkId = request.nextUrl.searchParams.get("chunkId");
  if (chunkId) {
    const { error } = await supabase.from("knowledge_chunks").delete().eq("id", chunkId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  const { error } = await supabase.from("knowledge_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
