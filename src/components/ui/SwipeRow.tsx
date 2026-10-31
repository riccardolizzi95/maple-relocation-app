"use client";

import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SwipeAction {
  Icon: LucideIcon;
  /** sfondo che compare sotto la riga mentre la si trascina (es. "bg-emerald-50") */
  bg: string;
  /** colore dell'icona prima della soglia e oltre la soglia */
  idle: string;
  active: string;
  onTrigger: () => void;
}

const THRESHOLD = 80;
const MAX = 110;

/**
 * Riga trascinabile col dito (mobile): verso destra esegue `toRight`, verso
 * sinistra `toLeft`, oltre una soglia di 80px. Un movimento più verticale che
 * orizzontale resta uno scroll normale. Usata da Checklist e Budget.
 */
export default function SwipeRow({
  toRight,
  toLeft,
  className,
  children,
}: {
  toRight?: SwipeAction;
  toLeft?: SwipeAction;
  className?: string;
  children: React.ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null }>({ x: 0, y: 0, horizontal: null });

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, horizontal: null };
    setDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (start.current.horizontal === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      start.current.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!start.current.horizontal) return;
    // si trascina solo verso un lato che ha un'azione
    if ((dx > 0 && !toRight) || (dx < 0 && !toLeft)) return setDragX(0);
    setDragX(Math.max(-MAX, Math.min(MAX, dx)));
  }
  function onTouchEnd() {
    setDragging(false);
    if (dragX > THRESHOLD) toRight?.onTrigger();
    else if (dragX < -THRESHOLD) toLeft?.onTrigger();
    setDragX(0);
    start.current.horizontal = null;
  }

  const action = dragX > 0 ? toRight : dragX < 0 ? toLeft : undefined;

  return (
    <div className="relative overflow-hidden">
      {action && (
        <div className={cn("absolute inset-0 flex items-center px-4", dragX > 0 ? "justify-start" : "justify-end", action.bg)}>
          <action.Icon className={cn("h-5 w-5", Math.abs(dragX) > THRESHOLD ? action.active : action.idle)} />
        </div>
      )}
      <div
        className={cn("relative", className, !dragging && "transition-transform duration-150")}
        style={{ transform: `translateX(${dragX}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
