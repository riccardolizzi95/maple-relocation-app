import { cache } from "react";
import { createClient } from "./server";

/**
 * Utente autenticato, deduplicato per richiesta con React cache():
 * layout e pagina dello stesso render condividono una sola verifica
 * (auth.getUser fa un round-trip crittografico all'Auth server, prima
 * ne partivano due — una nel layout, una nella pagina).
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
