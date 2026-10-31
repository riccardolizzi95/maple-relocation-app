import { createClient } from "@supabase/supabase-js";

/**
 * Client con service_role key: SOLO lato server (API routes admin).
 * Bypassa RLS e può usare le API auth.admin (creazione utenti).
 * Richiede SUPABASE_SERVICE_ROLE_KEY nelle env (mai esposta al client).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
