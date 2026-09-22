"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusRegion } from "@/components/ui/StatusRegion";
import { TurnstileWidget } from "@/components/invitation/TurnstileWidget";

type Phase =
  | "loading"
  | "missing-token"
  | "turnstile-unavailable"
  | "verifying"
  | "submitting"
  | "success"
  | "error";

/** Exactly `#token=<43-char base64url invitation token>`. */
const FRAGMENT_TOKEN_PATTERN = /^token=([A-Za-z0-9_-]{43})$/;

function extractTokenFromFragment(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = FRAGMENT_TOKEN_PATTERN.exec(raw);
  return match ? match[1] : null;
}

/**
 * Real invitation-acceptance flow.
 *
 * The invitation token travels only in the URL fragment
 * (`#token=...`), which the server never sees. This component reads it
 * client-side and scrubs it from the visible URL/history immediately —
 * before analytics or any unrelated third-party script can read it — via
 * `history.replaceState`. The token is held only in a `useRef` (never in
 * localStorage, sessionStorage, a cookie, or component state that would
 * appear in a serialized snapshot) until it is sent, once, to this app's
 * own `/api/partner-invitations/accept` BFF endpoint. Neither the
 * SalesChain bootstrap token nor the Partner session token ever reaches
 * this component — the BFF response is the generic
 * `{ status: "AUTHENTICATED" }` shape.
 */
export function InvitationAcceptShell() {
  const [phase, setPhase] = useState<Phase>("loading");
  const router = useRouter();
  const invitationTokenRef = useRef<string | null>(null);
  const submittedRef = useRef(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  useEffect(() => {
    const token = extractTokenFromFragment(window.location.hash);

    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (!token) {
      // The initial phase can only be derived from `window.location`, a
      // browser-only global unavailable during SSR — there is no render-phase
      // alternative and nothing external to subscribe to instead.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("missing-token");
      return;
    }

    invitationTokenRef.current = token;
    setPhase(siteKey ? "verifying" : "turnstile-unavailable");
    // Reading the fragment and scrubbing it must happen exactly once, on
    // mount, regardless of later siteKey changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async (turnstileToken: string) => {
    if (submittedRef.current) return;

    const invitationToken = invitationTokenRef.current;
    if (!invitationToken) {
      setPhase("missing-token");
      return;
    }

    submittedRef.current = true;
    invitationTokenRef.current = null;
    setPhase("submitting");

    try {
      const response = await fetch("/api/partner-invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationToken, turnstileToken }),
      });

      if (!response.ok) {
        setPhase("error");
        return;
      }

      const data: unknown = await response.json();
      const authenticated =
        typeof data === "object" &&
        data !== null &&
        !Array.isArray(data) &&
        Object.keys(data).length === 1 &&
        (data as Record<string, unknown>).status === "AUTHENTICATED";

      setPhase(authenticated ? "success" : "error");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (phase !== "success") return;
    const timer = window.setTimeout(() => {
      router.replace("/portal");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [phase, router]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-3xl text-charcoal-900 sm:text-4xl">
          Einladung annehmen
        </h1>
      </div>

      {phase === "loading" && (
        <StatusRegion tone="info" className="max-w-2xl">
          Ihre Einladung wird geprüft …
        </StatusRegion>
      )}

      {phase === "missing-token" && (
        <StatusRegion tone="warning" className="max-w-2xl">
          Dieser Link enthält keine gültige Einladung. Bitte verwenden Sie
          den vollständigen Link aus Ihrer Einladungs-E-Mail oder fordern
          Sie eine neue Einladung an.
        </StatusRegion>
      )}

      {phase === "turnstile-unavailable" && (
        <StatusRegion tone="warning" className="max-w-2xl">
          Die Sicherheitsprüfung ist derzeit nicht verfügbar. Bitte
          versuchen Sie es in Kürze erneut.
        </StatusRegion>
      )}

      {(phase === "verifying" || phase === "submitting") && siteKey && (
        <Card className="max-w-2xl">
          <p className="text-sm font-medium text-charcoal-900">
            Sicherheitsprüfung
          </p>
          <div className="mt-4">
            <TurnstileWidget
              siteKey={siteKey}
              onToken={submit}
              onError={() => setPhase("error")}
            />
          </div>
          {phase === "submitting" && (
            <p role="status" aria-live="polite" className="mt-4 text-sm text-charcoal-500">
              Einladung wird bestätigt …
            </p>
          )}
        </Card>
      )}

      {phase === "success" && (
        <>
          <StatusRegion tone="info" className="max-w-2xl">
            Ihre Einladung wurde angenommen. Sie werden zum Partnerportal
            weitergeleitet.
          </StatusRegion>
          <Button href="/portal">Zum Partnerportal</Button>
        </>
      )}

      {phase === "error" && (
        <StatusRegion tone="warning" className="max-w-2xl">
          Ihre Einladung konnte derzeit nicht verarbeitet werden. Bitte
          versuchen Sie es später erneut.
        </StatusRegion>
      )}
    </div>
  );
}
