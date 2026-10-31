import type { ItemUnit } from "./types";

export const ITEM_UNITS: { value: ItemUnit; label: string }[] = [
  { value: "pz", label: "pz" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "l", label: "l" },
  { value: "ml", label: "ml" },
];

export type BaseUnit = "kg" | "l" | "pz";

/** Prezzo per unità confrontabile: g→kg, ml→l, pezzi restano pezzi. */
export function unitPrice(priceCad: number, quantity: number, unit: ItemUnit): { value: number; base: BaseUnit } {
  const q = Number(quantity) || 1;
  const p = Number(priceCad) || 0;
  if (unit === "g") return { value: (p / q) * 1000, base: "kg" };
  if (unit === "ml") return { value: (p / q) * 1000, base: "l" };
  if (unit === "kg" || unit === "l") return { value: p / q, base: unit };
  return { value: p / q, base: "pz" };
}

/** Chiave del prodotto: stesso nome a meno di maiuscole e spazi = stesso prodotto. */
export function productKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Chiave del negozio: "Super Mart", "Super-mart", "super mart " → "supermart". */
export function storeKey(store: string): string {
  return store
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function formatUnitPrice(value: number, base: BaseUnit): string {
  const n = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
  return `${n}/${base}`;
}
