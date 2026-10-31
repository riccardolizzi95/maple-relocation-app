import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

// Next 16: "proxy" è il nuovo nome della convenzione "middleware"
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // api/keepalive escluso: il cron Vercel non ha sessione e deve
    // comunque raggiungere il DB per tenere attivo Supabase.
    // api/push/ticket-event escluso: lo chiama il trigger DB via pg_net (senza sessione)
    // api/rates/daily escluso: cron dei tassi, protetto da CRON_SECRET
    '/((?!_next/static|_next/image|favicon.ico|api/keepalive|api/push/ticket-event|api/rates/daily|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
