"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import SlidePanel from "./SlidePanel";

interface DetailSheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function DetailSheet({ title, subtitle, onClose, children }: DetailSheetProps) {
  return (
    <>
      {/* Mobile: full-screen slide panel (same as "Tutte le sezioni") */}
      <div className="md:hidden">
        <SlidePanel open title={title} subtitle={subtitle} onClose={onClose} size="full">
          <div className="space-y-4">
            {children}
          </div>
        </SlidePanel>
      </div>

      {/* Desktop: centered modal */}
      <div className="hidden md:block">
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <div
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white px-5 py-4 rounded-t-xl">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-gray-900 truncate">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 text-sm text-gray-400">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="ml-3 shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4 space-y-4">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface DetailRowProps {
  label: string;
  children: ReactNode;
}

export function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <span className="text-sm font-medium text-gray-400 sm:w-28 sm:shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{children}</span>
    </div>
  );
}
