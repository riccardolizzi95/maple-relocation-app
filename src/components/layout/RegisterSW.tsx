"use client";

import { useEffect } from "react";

/** Registra il service worker per il supporto offline (solo in produzione). */
export default function RegisterSW() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registrazione fallita:", err);
    });
  }, []);

  return null;
}
