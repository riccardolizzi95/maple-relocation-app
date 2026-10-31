"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalShellProps {
  title: string;
  onClose: () => void;
  /** Optional tab row rendered under the header */
  tabs?: ReactNode;
  /** Optional sticky footer (action buttons) */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Contenitore modale unificato: bottom sheet a pieno schermo su mobile
 * (stessa tecnica del menu Sezioni / SlidePanel), modale centrato su desktop.
 * Un solo albero DOM per non duplicare lo stato dei form.
 */
export default function ModalShell({ title, onClose, tabs, footer, children }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={
          "absolute flex flex-col bg-card border-border " +
          // Mobile: bottom sheet full-screen
          "bottom-0 left-0 right-0 top-4 rounded-t-2xl border-t animate-in slide-in-from-bottom duration-200 " +
          // Desktop: centered modal
          "md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:max-h-[90vh] md:w-full md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border md:shadow-xl md:animate-none"
        }
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3 md:border-b md:border-gray-100 md:py-4">
          <h2 className="text-base font-semibold tracking-tight text-gray-900 md:text-lg">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        {tabs && (
          <div className="shrink-0 border-b border-gray-100">
            {tabs}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-gray-100 px-5 py-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:py-4 md:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
