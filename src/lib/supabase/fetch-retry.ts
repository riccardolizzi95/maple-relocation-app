/**
 * fetch per i client Supabase, con due ritentativi mirati:
 *
 * 1. RETE: su iPhone, riaprendo la PWA dopo un po' in background, la prima
 *    richiesta spesso fallisce con "Load failed" anche se internet c'è (connessione
 *    vecchia chiusa dal sistema). Le spese finivano nella coda offline con
 *    l'avviso "Sei offline" (08/10). Ora la richiesta si ripete dopo 0,5 e 1,5 s.
 *    Le POST si ripetono solo se il fallimento è stato immediato (la richiesta
 *    quasi certamente non è partita), per non creare doppioni; le spese hanno
 *    comunque un id scelto dal client, quindi un doppio invio dà 23505, gestito.
 *
 * 2. TOKEN: ritenta UNA volta le richieste respinte con 401 PGRST303 (validazione
 *    del token fallita). Succede subito dopo il rinnovo del token di accesso: il
 *    05/10 la Dashboard ha mostrato "$0.00 · 0 transazioni" perché una sola query
 *    su cinque, partita con il token appena emesso, era stata rifiutata.
 */

const NETWORK_RETRY_DELAYS = [500, 1500];
/** sotto questa durata un errore di rete su una POST vuol dire "non partita" */
const FAST_FAILURE_MS = 2500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithNetworkRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // un Request con corpo si può leggere una volta sola: niente ritentativi
  if (typeof Request !== "undefined" && input instanceof Request) return fetch(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      return await fetch(input, init);
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const retryable =
        err instanceof TypeError && // errore di rete (un abort è DOMException)
        !offline &&
        !init?.signal?.aborted &&
        attempt < NETWORK_RETRY_DELAYS.length &&
        (method !== "POST" || Date.now() - started < FAST_FAILURE_MS);
      if (!retryable) throw err;
      await sleep(NETWORK_RETRY_DELAYS[attempt]);
    }
  }
}

export const fetchWithAuthRetry: typeof fetch = async (input, init) => {
  const res = await fetchWithNetworkRetry(input, init);
  if (res.status !== 401) return res;
  const body = await res.clone().text().catch(() => "");
  if (!body.includes("PGRST303")) return res;
  await sleep(800);
  return fetchWithNetworkRetry(input, init);
};
