import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatCompletionStream, embed, type ChatMsg } from "@/lib/ai/nvidia";
import { searchWeb, webSearchAvailable, type WebResult } from "@/lib/ai/websearch";
import { extractAndStoreFacts, loadMemoryBlock, MEMORY_PREFIX } from "@/lib/ai/memory";
import { getTimeZone } from "@/lib/timezone-server";

// Vercel: il default di 10s non basta per LLM + RAG
export const maxDuration = 60;

const BASE_SYSTEM = `Sei l'assistente di Maple, un'app condivisa che aiuta due persone a organizzare un trasferimento all'estero.

Rispondi in italiano, pratico e concreto. Argomenti tipici: burocrazia del paese di destinazione (documenti per lavorare, assicurazione sanitaria, patente), casa, lavoro, banche, telefonia, costi, trasporti, vita quotidiana.

REGOLE SULLE FONTI (importanti):
- Privilegia sempre le fonti ufficiali (siti governativi del paese, della regione e della città di destinazione, aziende di trasporto pubblico e simili). Se citi informazioni prese dal web, indica sempre l'URL.
- Se usi contenuti della sezione "CONOSCENZA CONDIVISA" segnati come [DA CONFERMARE], avvisa l'utente che quella fonte non è ancora stata verificata da loro e invitali a confermarla se la ritengono affidabile.
- Le fonti segnate [AFFIDABILE] sono già state approvate dagli utenti: usale liberamente citandole ("dai vostri appunti...").
- Per costi, tempi e regole che cambiano spesso, ricorda di verificare sulla fonte ufficiale e indica quale.`;

const HISTORY_LIMIT = 12;
const RAG_MATCHES = 5;
// tarata su nemotron-3-embed-1b: pertinenti 0.39-0.56, non pertinenti fino a 0.29
const MIN_SIMILARITY = 0.32;

interface SourceMeta {
  id: string;
  name: string;
  trusted: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { threadId, message, webSearch } = await request.json();
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Messaggio mancante" }, { status: 400 });
  }
  const question = message.trim();

  // chi sta scrivendo (per memoria personale e tono della risposta)
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const speakerName = myProfile?.full_name?.split("@")[0] ?? "Utente";

  try {
    // 1. Thread
    let thread = null;
    if (threadId) {
      const { data } = await supabase.from("chat_threads").select("*").eq("id", threadId).single();
      thread = data;
    }
    if (!thread) {
      const title = question.length > 60 ? question.slice(0, 57) + "..." : question;
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ title, created_by: user.id })
        .select()
        .single();
      if (error || !data) throw new Error("Impossibile creare la conversazione");
      thread = data;
    }

    // 2. Memoria conversazionale
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const pastMessages = (history ?? []).reverse();

    // 3. Memoria strutturata (sempre in contesto) + RAG documenti + web (in parallelo)
    const usedSources: SourceMeta[] = [];
    let memoryBlock = "";
    let knowledgeBlock = "";
    let webBlock = "";
    let webResults: WebResult[] = [];

    const memoryPromise = (async () => {
      try {
        memoryBlock = await loadMemoryBlock(supabase, user.id);
      } catch (err) {
        console.error("[chat] memory load skipped:", err);
      }
    })();

    const ragPromise = (async () => {
      try {
        const [queryEmbedding] = await embed([question], "query");
        const { data: matches } = await supabase.rpc("match_knowledge", {
          query_embedding: queryEmbedding,
          match_count: RAG_MATCHES,
        });
        // la memoria è già interamente nel prompt: dal RAG servono solo i documenti
        const relevant = (matches ?? []).filter(
          (m: { similarity: number; source_name: string }) =>
            m.similarity >= MIN_SIMILARITY && !m.source_name.startsWith(MEMORY_PREFIX)
        );
        if (relevant.length > 0) {
          for (const m of relevant as { source_id: string; source_name: string; trusted: boolean }[]) {
            if (!usedSources.find((s) => s.id === m.source_id)) {
              usedSources.push({ id: m.source_id, name: m.source_name, trusted: m.trusted });
            }
          }
          knowledgeBlock =
            "\n\nCONOSCENZA CONDIVISA (appunti e documenti degli utenti):\n" +
            relevant
              .map((m: { source_name: string; content: string; trusted: boolean }) =>
                `— [${m.trusted ? "AFFIDABILE" : "DA CONFERMARE"}] [${m.source_name}] ${m.content}`)
              .join("\n\n");
        }
      } catch (err) {
        console.error("[chat] RAG skipped:", err);
      }
    })();

    const webPromise = (async () => {
      if (!webSearch) return;
      try {
        webResults = await searchWeb(question);
        if (webResults.length > 0) {
          webBlock =
            "\n\nRISULTATI WEB (da verificare, cita sempre l'URL):\n" +
            webResults.map((r) => `— [${r.title}] (${r.url}) ${r.content}`).join("\n\n");
        }
      } catch (err) {
        console.error("[chat] web search failed:", err);
      }
    })();

    await Promise.all([memoryPromise, ragPromise, webPromise]);

    // 4. Streaming dal modello
    // il modello non sa che giorno è: senza, "questa settimana" o "tra quanto scade" non hanno senso
    const timeZone = await getTimeZone();
    const nowLabel = new Date().toLocaleString("it-IT", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateLine = `\n\nOGGI: ${nowLabel} (fuso ${timeZone}, quello in cui si trova chi scrive).`;
    const speakerLine = `\n\nIMPORTANTE: la persona che ti sta scrivendo in questo momento è ${speakerName}. Rivolgiti SEMPRE e SOLO a ${speakerName} (non confonderla con altre persone nominate nella memoria). Attingi sia alla memoria personale di ${speakerName} sia a quella condivisa; la memoria personale dell'altra persona usala solo se pertinente alla domanda.`;
    const messages: ChatMsg[] = [
      { role: "system", content: BASE_SYSTEM + dateLine + speakerLine + memoryBlock + knowledgeBlock + webBlock },
      ...pastMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: question },
    ];

    const meta = {
      type: "meta",
      threadId: thread.id,
      threadTitle: thread.title,
      sources: usedSources,
      web: webResults.map((r) => ({ title: r.title, url: r.url })),
      webSearchAvailable: webSearchAvailable(),
    };

    const encoder = new TextEncoder();
    const threadIdFinal = thread.id;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        send(meta);
        let fullAnswer = "";
        try {
          const stream = chatCompletionStream(messages, 900, (label) =>
            send({ type: "provider", label })
          );
          for await (const delta of stream) {
            fullAnswer += delta;
            send({ type: "delta", text: delta });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Errore dal servizio AI";
          send({ type: "error", error: msg });
          controller.close();
          return;
        }

        // 5. Salva i messaggi a stream completato
        try {
          await supabase.from("chat_messages").insert([
            { thread_id: threadIdFinal, role: "user", content: question, created_by: user.id },
            { thread_id: threadIdFinal, role: "assistant", content: fullAnswer, created_by: null },
          ]);
          await supabase
            .from("chat_threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", threadIdFinal);
        } catch (err) {
          console.error("[chat] save failed:", err);
        }

        // 6. Memoria automatica: estrai e salva i fatti stabili dello scambio
        try {
          const stored = await extractAndStoreFacts(supabase, user.id, speakerName, question, fullAnswer);
          if (stored.length > 0) {
            send({
              type: "memory",
              facts: stored.map((f) => `${f.personal ? `${speakerName} · ` : ""}${f.category}: ${f.fact}`),
            });
          }
        } catch (err) {
          console.error("[chat] memory extraction failed:", err);
        }

        send({ type: "done" });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[chat] failed:", err);
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
