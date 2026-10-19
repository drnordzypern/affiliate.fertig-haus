"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { TurnstileWidget } from "@/components/invitation/TurnstileWidget";
import {
  ConsentBlock,
  MESSAGES,
  messageForFailure,
  Notice,
  partnerTypeOptions,
  type PublicContextOk,
} from "./journey-ui";

type Props = {
  /** "direct": a sponsor-free application. "referred": through a partner's recruitment link or QR. */
  variant: "direct" | "referred";
  code?: string;
  /** The scanned-QR pair from the landing URL, passed by the page (never read here). */
  tracking: { qr?: string; v?: string };
  /** Server-decided feature gate. When false, nothing is requested and nothing can be sent. */
  enabled: boolean;
};

type Phase = "off" | "loading" | "link-unavailable" | "service-unavailable" | "ready" | "success";

/**
 * Partner-recruitment application. Creates an application in review and
 * nothing else; it is never a customer lead and never carries customer
 * attribution (that is the separate /r/<code> journey).
 *
 * Retries: one idempotency key per distinct set of answers. Re-sending the
 * same answers (double click, lost answer) re-sends the same key, so
 * SalesChain returns the original application; changing an answer starts a
 * new key, so a correction is not refused as a conflicting reuse. A fresh
 * Turnstile token is required for every attempt, successful or not.
 */
export function ApplicationForm({ variant, code, tracking, enabled }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const [phase, setPhase] = useState<Phase>(enabled ? "loading" : "off");
  const [context, setContext] = useState<PublicContextOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const requested = useRef(false);

  const loadContext = useCallback(async () => {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tracking.qr && tracking.v ? { qr: tracking.qr, v: tracking.v } : {}),
      cache: "no-store" as const,
    };
    try {
      const response =
        variant === "direct"
          ? await fetch("/api/applications/direct/context", init)
          : await fetch(`/api/applications/referred/${encodeURIComponent(code ?? "")}/context`, init);
      if (!response.ok) {
        setPhase(response.status === 404 || response.status === 400 ? "link-unavailable" : "service-unavailable");
        return;
      }
      const data = (await response.json()) as PublicContextOk;
      if (data?.status !== "OK" || !data.consent || (data.consent.version !== null && typeof data.consent.version !== "string")) {
        setPhase("service-unavailable");
        return;
      }
      setContext(data);
      setPhase("ready");
    } catch {
      setPhase("service-unavailable");
    }
  }, [variant, code, tracking.qr, tracking.v]);

  useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;
    void loadContext();
  }, [enabled, loadContext]);

  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!context || submitting || !turnstileToken) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const answers = {
      name: String(values.name ?? ""),
      email: String(values.email ?? ""),
      phone: String(values.phone ?? ""),
      company: String(values.company ?? ""),
      partnerType: String(values.partnerType ?? ""),
      region: String(values.region ?? ""),
      websiteOrSocialProfile: String(values.websiteOrSocialProfile ?? ""),
      message: String(values.message ?? ""),
    };
    const fingerprint = JSON.stringify(answers);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    setError(null);
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...answers,
        consentToApply: values.consentToApply === "on",
        idempotencyKey: attempt.current.key,
        turnstileToken,
        consentPolicyVersion: context.consent.version ?? "",
        ...(variant === "referred" ? { attributionCorrelationId: context.attributionCorrelationId } : {}),
      }),
    };
    try {
      const response =
        variant === "direct"
          ? await fetch("/api/applications/direct", init)
          : await fetch(`/api/applications/referred/${encodeURIComponent(code ?? "")}`, init);
      const body = (await response.json().catch(() => ({}))) as { publicReference?: string };
      if (response.ok) {
        setReference(typeof body.publicReference === "string" ? body.publicReference : "");
        setPhase("success");
        return;
      }
      setError(messageForFailure(response.status));
    } catch {
      setError(MESSAGES.retry);
    }
    // A spent or refused token is never reusable: discard it and show a fresh challenge.
    setTurnstileToken(null);
    setResetKey((value) => value + 1);
    setSubmitting(false);
  };

  if (phase === "off") return <Notice tone="warning">{MESSAGES.off}</Notice>;
  if (phase === "loading") return <Notice>{MESSAGES.loading}</Notice>;
  if (phase === "link-unavailable") return <Notice tone="warning">{MESSAGES.linkUnavailable}</Notice>;
  if (phase === "service-unavailable") {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warning">{MESSAGES.serviceUnavailable}</Notice>
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setPhase("loading");
              void loadContext();
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }
  if (phase === "success") {
    return (
      <Card className="max-w-2xl">
        <div role="status" className="flex flex-col gap-3">
          <h2 className="font-semibold text-xl text-charcoal-900">Vielen Dank вЂ“ Ihre Bewerbung ist eingegangen.</h2>
          <p className="text-sm leading-relaxed text-charcoal-700">
            Ihre Bewerbung wird geprГјft. Mit dieser Bewerbung entstehen weder ein Zugang noch ein Partnerstatus noch
            ein Provisionsanspruch.
          </p>
          {reference && (
            <p className="text-sm text-charcoal-700">
              Ihre Referenz: <strong data-testid="application-reference">{reference}</strong>
            </p>
          )}
        </div>
      </Card>
    );
  }

  // phase === "ready"
  if (!context?.consent.text) return <Notice tone="warning">{MESSAGES.consentPending}</Notice>;
  if (!siteKey) return <Notice tone="warning">{MESSAGES.securityCheckUnavailable}</Notice>;

  const action = variant === "direct" ? "partner-application-direct" : "partner-application-referred";
  return (
    <Card className="max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-8" aria-label="Partnerbewerbung">
        <fieldset className="flex flex-col gap-5">
          <legend className="font-semibold text-lg text-charcoal-900">PersГ¶nliche Angaben & Kontakt</legend>
          <TextField id="name" name="name" label="Vor- und Nachname" required minLength={2} maxLength={120} autoComplete="name" />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="email" name="email" label="E-Mail-Adresse" type="email" required maxLength={254} autoComplete="email" />
            <TextField id="phone" name="phone" label="Telefon" type="tel" required minLength={6} maxLength={40} autoComplete="tel" />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-5">
          <legend className="font-semibold text-lg text-charcoal-900">Partnertyp & Region</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField id="partnerType" name="partnerType" label="Partnertyp" required options={partnerTypeOptions} />
            <TextField id="region" name="region" label="Region / Bundesland (optional)" maxLength={120} autoComplete="off" />
          </div>
          <TextField id="company" name="company" label="Unternehmen (optional)" maxLength={160} autoComplete="organization" />
          <TextField
            id="websiteOrSocialProfile"
            name="websiteOrSocialProfile"
            label="Website oder Profil (optional)"
            maxLength={500}
            autoComplete="off"
          />
          <TextAreaField id="message" name="message" label="Nachricht (optional)" maxLength={2000} />
        </fieldset>

        <ConsentBlock id="consentToApply" text={context.consent.text} />

        <div className="flex flex-col gap-4 border-t border-stone-200 pt-6">
          <TurnstileWidget siteKey={siteKey} action={action} resetKey={resetKey} onToken={onToken} />
          {error && (
            <p role="alert" className="text-sm font-medium text-terracotta-600">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting || !turnstileToken} className="w-fit">
            {submitting ? "Wird gesendet вЂ¦" : "Bewerbung absenden"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
