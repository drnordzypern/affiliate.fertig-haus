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
          callback: (token: string) => void;
          "error-callback"?: () => void;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

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
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current || widgetIdRef.current) {
      return;
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      "error-callback": onError,
    });
  }, [siteKey, onToken, onError]);

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
  }, [renderWidget]);

  return (
    <>
      <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" onLoad={renderWidget} />
      <div ref={containerRef} data-testid="turnstile-widget" />
    </>
  );
}
