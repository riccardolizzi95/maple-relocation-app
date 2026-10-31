"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import ModalShell from "@/components/ui/ModalShell";
import {
  Users, Plus, Shield, ShieldOff, RefreshCw, KeyRound, Bell,
  Clock, CircleUserRound, MailCheck, MailWarning,
} from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: "member" | "admin";
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  push_devices: number;
}

/** Data relativa in italiano: "oggi", "ieri", "3 giorni fa", "2 mesi fa". */
function fmtRelative(iso: string | null): string {
  if (!iso) return "mai";
  const diffMs = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 30) return `${days} giorni fa`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 mese fa";
  if (months < 12) return `${months} mesi fa`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 anno fa" : `${years} anni fa`;
}

export default function UsersManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // i ricaricamenti dopo un'azione aggiornano la lista senza rimettere lo spinner
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setUsers(json.users);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }, []);

  // load() aggiorna lo stato solo dopo l'await della fetch: nessun render a cascata
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function toggleRole(u: AdminUser) {
    const newRole = u.role === "admin" ? "member" : "admin";
    if (!confirm(`${newRole === "admin" ? "Promuovere" : "Rimuovere"} ${u.full_name} ${newRole === "admin" ? "ad admin" : "da admin"}?`)) return;
    setBusy(u.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: u.id, role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(null);
    }
  }

  const stats = {
    total: users.length,
    admin: users.filter((u) => u.role === "admin").length,
    withPush: users.filter((u) => u.push_devices > 0).length,
    neverIn: users.filter((u) => !u.last_sign_in_at).length,
  };

  return (
    <div className="space-y-4">
      {/* Statistiche compatte */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} value={stats.total} label="Utenti" />
        <StatCard icon={<Shield className="h-4 w-4" />} value={stats.admin} label="Admin" />
        <StatCard icon={<Bell className="h-4 w-4" />} value={stats.withPush} label="Con notifiche" />
        <StatCard icon={<MailWarning className="h-4 w-4" />} value={stats.neverIn} label="Mai entrati" className="hidden sm:flex" />
      </div>

      {/* Barra azioni */}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-gray-500">Account del workspace condiviso.</p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Aggiorna"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span className="hidden sm:inline">Aggiorna</span>
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuovo utente
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-1.5">
          {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={load} className="shrink-0 rounded-lg p-1 hover:bg-red-100 transition-colors" title="Riprova">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-xl bg-white p-3 ring-1 ring-foreground/10">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-maple-50 text-sm font-semibold text-maple-600">
                  {u.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || <CircleUserRound className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-gray-800">{u.full_name}</p>
                    {u.id === currentUserId && <span className="text-[11px] text-gray-400">(tu)</span>}
                    <span className={cn(
                      "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      u.role === "admin" ? "bg-maple-50 text-maple-600" : "bg-gray-100 text-gray-500"
                    )}>
                      {u.role === "admin" ? "Admin" : "Membro"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-gray-400">{u.email}</p>

                  {/* Meta: ultimo accesso, dispositivi push, conferma email */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {u.last_sign_in_at ? `accesso ${fmtRelative(u.last_sign_in_at)}` : "mai entrato"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Bell className="h-3 w-3" />
                      {u.push_devices === 0 ? "no notifiche" : `${u.push_devices} dispositiv${u.push_devices === 1 ? "o" : "i"}`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {u.email_confirmed_at
                        ? <><MailCheck className="h-3 w-3 text-emerald-500" /> email confermata</>
                        : <><MailWarning className="h-3 w-3 text-amber-500" /> email da confermare</>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Azioni */}
              <div className="mt-2.5 flex flex-wrap gap-2 border-t border-gray-100 pt-2.5">
                <button
                  onClick={() => setResetUser(u)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Reimposta password
                </button>
                {u.id !== currentUserId && (
                  <button
                    onClick={() => toggleRole(u)}
                    disabled={busy === u.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                  >
                    {u.role === "admin" ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                    {u.role === "admin" ? "Rimuovi admin" : "Rendi admin"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  );
}

function StatCard({ icon, value, label, className }: { icon: React.ReactNode; value: number; label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 ring-1 ring-foreground/10", className)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-maple-50 text-maple-500">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none text-gray-800">{value}</p>
        <p className="mt-0.5 truncate text-[11px] text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const inputCls =
    "mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setSaving(false);
    }
  }

  const footer = done ? (
    <div className="flex justify-end">
      <button onClick={onClose} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors">
        Chiudi
      </button>
    </div>
  ) : (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors">
        Annulla
      </button>
      <button type="submit" form="reset-password-form" disabled={saving} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors">
        {saving ? "Salvataggio..." : "Reimposta"}
      </button>
    </div>
  );

  return (
    <ModalShell title={`Reimposta password — ${user.full_name}`} onClose={onClose} footer={footer}>
      {done ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
          Password aggiornata. Comunica la nuova password a {user.full_name}: potrà accedere subito.
        </div>
      ) : (
        <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">
            Imposti una nuova password per <span className="font-medium text-gray-700">{user.email}</span>.
            La vecchia smette subito di funzionare.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-600">Nuova password *</label>
            <input type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="Minimo 8 caratteri" autoFocus />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </form>
      )}
    </ModalShell>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inputCls =
    "mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName,
          role: isAdmin ? "admin" : "member",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors">
        Annulla
      </button>
      <button type="submit" form="create-user-form" disabled={saving} className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors">
        {saving ? "Creazione..." : "Crea utente"}
      </button>
    </div>
  );

  return (
    <ModalShell title="Nuovo utente" onClose={onClose} footer={footer}>
      <form id="create-user-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600">Nome</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="es. Mario" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">Email *</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="nome@esempio.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">Password *</label>
          <input type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="Minimo 8 caratteri" />
          <p className="mt-1 text-xs text-gray-400">
            Comunica la password alla persona: potrà accedere subito, senza email di conferma.
          </p>
        </div>
        <label className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 cursor-pointer">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-maple-500 focus:ring-maple-400" />
          <span className="text-sm text-gray-700">Rendi admin (può gestire gli utenti)</span>
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </form>
    </ModalShell>
  );
}
