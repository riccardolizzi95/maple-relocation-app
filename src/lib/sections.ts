import {
  LayoutDashboard,
  ListChecks,
  Home,
  Briefcase,
  Wallet,
  FileText,
  Sparkles,
  StickyNote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface Section {
  href: string;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
  visible: boolean;
  favoritable: boolean;
}

export const ALL_SECTIONS: Section[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", Icon: LayoutDashboard, visible: true, favoritable: false },
  { href: "/checklist", label: "Checklist", shortLabel: "Lista", Icon: ListChecks, visible: true, favoritable: true },
  { href: "/housing", label: "Alloggio", shortLabel: "Casa", Icon: Home, visible: true, favoritable: true },
  { href: "/jobs", label: "Lavoro", shortLabel: "Lavoro", Icon: Briefcase, visible: true, favoritable: true },
  { href: "/budget", label: "Budget", shortLabel: "Budget", Icon: Wallet, visible: true, favoritable: true },
  { href: "/documents", label: "Documenti", shortLabel: "Docs", Icon: FileText, visible: true, favoritable: true },
  { href: "/guide", label: "Guide AI", shortLabel: "AI", Icon: Sparkles, visible: true, favoritable: true },
  { href: "/notes", label: "Note", shortLabel: "Note", Icon: StickyNote, visible: true, favoritable: true },
];

export const VISIBLE_SECTIONS = ALL_SECTIONS.filter((s) => s.visible);
export const FAVORITABLE_SECTIONS = VISIBLE_SECTIONS.filter((s) => s.favoritable);
