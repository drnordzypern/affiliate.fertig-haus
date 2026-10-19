"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action: TurnstileAction;
          callback: (token: string) => void;
          "error-callback"?: () => void;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/**
 * The action names SalesChain verifies server-side (TurnstileVerifier): a token
 * minted for one action is refused for any other. Fixed per form, never taken
 * from a URL or a request.
 */
export type TurnstileAction =
  | "partner-invitation-acceptance"
  | "partner-application-direct"
  | "partner-application-referred"
  | "customer-referral-lead";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * Thin wrapper around Cloudflare's official Turnstile widget script — no
 * npm dependency, per AGENTS.md ("prefer the official script/widget
 * integration without adding a dependency"). Tests mock the `window.turnstile`
 * boundary (see `__tests__/invitation-accept.test.tsx`) instead of loading
 * the real Cloudflare script.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
  action = "partner-invitation-acceptance",
  resetKey = 0,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError?: () => void;
  /** Defaults to the invitation action so existing callers are unchanged. */
  action?: TurnstileAction;
  /** Change this value to discard the spent token and show a fresh challenge. */
  resetKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current || widgetIdRef.current) {
      return;
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      callback: onToken,
      "error-callback": onError,
    });
  }, [siteKey, onToken, onError, action]);

  useEffect(() => {
    // Covers the case where the script (and `window.turnstile`) is already
    // present from an earlier mount — `Script`'s `onLoad` only fires once
    // per script load, not on every remount.
    renderWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
    // resetKey is deliberately a dependency: changing it removes the widget in
    // the cleanup above and renders a fresh one.
  }, [renderWidget, resetKey]);

  return (
    <>
      <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" onLoad={renderWidget} />
      <div ref={containerRef} data-testid="turnstile-widget" />
    </>
  );
}
