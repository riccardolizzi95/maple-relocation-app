import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/user";
import { chatCompletion } from "@/lib/ai/nvidia";

export const maxDuration = 30;

const MAX_TEXT = 12_000;
const MAX_HTML_BYTES = 2_000_000;

/**
 * Legge un annuncio di casa (link o testo incollato) e restituisce i campi
 * della scheda Alloggio. Il modello estrae solo ciò che c'è scritto: i campi
 * assenti tornano null e l'utente completa a mano.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const input = typeof body?.text === "string" ? body.text.trim() : "";
  if (!input) return NextResponse.json({ error: "Incolla il link o il testo dell'annuncio" }, { status: 400 });

  let listingUrl: string | null = null;
  let text = input;
  // solo un link: provo a leggere la pagina (molti siti, es. Facebook, non lo permettono)
  if (/^https?:\/\/\S+$/i.test(input)) {
    listingUrl = input;
    const page = await fetchListingText(input);
    if (!page) {
      return NextResponse.json(
        { error: "Non riesco a leggere quella pagina: apri l'annuncio, copia il testo e incollalo qui.", listingUrl },
        { status: 422 }
      );
    }
    text = page;
  } else {
    listingUrl = input.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
  }

  let raw: string;
  try {
    raw = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, MAX_TEXT) },
      ],
      700
    );
  } catch (err) {
    console.error("[housing/parse] AI error:", err);
    return NextResponse.json({ error: "Il servizio AI non risponde, riprova tra poco." }, { status: 502 });
  }

  const parsed = parseJson(raw);
  if (!parsed) return NextResponse.json({ error: "Non sono riuscito a leggere l'annuncio, riprova o compila a mano." }, { status: 422 });

  return NextResponse.json({ fields: sanitize(parsed, listingUrl) });
}

const SYSTEM_PROMPT = `Estrai i dati da un annuncio di affitto (anche in lingua straniera). Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con queste chiavi:
{
  "name": "nome breve in italiano, tipo + zona, es. \\"Bilocale in centro\\" o \\"Stanza vicino all'università\\"",
  "address": "indirizzo o incrocio di vie come scritto nell'annuncio, altrimenti null",
  "neighborhood": "quartiere se indicato o deducibile dall'indirizzo, altrimenti null",
  "price_cad": numero (affitto mensile in CAD) o null,
  "utilities_included": "si" | "no" | "parziale" | null,
  "utilities_estimate_cad": numero o null,
  "furnished": "si" | "no" | "parziale" | null,
  "furnished_notes": "testo breve in italiano o null",
  "deposit_cad": numero o null,
  "advance_months": numero intero di mesi anticipati richiesti (es. first and last = 2) o null,
  "min_lease_months": numero intero o null (12 per "1 year lease"),
  "pros": "punti a favore in italiano, uno per riga con \\"- \\", o null",
  "cons": "punti a sfavore o dubbi in italiano, uno per riga con \\"- \\", o null",
  "notes": "riassunto in italiano dei dettagli utili (camere, bagni, metri quadri, lavatrice, animali, parcheggio, disponibilità, mezzi vicini), max 6 righe",
  "contact": { "name": "...", "role": "Proprietario | Agente | Property manager", "phone": "...", "email": "..." } oppure null
}
Regole: usa SOLO informazioni presenti nell'annuncio, non inventare. Numeri senza simboli né separatori delle migliaia.`;

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const tri = (v: unknown) => (v === "si" || v === "no" || v === "parziale" ? v : null);

function sanitize(p: Record<string, unknown>, listingUrl: string | null) {
  const c = p.contact && typeof p.contact === "object" ? (p.contact as Record<string, unknown>) : null;
  const contact = c && str(c.name, 120)
    ? { name: str(c.name, 120)!, role: str(c.role, 60) ?? "Contatto", phone: str(c.phone, 40), email: str(c.email, 120) }
    : null;
  const intOrNull = (v: unknown) => {
    const n = num(v);
    return n === null ? null : Math.round(n);
  };
  return {
    name: str(p.name, 80),
    address: str(p.address, 160),
    neighborhood: str(p.neighborhood, 80),
    price_cad: num(p.price_cad),
    listing_url: listingUrl,
    utilities_included: tri(p.utilities_included),
    utilities_estimate_cad: num(p.utilities_estimate_cad),
    furnished: tri(p.furnished),
    furnished_notes: str(p.furnished_notes, 200),
    deposit_cad: num(p.deposit_cad),
    advance_months: intOrNull(p.advance_months),
    min_lease_months: intOrNull(p.min_lease_months),
    pros: str(p.pros, 1000),
    cons: str(p.cons, 1000),
    notes: str(p.notes, 1500),
    contact,
  };
}

/** Il link deve essere https e puntare a un nome di dominio pubblico (niente IP o host interni). */
function isPublicHttps(raw: string): URL | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:") return null;
    if (/^[\d.]+$/.test(host) || host.includes(":") || !host.includes(".")) return null;
    if (host === "localhost" || /\.(local|internal|localhost)$/.test(host)) return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchListingText(raw: string): Promise<string | null> {
  let url = isPublicHttps(raw);
  try {
    // redirect seguiti a mano: ogni salto viene ricontrollato
    for (let hop = 0; url && hop < 4; hop++) {
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
          "accept-language": "en-CA,en;q=0.9",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        url = next ? isPublicHttps(new URL(next, url).toString()) : null;
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return null;
      const html = (await res.text()).slice(0, MAX_HTML_BYTES);
      const text = htmlToText(html);
      return text.length >= 200 ? text : null;
    }
  } catch (err) {
    console.warn("[housing/parse] fetch failed:", err);
  }
  return null;
}

function htmlToText(html: string): string {
  // i meta og:* spesso contengono titolo, prezzo e descrizione anche quando il corpo è generato in JS
  const metas = [...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:title|og:description|description)["'][^>]*>/gi)]
    .map((m) => m[0].match(/content=["']([^"']*)["']/i)?.[1] ?? "")
    .filter(Boolean);
  const body = html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities([...metas, body].join("\n"))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_TEXT);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}
