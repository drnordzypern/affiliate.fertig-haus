"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/form";
import { TurnstileWidget } from "@/components/invitation/TurnstileWidget";
import { ConsentBlock, MESSAGES, messageForFailure, Notice, type PublicContextOk } from "./journey-ui";

type Props = {
  code: string;
  /** The scanned-QR pair and campaign values of the landing URL, passed by the page (never read here). */
  tracking: {
    qr?: string;
    v?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  };
  /** Server-decided feature gate. When false, nothing is requested and nothing can be sent. */
  enabled: boolean;
};

type Phase = "off" | "loading" | "link-unavailable" | "service-unavailable" | "ready" | "success";

/**
 * Customer interest registration after a partner's personal link or QR. It
 * creates a lead credited to that partner through SalesChain's attribution
 * session; it is never a partner application (that is the separate /apply
 * journey) and it never shows who referred the visitor.
 *
 * Outcome is uniform on purpose: a new registration and one SalesChain
 * already holds look the same (no reference, same text), so the form cannot
 * be used to learn whether an address is known, and a retry after a lost
 * answer is harmless.
 */
export function ReferralForm({ code, tracking, enabled }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const [phase, setPhase] = useState<Phase>(enabled ? "loading" : "off");
  const [context, setContext] = useState<PublicContextOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const requested = useRef(false);

  const loadContext = useCallback(async () => {
    try {
      const response = await fetch(`/api/referrals/${encodeURIComponent(code)}/context`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tracking),
        cache: "no-store",
      });
      if (!response.ok) {
        setPhase(response.status === 404 || response.status === 400 ? "link-unavailable" : "service-unavailable");
        return;
      }
      const data = (await response.json()) as PublicContextOk;
      const pending = data?.status === "OK" && data.consent && data.consent.text === null;
      if (
        !pending &&
        (data?.status !== "OK" ||
          typeof data.consent?.version !== "string" ||
          typeof data.attributionCorrelationId !== "string" ||
          !Array.isArray(data.products))
      ) {
        setPhase("service-unavailable");
        return;
      }
      setContext(data);
      setPhase("ready");
    } catch {
      setPhase("service-unavailable");
    }
  }, [code, tracking]);

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
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/referrals/${encodeURIComponent(code)}/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: String(values.firstName ?? ""),
          lastName: String(values.lastName ?? ""),
          email: String(values.email ?? ""),
          phone: String(values.phone ?? ""),
          productCode: String(values.productCode ?? ""),
          consentToContact: values.consentToContact === "on",
          attributionCorrelationId: context.attributionCorrelationId,
          turnstileToken,
          consentPolicyVersion: context.consent.version ?? "",
        }),
      });
      if (response.ok) {
        setPhase("success");
        return;
      }
      setError(messageForFailure(response.status));
    } catch {
      setError(MESSAGES.retry);
    }
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
          <h2 className="font-semibold text-xl text-charcoal-900">Vielen Dank – Ihre Anfrage ist eingegangen.</h2>
          <p className="text-sm leading-relaxed text-charcoal-700">
            Wir haben Ihr Interesse vermerkt und melden uns bei Ihnen.
          </p>
        </div>
      </Card>
    );
  }

  // phase === "ready"
  if (!context?.consent.text) return <Notice tone="warning">{MESSAGES.consentPending}</Notice>;
  if (!siteKey) return <Notice tone="warning">{MESSAGES.securityCheckUnavailable}</Notice>;
  const products = context.products ?? [];
  if (products.length === 0) return <Notice tone="warning">{MESSAGES.linkUnavailable}</Notice>;

  return (
    <Card className="max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-8" aria-label="Interesse anmelden">
        <fieldset className="flex flex-col gap-5">
          <legend className="font-semibold text-lg text-charcoal-900">Ihre Angaben</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="firstName" name="firstName" label="Vorname" required maxLength={100} autoComplete="given-name" />
            <TextField id="lastName" name="lastName" label="Nachname" required maxLength={100} autoComplete="family-name" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="email" name="email" label="E-Mail-Adresse" type="email" maxLength={254} autoComplete="email" />
            <TextField id="phone" name="phone" label="Telefon" type="tel" minLength={7} maxLength={30} autoComplete="tel" />
          </div>
          <p className="text-xs text-charcoal-500">Bitte geben Sie mindestens eine E-Mail-Adresse oder eine Telefonnummer an.</p>
          <SelectField
            id="productCode"
            name="productCode"
            label="Ihr Interesse"
            required
            options={products.map((product) => ({ value: product.code, label: product.name }))}
          />
        </fieldset>

        <ConsentBlock id="consentToContact" text={context.consent.text} />

        <div className="flex flex-col gap-4 border-t border-stone-200 pt-6">
          <TurnstileWidget siteKey={siteKey} action="customer-referral-lead" resetKey={resetKey} onToken={onToken} />
          {error && (
            <p role="alert" className="text-sm font-medium text-terracotta-600">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting || !turnstileToken} className="w-fit">
            {submitting ? "Wird gesendet …" : "Anfrage absenden"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
