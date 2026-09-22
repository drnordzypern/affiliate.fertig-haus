"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Calls the Affiliate BFF logout route, which clears the HttpOnly Partner
 * session cookie server-side, then returns the user to the public landing
 * page. This component never reads or sees the session token itself.
 */
export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/partner-sessions/logout", { method: "POST" });
    } finally {
      router.replace("/");
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="inline-flex w-fit items-center justify-center rounded-sm border border-charcoal-900/30 px-4 py-2 text-sm font-medium text-charcoal-700 transition-colors hover:border-charcoal-900 hover:text-charcoal-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Wird abgemeldet …" : "Abmelden"}
    </button>
  );
}
