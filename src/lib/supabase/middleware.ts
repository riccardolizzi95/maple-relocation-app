import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { fetchWithAuthRetry } from './fetch-retry'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // un errore di rete durante il rinnovo del token NON deve mandare al login (14/10)
      global: { fetch: fetchWithAuthRetry },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (
    !session &&
    !request.nextUrl.pathname.startsWith('/login')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    // dopo l'accesso si torna alla pagina richiesta (non per le chiamate API)
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    }
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
