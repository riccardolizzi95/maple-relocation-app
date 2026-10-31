"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** "full" stretches to near-full screen; "auto" sizes to content */
  size?: "full" | "auto";
  children: ReactNode;
}

export default function SlidePanel({
  open,
  onClose,
  title,
  subtitle,
  size = "auto",
  children,
}: SlidePanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`absolute bottom-0 left-0 right-0 rounded-t-2xl bg-card border-t border-border animate-in slide-in-from-bottom duration-200 ${
          size === "full" ? "top-4 overflow-y-auto" : ""
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between rounded-t-2xl bg-card px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
