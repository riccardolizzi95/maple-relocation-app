import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchWithAuthRetry } from './fetch-retry'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithAuthRetry },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll è chiamato da Server Component dove non si può settare cookie.
            // Il middleware gestisce il refresh della sessione.
          }
        },
      },
    }
  )
}
