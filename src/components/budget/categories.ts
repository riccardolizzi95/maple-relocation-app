import type { ExpenseCategory } from "@/lib/types";
import {
  Home,
  ShoppingCart,
  UtensilsCrossed,
  Sofa,
  TrainFront,
  Smartphone,
  HeartPulse,
  Shirt,
  PartyPopper,
  ClipboardList,
  Package,
  type LucideIcon,
} from "lucide-react";

export interface CategoryMeta {
  value: ExpenseCategory;
  label: string;
  Icon: LucideIcon;
  /** classi del badge icona (sfondo + colore) */
  color: string;
}

/** Unica fonte delle categorie spesa: modal, lista e statistiche leggono da qui. */
export const EXPENSE_CATEGORIES: CategoryMeta[] = [
  { value: "alloggio", label: "Alloggio", Icon: Home, color: "bg-maple-50 text-maple-500" },
  // chiave storica "cibo": in UI è la spesa al supermercato (i pasti fuori vanno in Ristoranti)
  { value: "cibo", label: "Spesa", Icon: ShoppingCart, color: "bg-amber-50 text-amber-600" },
  { value: "ristoranti", label: "Ristoranti", Icon: UtensilsCrossed, color: "bg-orange-50 text-orange-500" },
  { value: "casa", label: "Casa", Icon: Sofa, color: "bg-teal-50 text-teal-600" },
  { value: "trasporti", label: "Trasporti", Icon: TrainFront, color: "bg-blue-50 text-blue-500" },
  { value: "telefono", label: "Telefono", Icon: Smartphone, color: "bg-indigo-50 text-indigo-500" },
  { value: "salute", label: "Salute", Icon: HeartPulse, color: "bg-rose-50 text-rose-500" },
  { value: "abbigliamento", label: "Abbigliamento", Icon: Shirt, color: "bg-sky-50 text-sky-600" },
  { value: "svago", label: "Svago", Icon: PartyPopper, color: "bg-purple-50 text-purple-500" },
  { value: "burocrazia", label: "Burocrazia", Icon: ClipboardList, color: "bg-gray-100 text-gray-500" },
  { value: "altro", label: "Altro", Icon: Package, color: "bg-gray-100 text-gray-500" },
];

export const CATEGORY_META = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c])
) as Record<ExpenseCategory, CategoryMeta>;
