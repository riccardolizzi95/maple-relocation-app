import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Verifica che il chiamante sia autenticato e admin. */
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Riservato agli admin" }, { status: 403 }) };
  }
  return { user };
}

function adminOrError() {
  const admin = createAdminClient();
  if (!admin) {
    return {
      error: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY non configurata sul server" },
        { status: 500 }
      ),
    };
  }
  return { admin };
}

/** Lista utenti (email da auth + nome/ruolo dal profilo). */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const svc = adminOrError();
  if ("error" in svc) return svc.error;

  const [{ data: usersData, error: usersErr }, { data: profiles }, { data: pushSubs }] = await Promise.all([
    svc.admin.auth.admin.listUsers(),
    svc.admin.from("profiles").select("id, full_name, role"),
    svc.admin.from("push_subscriptions").select("user_id"),
  ]);
  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  const pushCount = new Map<string, number>();
  for (const s of pushSubs ?? []) {
    pushCount.set(s.user_id, (pushCount.get(s.user_id) ?? 0) + 1);
  }

  const users = usersData.users
    .map((u) => {
      const p = profiles?.find((pr) => pr.id === u.id);
      return {
        id: u.id,
        email: u.email,
        full_name: p?.full_name ?? u.email,
        role: p?.role ?? "member",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at ?? null,
        push_devices: pushCount.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return NextResponse.json({ users });
}

/** Crea un nuovo utente (email confermata, nessuna mail di invito). */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const svc = adminOrError();
  if ("error" in svc) return svc.error;

  const { email, password, full_name, role } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email e password obbligatorie" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password di almeno 8 caratteri" }, { status: 400 });
  }

  const { data, error } = await svc.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Il trigger crea il profilo: aggiorniamo nome e ruolo
  await svc.admin
    .from("profiles")
    .update({
      full_name: full_name?.trim() || email,
      role: role === "admin" ? "admin" : "member",
    })
    .eq("id", data.user.id);

  return NextResponse.json({ ok: true, id: data.user.id });
}

/** Cambia il ruolo di un utente, oppure ne reimposta la password. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const svc = adminOrError();
  if ("error" in svc) return svc.error;

  const { userId, role, password } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId mancante" }, { status: 400 });
  }

  // Reset password
  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password di almeno 8 caratteri" }, { status: 400 });
    }
    const { error } = await svc.admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Cambio ruolo
  if (!["member", "admin"].includes(role)) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }
  if (userId === auth.user.id && role !== "admin") {
    return NextResponse.json({ error: "Non puoi rimuovere il tuo stesso ruolo admin" }, { status: 400 });
  }

  const { error } = await svc.admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
