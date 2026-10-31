import type { SupabaseClient } from "@supabase/supabase-js";

/** Gli scontrini stanno nel bucket privato dei documenti, sotto receipts/. */
const BUCKET = "documents";

/**
 * Riduce la foto prima del caricamento (le foto dell'iPhone pesano 3-5 MB):
 * lato lungo max 1600px in JPEG, più che leggibile per uno scontrino.
 * I PDF e tutto ciò che il browser non sa decodificare passano invariati.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.75): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadReceipt(
  supabase: SupabaseClient,
  expenseId: string,
  file: Blob
): Promise<{ path: string | null; error: { message: string } | null }> {
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
  const path = `receipts/${expenseId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  // "esiste già" = un invio precedente era arrivato (risposta persa): il file c'è
  if (error && /already exists|duplicate/i.test(error.message)) return { path, error: null };
  return error ? { path: null, error } : { path, error: null };
}

/** Best effort: un file rimasto orfano non rompe nulla. */
export async function removeReceipt(supabase: SupabaseClient, path: string) {
  await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
}

/**
 * Apre lo scontrino in una nuova scheda. La finestra si apre SUBITO (dentro il
 * tap) e riceve l'URL firmato dopo: aprirla dopo l'await la farebbe bloccare
 * da Safari come popup.
 */
export async function openReceipt(path: string): Promise<boolean> {
  const win = window.open("", "_blank");
  try {
    const res = await fetch(`/api/document-url?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (!res.ok || !json.url) throw new Error(json.error ?? "URL non disponibile");
    if (win) win.location.href = json.url;
    else window.location.href = json.url;
    return true;
  } catch {
    win?.close();
    return false;
  }
}
