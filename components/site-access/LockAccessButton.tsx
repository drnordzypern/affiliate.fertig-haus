"use client";

import { useState } from "react";

/**
 * Clears only the temporary pre-launch site-access cookie (never the
 * Partner-session cookie — see LogoutButton for that) and returns the
 * browser to the neutral access surface. A full navigation (not the
 * Next.js client router) is used deliberately: once the cookie is
 * cleared, the proxy answers every request — including an RSC/Flight
 * fetch the client router would otherwise issue — with the neutral gate
 * page, so a full reload is the only response shape that is guaranteed
 * to render correctly here.
 */
export function LockAccessButton() {
  const [pending, setPending] = useState(false);

  async function handleLock() {
    setPending(true);
    try {
      await fetch("/api/site-access/lock", { method: "POST" });
    } finally {
      // A full navigation is required here, not the Next.js client router —
      // see this component's own doc comment for why.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLock}
      disabled={pending}
      className="text-xs text-charcoal-500 underline decoration-dotted underline-offset-2 hover:text-charcoal-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Wird gesperrt …" : "Zugang sperren"}
    </button>
  );
}
