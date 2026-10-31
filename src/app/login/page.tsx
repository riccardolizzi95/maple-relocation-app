"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const RECOVER_KEY = "maple:session-recovered-at";

/** Pagina a cui tornare dopo l'accesso: solo percorsi interni, mai il login stesso. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/dashboard";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // prima di chiedere la password si prova a recuperare la sessione salvata
  const [recovering, setRecovering] = useState(true);
  const router = useRouter();

  // un utente finiva qui quasi ogni giorno con la sessione ANCORA valida (nei log il
  // rinnovo riusciva un attimo prima del nuovo login). Se la sessione si rinnova,
  // si torna subito dov'era invece di chiedere la password.
  useEffect(() => {
    (async () => {
      await Promise.resolve();
      // se si è appena tornati qui dopo un recupero, il server la rifiuta: niente ciclo, si chiede la password
      let recent = false;
      try { recent = Date.now() - Number(sessionStorage.getItem(RECOVER_KEY) ?? 0) < 30_000; } catch { /* storage bloccato */ }
      if (!recent) {
        const { data } = await createClient().auth.getSession().catch(() => ({ data: { session: null } }));
        if (data.session) {
          try { sessionStorage.setItem(RECOVER_KEY, String(Date.now())); } catch { /* storage bloccato */ }
          window.location.replace(nextPath());
          return;
        }
      }
      setRecovering(false);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(nextPath());
    router.refresh();
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-maple-100">
            <span className="text-2xl">🍁</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Maple</h1>
          <p className="mt-1 text-sm text-gray-500">Accedi al tuo account</p>
        </div>

        {recovering ? (
          <p className="text-center text-sm text-gray-500" role="status">Accesso in corso…</p>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-200 focus:outline-none"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-200 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-maple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Caricamento..." : "Accedi"}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
