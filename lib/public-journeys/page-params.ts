/**
 * The landing-URL query values the public pages pass to their forms. Read on
 * the server from the page's `searchParams`, never in the browser, and handed
 * over raw (first value only, bounded): the BFF is the one place that decides
 * whether they are valid, so a malformed pair is refused there, not repaired.
 */
type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const picked = Array.isArray(value) ? value[0] : value;
  return typeof picked === "string" && picked.length > 0 && picked.length <= 200 ? picked : undefined;
}

export function qrTracking(searchParams: SearchParams): { qr?: string; v?: string } {
  const qr = first(searchParams.qr);
  const v = first(searchParams.v);
  return { ...(qr ? { qr } : {}), ...(v ? { v } : {}) };
}

export function referralTracking(searchParams: SearchParams) {
  const map = {
    utmSource: first(searchParams.utm_source),
    utmMedium: first(searchParams.utm_medium),
    utmCampaign: first(searchParams.utm_campaign),
    utmTerm: first(searchParams.utm_term),
    utmContent: first(searchParams.utm_content),
  };
  return {
    ...qrTracking(searchParams),
    ...Object.fromEntries(Object.entries(map).filter(([, value]) => value !== undefined)),
  } as ReturnType<typeof qrTracking> & {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  };
}
