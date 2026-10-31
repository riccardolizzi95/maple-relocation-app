import type { SupabaseClient } from "@supabase/supabase-js";
import { chatCompletion, embed } from "./nvidia";

export const MEMORY_PREFIX = "Memoria · ";
const DEDUPE_SIMILARITY = 0.92;

const CATEGORIES: Record<string, string> = {
  profilo: "Profilo",
  date: "Date importanti",
  preferenze: "Preferenze",
  decisioni: "Decisioni",
  casa: "Casa",
  lavoro: "Lavoro",
  budget: "Budget",
  altro: "Altro",
};

function extractPrompt(speakerName: string) {
  return `Analizza questo scambio di una chat su un trasferimento all'estero. Chi scrive è ${speakerName}. Estrai SOLO fatti nuovi, stabili e utili da ricordare, detti da ${speakerName} (non dall'assistente): nomi, professioni, date, decisioni, preferenze, vincoli.

Per ogni fatto indica:
- "ambito": "personale" se riguarda solo ${speakerName} (professione, gusti, documenti personali...), "condiviso" se riguarda la coppia o il trasferimento in generale (date di viaggio, budget comune, decisioni di coppia...)
- "categoria": una tra profilo, date, preferenze, decisioni, casa, lavoro, budget, altro
- "fatto": frase breve in terza persona. Per i fatti personali inizia col nome (es. "${speakerName} lavora come sviluppatore"). Per i condivisi usa "La coppia..." o soggetto esplicito.

NON estrarre: informazioni generiche sul paese di destinazione, contenuti della risposta dell'assistente, domande, cose temporanee.

Rispondi SOLO con un array JSON. Esempio:
[{"ambito":"personale","categoria":"lavoro","fatto":"${speakerName} lavora nel marketing"},{"ambito":"condiviso","categoria":"date","fatto":"La coppia parte il 29 settembre 2026"}]
Se non ci sono fatti da ricordare rispondi [].`;
}

interface ExtractedFact {
  ambito: string;
  categoria: string;
  fatto: string;
}

export interface StoredFact {
  category: string;
  fact: string;
  personal: boolean;
}

/**
 * Estrae fatti stabili dallo scambio e li salva compartimentati per categoria
 * e per ambito: fonti personali (owner_id = utente) o condivise (owner_id null).
 */
export async function extractAndStoreFacts(
  supabase: SupabaseClient,
  userId: string,
  speakerName: string,
  question: string,
  answer: string
): Promise<StoredFact[]> {
  const raw = await chatCompletion(
    [
      { role: "system", content: extractPrompt(speakerName) },
      { role: "user", content: `${speakerName.toUpperCase()}: ${question}\n\nASSISTENTE: ${answer.slice(0, 1500)}` },
    ],
    400
  );

  let extracted: ExtractedFact[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) extracted = JSON.parse(match[0]);
  } catch {
    return [];
  }

  const facts = extracted
    .filter((f): f is ExtractedFact =>
      !!f && typeof f.fatto === "string" && f.fatto.trim().length > 5)
    .map((f) => ({
      category: CATEGORIES[f.categoria?.toLowerCase?.() ?? "altro"] ?? CATEGORIES.altro,
      fact: f.fatto.trim(),
      personal: f.ambito?.toLowerCase?.() === "personale",
    }))
    .slice(0, 5);
  if (facts.length === 0) return [];

  const embeddings = await embed(facts.map((f) => f.fact), "passage");
  const stored: StoredFact[] = [];
  const sourceCache = new Map<string, string>();

  for (let i = 0; i < facts.length; i++) {
    const { category, fact, personal } = facts[i];

    // dedupe globale per similarità
    const { data: similar } = await supabase.rpc("match_knowledge", {
      query_embedding: embeddings[i],
      match_count: 1,
    });
    const top = similar?.[0];
    if (top && top.similarity >= DEDUPE_SIMILARITY) continue;

    // fonte per (categoria, ambito): personale = owner_id utente, condivisa = null
    const sourceName = MEMORY_PREFIX + category;
    const ownerId = personal ? userId : null;
    const cacheKey = `${sourceName}|${ownerId ?? "shared"}`;
    let sourceId = sourceCache.get(cacheKey);
    if (!sourceId) {
      let query = supabase.from("knowledge_sources").select("id").eq("name", sourceName);
      query = ownerId ? query.eq("owner_id", ownerId) : query.is("owner_id", null);
      const { data: existing } = await query.limit(1).single();
      if (existing) {
        sourceId = existing.id;
      } else {
        const { data: created } = await supabase
          .from("knowledge_sources")
          .insert({ name: sourceName, type: "manual", trusted: true, created_by: userId, owner_id: ownerId })
          .select("id")
          .single();
        sourceId = created?.id;
      }
      if (sourceId) sourceCache.set(cacheKey, sourceId);
    }
    if (!sourceId) continue;

    const { error } = await supabase.from("knowledge_chunks").insert({
      source_id: sourceId,
      content: fact,
      embedding: JSON.stringify(embeddings[i]),
    });
    if (!error) stored.push({ category, fact, personal });
  }

  return stored;
}

/**
 * Carica TUTTA la memoria come blocco strutturato per il prompt, divisa in
 * condivisa e personale per persona. currentUserId serve a indicare al
 * modello chi sta scrivendo.
 */
export async function loadMemoryBlock(
  supabase: SupabaseClient,
  currentUserId: string
): Promise<string> {
  const [{ data: chunks }, { data: profiles }] = await Promise.all([
    supabase
      .from("knowledge_chunks")
      .select("content, knowledge_sources!inner(name, owner_id)")
      .like("knowledge_sources.name", `${MEMORY_PREFIX}%`)
      .order("created_at", { ascending: true })
      .limit(120),
    supabase.from("profiles").select("id, full_name"),
  ]);

  if (!chunks || chunks.length === 0) return "";

  const nameOf = (id: string) =>
    profiles?.find((p) => p.id === id)?.full_name ?? "Utente";

  const shared = new Map<string, string[]>();
  const personal = new Map<string, Map<string, string[]>>(); // ownerId -> categoria -> fatti

  for (const row of chunks) {
    const src = row.knowledge_sources as unknown as { name: string; owner_id: string | null };
    const cat = src.name.replace(MEMORY_PREFIX, "");
    if (src.owner_id) {
      const perOwner = personal.get(src.owner_id) ?? new Map<string, string[]>();
      (perOwner.get(cat) ?? perOwner.set(cat, []).get(cat)!).push(row.content);
      personal.set(src.owner_id, perOwner);
    } else {
      (shared.get(cat) ?? shared.set(cat, []).get(cat)!).push(row.content);
    }
  }

  const sections: string[] = [];

  if (shared.size > 0) {
    const lines = [...shared.entries()]
      .map(([cat, items]) => `${cat}:\n${items.map((c) => `- ${c}`).join("\n")}`)
      .join("\n");
    sections.push(`MEMORIA CONDIVISA (della coppia):\n${lines}`);
  }

  for (const [ownerId, cats] of personal) {
    const who = nameOf(ownerId);
    const isCurrent = ownerId === currentUserId;
    const lines = [...cats.entries()]
      .map(([cat, items]) => `${cat}:\n${items.map((c) => `- ${c}`).join("\n")}`)
      .join("\n");
    sections.push(
      `MEMORIA DI ${who.toUpperCase()}${isCurrent ? " (la persona che ti sta scrivendo ora)" : ""}:\n${lines}`
    );
  }

  return (
    "\n\nMEMORIA (fatti stabiliti dagli utenti, affidabili — usali senza chiedere conferma):\n" +
    sections.join("\n\n")
  );
}
