/**
 * Client AI multi-provider, endpoint OpenAI-compatibili.
 * - Chat: catena di fallback con soglia di latenza — Groq (70B, velocissimo),
 *   poi NVIDIA gpt-oss-20b, poi NVIDIA Nemotron 3.5 Lightning. Se un provider non
 *   produce il primo token entro FIRST_TOKEN_MS si passa al successivo; l'ultimo
 *   ha tempo pieno.
 * - Embeddings: sempre NVIDIA NIM (Groq non li offre).
 *
 * ATTENZIONE: NVIDIA ritira i modelli senza preavviso nell'app (risponde 410).
 * Il 26/08/2026 sono spariti llama-3.1-8b, llama-3.3-70b e nv-embedqa-e5-v5.
 * Cambiare EMBED_MODEL richiede di ricalcolare tutti i knowledge_chunks
 * (vettori di modelli diversi non sono confrontabili) e la dimensione della colonna.
 */

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const EMBED_MODEL = "nvidia/nemotron-3-embed-1b"; // 2048 dimensioni = colonna vector(2048)
const TIMEOUT_MS = 45_000;
const FIRST_TOKEN_MS = 3_000;

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatProvider {
  base: string;
  key: string;
  model: string;
  label: string;
}

/** Catena ordinata dei provider disponibili in base alle chiavi presenti. */
function providerChain(): ChatProvider[] {
  const chain: ChatProvider[] = [];
  const groqKey = process.env.GROQ_API_KEY;
  const nvKey = process.env.NVIDIA_API_KEY;
  if (groqKey) {
    chain.push({
      base: GROQ_BASE,
      key: groqKey,
      model: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
      label: "Llama 3.3 70B · Groq",
    });
  }
  if (nvKey) {
    chain.push({
      base: NVIDIA_BASE,
      key: nvKey,
      model: "openai/gpt-oss-20b",
      label: "gpt-oss 20B · NVIDIA",
    });
    chain.push({
      base: NVIDIA_BASE,
      key: nvKey,
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      label: "Nemotron 3.5 Lightning · NVIDIA",
    });
  }
  if (chain.length === 0) {
    throw new Error("Nessuna chiave AI configurata (GROQ_API_KEY o NVIDIA_API_KEY)");
  }
  return chain;
}

function nvidiaKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY non configurata sul server");
  return key;
}

/** Risposta non in streaming: prova i provider in ordine finché uno risponde. */
export async function chatCompletion(messages: ChatMsg[], maxTokens = 900): Promise<string> {
  let lastError: unknown = null;
  for (const p of providerChain()) {
    try {
      const res = await fetch(`${p.base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${p.key}`,
        },
        body: JSON.stringify({
          model: p.model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${p.label}: ${res.status} ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      const text: string | undefined = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error(`${p.label}: risposta vuota`);
      return text;
    } catch (err) {
      console.error("[ai] chatCompletion, passo al provider successivo:", err);
      lastError = err;
    }
  }
  throw new Error(`Errore dal servizio AI: ${lastError instanceof Error ? lastError.message : "nessun provider disponibile"}`);
}

/**
 * Streaming con fallback a catena: prova ogni provider in ordine; se il primo
 * token non arriva entro FIRST_TOKEN_MS passa al successivo (l'ultimo ha tempo
 * pieno TIMEOUT_MS). onProvider viene chiamata quando un provider "vince".
 */
export async function* chatCompletionStream(
  messages: ChatMsg[],
  maxTokens = 900,
  onProvider?: (label: string) => void
): AsyncGenerator<string> {
  const chain = providerChain();
  let lastError: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const p = chain[i];
    const isLast = i === chain.length - 1;
    const ctrl = new AbortController();
    // deadline al primo token per i provider non ultimi; l'ultimo ha tempo pieno
    let firstTokenTimer: ReturnType<typeof setTimeout> | null = null;
    const globalTimer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    if (!isLast) firstTokenTimer = setTimeout(() => ctrl.abort(), FIRST_TOKEN_MS);
    let gotFirstOuter = false;

    try {
      const res = await fetch(`${p.base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${p.key}`,
        },
        body: JSON.stringify({
          model: p.model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.4,
          stream: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotFirst = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            clearTimeout(globalTimer);
            return;
          }
          try {
            const json = JSON.parse(payload);
            const delta: string | undefined = json?.choices?.[0]?.delta?.content;
            if (delta) {
              if (!gotFirst) {
                gotFirst = true;
                gotFirstOuter = true;
                if (firstTokenTimer) clearTimeout(firstTokenTimer);
                onProvider?.(p.label);
                console.log(`[ai] provider attivo: ${p.label}`);
              }
              yield delta;
            }
          } catch {
            // frammento non parsabile: ignora
          }
        }
      }
      clearTimeout(globalTimer);
      if (gotFirst) return; // stream concluso regolarmente
      // stream chiuso senza token: prova il prossimo provider
      lastError = new Error(`${p.label}: stream vuoto`);
    } catch (err) {
      // se aveva già iniziato a rispondere, non ripartire da capo con un altro provider
      if (gotFirstOuter) {
        console.error(`[ai] ${p.label} interrotto a metà risposta:`, err);
        throw new Error("La risposta si è interrotta, riprova.");
      }
      lastError = err;
      console.warn(`[ai] ${p.label} scartato:`, err instanceof Error ? err.message : err);
    } finally {
      clearTimeout(globalTimer);
      if (firstTokenTimer) clearTimeout(firstTokenTimer);
    }
  }

  console.error("[ai] tutti i provider falliti:", lastError);
  throw new Error("Nessun provider AI ha risposto in tempo, riprova tra poco.");
}

/** Embedding batch. inputType: "query" per le domande, "passage" per i contenuti da indicizzare. */
export async function embed(texts: string[], inputType: "query" | "passage"): Promise<number[][]> {
  const request = () =>
    fetch(`${NVIDIA_BASE}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${nvidiaKey()}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: texts,
        input_type: inputType,
        encoding_format: "float",
        truncate: "END",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  let res = await request();
  // il modello a volte risponde 502 per un attimo: un secondo tentativo basta
  if (res.status >= 500) res = await request();
  if (!res.ok) {
    const body = await res.text();
    console.error("[nvidia] embed error:", res.status, body.slice(0, 500));
    throw new Error(`Errore embeddings (${res.status})`);
  }
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

/** Spezza un testo in blocchi ~maxLen caratteri con overlap, rispettando i paragrafi. */
export function chunkText(text: string, maxLen = 1500, overlap = 200): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= maxLen) return clean ? [clean] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxLen, clean.length);
    if (end < clean.length) {
      // prova a tagliare su un confine di paragrafo o frase
      const slice = clean.slice(start, end);
      const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "));
      if (lastBreak > maxLen * 0.5) end = start + lastBreak + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 20);
}
