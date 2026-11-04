"use client";

import { useEffect, useRef } from "react";

/**
 * Brings a form's outcome into view and moves focus to it when it appears: a form is sent from its
 * bottom edge, so the confirmation or error would otherwise sit outside the screen. The element's
 * scroll margin keeps it clear of the sticky header.
 */
export function useRevealOutcome<T extends HTMLElement>(outcome: unknown, block: ScrollLogicalPosition = "start") {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!outcome) return;
    ref.current?.scrollIntoView?.({ block });
    ref.current?.focus({ preventScroll: true });
  }, [outcome, block]);
  return ref;
}
