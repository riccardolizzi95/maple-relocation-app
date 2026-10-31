import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense } from "./types";

/**
 * Spese inserite senza rete (metro, supermercati interrati...): restano sul
 * telefono finché non tornano online, poi vengono inviate al DB.
 * È un buffer temporaneo, non un archivio: la fonte di verità resta Supabase.
 * L'id è generato dal client, quindi un reinvio non crea doppioni.
 */

const KEY = "maple:pending-expenses";
const EVENT = "maple:pending-expenses";
const EMPTY: Expense[] = [];
let cache: Expense[] | null = null;

function read(): Expense[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache ?? EMPTY;
}

function write(list: Expense[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage pieno o bloccato: resta in memoria per questa sessione
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Per useSyncExternalStore: si aggiorna anche se un'altra scheda modifica la coda. */
export function subscribePending(onChange: () => void) {
  function onStorage(e: StorageEvent) {
    if (e.key !== KEY) return;
    cache = null;
    onChange();
  }
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const getPendingSnapshot = () => read();
export const getPendingServerSnapshot = () => EMPTY;

export function addPending(expense: Expense) {
  write([...read().filter((e) => e.id !== expense.id), expense]);
}

export function removePending(id: string) {
  write(read().filter((e) => e.id !== id));
}

/** true se l'errore è di rete (offline / connessione caduta), non un rifiuto del DB. */
export function isNetworkError(error: { message?: string } | null): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return /failed to fetch|load failed|networkerror|network request failed/i.test(error?.message ?? "");
}

/** Invia al DB le spese in coda; restituisce quelle salvate. Si ferma al primo errore di rete. */
export async function syncPending(supabase: SupabaseClient): Promise<Expense[]> {
  const synced: Expense[] = [];
  for (const p of read()) {
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        id: p.id,
        amount_cad: p.amount_cad,
        category: p.category,
        description: p.description,
        date: p.date,
        exchange_rate: p.exchange_rate,
        recurring: p.recurring,
        input_currency: p.input_currency,
        store: p.store,
      })
      .select()
      .single();
    if (!error && data) {
      synced.push(data as Expense);
      removePending(p.id);
    } else if (error?.code === "23505") {
      // già arrivata al DB (la risposta si era persa): basta toglierla dalla coda
      removePending(p.id);
    } else if (isNetworkError(error)) {
      break;
    } else {
      console.warn("[pending-expenses] spesa rifiutata dal DB:", error?.message);
    }
  }
  return synced;
}
