"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Share, CheckCircle2, AlertTriangle } from "lucide-react";

/** Converte la chiave VAPID pubblica (base64url) nel formato richiesto da pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status =
  | "loading"        // controllo iniziale
  | "unsupported"    // browser senza web push
  | "ios-not-pwa"    // iPhone ma non installata alla home
  | "no-sw"          // service worker non registrato (dev)
  | "denied"         // permesso negato a livello browser/OS
  | "off"            // supportata ma non attiva
  | "on";            // attiva su questo dispositivo

export default function PushSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (isIOS && !standalone) return setStatus("ios-not-pwa");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setStatus("unsupported");
      }
      if (Notification.permission === "denied") return setStatus("denied");

      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return setStatus("no-sw");
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    if (!vapidKey) {
      setFeedback({ ok: false, text: "Chiave VAPID pubblica mancante: controlla le variabili d'ambiente." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        setFeedback({ ok: false, text: "Permesso non concesso." });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("salvataggio fallito");
      setStatus("on");
      setFeedback({ ok: true, text: "Notifiche attive su questo dispositivo." });
    } catch (err) {
      console.error("[push] attivazione fallita:", err);
      setFeedback({ ok: false, text: "Attivazione fallita, riprova." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setFeedback(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
      setFeedback({ ok: true, text: "Notifiche disattivate su questo dispositivo." });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.sent > 0) {
        setFeedback({ ok: true, text: "Inviata! Dovrebbe arrivare tra pochi secondi." });
      } else {
        setFeedback({ ok: false, text: json.error ?? "Nessun dispositivo raggiunto." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">Notifiche push</h2>
        {status === "on" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            attive
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500">
        Ricevi un avviso quando un ticket viene risolto o riaperto e un riepilogo delle scadenze imminenti.
        L&apos;attivazione vale per il singolo dispositivo.
      </p>

      {status === "loading" && <p className="text-xs text-gray-400">Controllo il supporto...</p>}

      {status === "ios-not-pwa" && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
          <Share className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Su iPhone le notifiche funzionano solo dall&apos;app installata: apri Maple in Safari,
            tocca <span className="font-semibold">Condividi → Aggiungi alla schermata Home</span>, poi
            riapri l&apos;app dalla home e torna qui.
          </span>
        </p>
      )}

      {status === "unsupported" && (
        <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
          Questo browser non supporta le notifiche push.
        </p>
      )}

      {status === "no-sw" && (
        <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
          Service worker non attivo (in locale le notifiche si provano solo in produzione).
        </p>
      )}

      {status === "denied" && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Le notifiche sono bloccate per Maple nelle impostazioni del sistema. Sbloccale da lì
            (iPhone: Impostazioni → Notifiche → Maple), poi ricarica questa pagina.
          </span>
        </p>
      )}

      {(status === "off" || status === "on") && (
        <div className="flex flex-wrap gap-2">
          {status === "off" ? (
            <button
              onClick={enable}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
            >
              <Bell className="h-4 w-4" />
              {busy ? "Attivazione..." : "Attiva su questo dispositivo"}
            </button>
          ) : (
            <>
              <button
                onClick={sendTest}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
              >
                <BellRing className="h-4 w-4" />
                {busy ? "Invio..." : "Invia notifica di prova"}
              </button>
              <button
                onClick={disable}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <BellOff className="h-4 w-4" />
                Disattiva
              </button>
            </>
          )}
        </div>
      )}

      {feedback && (
        <p className={feedback.ok ? "text-xs text-emerald-600" : "text-xs text-red-500"}>{feedback.text}</p>
      )}
    </section>
  );
}
