import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApplicationForm } from "@/components/public/ApplicationForm";
import { ReferralForm } from "@/components/public/ReferralForm";

// Mocks the Turnstile widget boundary (window.turnstile) instead of loading the
// real Cloudflare script, and the BFF boundary (fetch). No real network.
vi.mock("next/script", () => ({ default: () => null }));

// The whole suite runs in parallel; keep async queries patient so load never causes a false failure.
configure({ asyncUtilTimeout: 5_000 });

type RenderOptions = { sitekey: string; action: string; callback: (token: string) => void };
const UUID_B = "20000000-0000-4000-8000-000000000002";
const CODE = "FH-recruit_referral-code";

let renderMock: ReturnType<typeof vi.fn<(container: HTMLElement, options: RenderOptions) => string>>;
let fetchMock: ReturnType<typeof vi.fn>;

const res = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const consentText = { paragraphs: ["fixture statement"], checkboxLabel: "fixture checkbox" };
const context = (over: Record<string, unknown> = {}) => ({
  status: "OK",
  programmeName: "Fertig-Haus Affiliate System",
  brandName: "Fertig-Haus",
  consent: { version: "policy-1", text: consentText },
  ...over,
});

function solveTurnstile(token = "cf-token") {
  const last = renderMock.mock.calls[renderMock.mock.calls.length - 1]!;
  act(() => last[1].callback(token));
}

function fill(id: string, value: string) {
  fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
}

function fillApplication(over: Record<string, string> = {}) {
  fill("name", over.name ?? "Erika Muster");
  fill("email", over.email ?? "erika@example.invalid");
  fill("phone", over.phone ?? "+49 170 0000000");
  fill("partnerType", over.partnerType ?? "PRIVATE_REFERRER");
  fireEvent.click(screen.getByLabelText("fixture checkbox"));
}

function bodyOf(call: number) {
  return JSON.parse((fetchMock.mock.calls[call]![1] as RequestInit).body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  renderMock = vi.fn(() => "widget-id");
  window.turnstile = { render: renderMock, remove: vi.fn() };
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete window.turnstile;
});

describe("partner application form", () => {
  const direct = () => render(<ApplicationForm variant="direct" tracking={{}} enabled />);
  const referred = () =>
    render(<ApplicationForm variant="referred" code={CODE} tracking={{ qr: "fhqr_public_asset", v: "2" }} enabled />);

  test("feature off: an honest notice, no request, no form, no widget", async () => {
    render(<ApplicationForm variant="direct" tracking={{}} enabled={false} />);
    expect(screen.getByText("Diese Seite ist derzeit nicht verfügbar.")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  test("unavailable link and outage are different, generic states; outage can be retried", async () => {
    fetchMock.mockResolvedValueOnce(res({ status: "UNAVAILABLE" }, 404));
    direct();
    expect(await screen.findByText("Dieser Link ist ungültig oder nicht mehr verfügbar.")).toBeTruthy();
    cleanup();

    fetchMock.mockResolvedValueOnce(res({ status: "UNAVAILABLE" }, 503)).mockResolvedValueOnce(res(context()));
    direct();
    expect(await screen.findByText(/vorübergehend nicht erreichbar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("form", { name: "Partnerbewerbung" })).toBeTruthy();
    // one request for the unavailable link above, then the outage and its retry
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("no approved consent wording: no form, no checkbox, no submit button", async () => {
    fetchMock.mockResolvedValueOnce(res(context({ consent: { version: "policy-1", text: null } })));
    direct();
    expect(await screen.findByText(/Dieses Formular ist derzeit nicht verfügbar/)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /absenden/ })).toBeNull();
    expect(renderMock).not.toHaveBeenCalled();
  });

  test("nothing approved at all (no version): the same pending state, never a form", async () => {
    fetchMock.mockResolvedValueOnce(res({ status: "OK", consent: { version: null, text: null } }));
    direct();
    expect(await screen.findByText(/Dieses Formular ist derzeit nicht verfügbar/)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(renderMock).not.toHaveBeenCalled();
    cleanup();
    fetchMock.mockResolvedValueOnce(res({ status: "OK", consent: { version: null, text: null } }));
    render(<ReferralForm code={CODE} tracking={{}} enabled />);
    expect(await screen.findByText(/Dieses Formular ist derzeit nicht verfügbar/)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  test("no Turnstile site key: the form cannot be submitted", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    fetchMock.mockResolvedValueOnce(res(context()));
    direct();
    expect(await screen.findByText(/Sicherheitsprüfung ist derzeit nicht verfügbar/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /absenden/ })).toBeNull();
  });

  test("shows the approved wording and a required, unticked checkbox; submit waits for the challenge", async () => {
    fetchMock.mockResolvedValueOnce(res(context()));
    direct();
    expect(await screen.findByText("fixture statement")).toBeTruthy();
    const checkbox = screen.getByLabelText("fixture checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.required).toBe(true);
    expect((screen.getByRole("button", { name: "Bewerbung absenden" }) as HTMLButtonElement).disabled).toBe(true);
    expect(renderMock.mock.calls[0]![1].action).toBe("partner-application-direct");
    solveTurnstile();
    expect((screen.getByRole("button", { name: "Bewerbung absenden" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("direct: sends the answers with an idempotency key, the Turnstile token and the displayed consent version", async () => {
    fetchMock.mockResolvedValueOnce(res(context())).mockResolvedValueOnce(res({ status: "OK", publicReference: "PA-2026-ABCDEF0123" }));
    direct();
    await screen.findByRole("form");
    fillApplication();
    solveTurnstile("cf-token-1");
    fireEvent.submit(screen.getByRole("form"));
    expect(await screen.findByText("PA-2026-ABCDEF0123")).toBeTruthy();

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/applications/direct/context");
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/applications/direct");
    const body = bodyOf(1);
    expect(body).toMatchObject({
      name: "Erika Muster",
      email: "erika@example.invalid",
      phone: "+49 170 0000000",
      partnerType: "PRIVATE_REFERRER",
      consentToApply: true,
      turnstileToken: "cf-token-1",
      consentPolicyVersion: "policy-1",
    });
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).not.toHaveProperty("attributionCorrelationId");
    expect(screen.getByText(/weder ein Zugang noch ein Partnerstatus noch ein Provisionsanspruch/)).toBeTruthy();
  });

  test("referred: uses the recruitment BFF routes, passes the QR pair and sends the server-issued attribution id", async () => {
    fetchMock
      .mockResolvedValueOnce(res(context({ attributionCorrelationId: UUID_B })))
      .mockResolvedValueOnce(res({ status: "OK", publicReference: "PA-2026-ABCDEF0123" }));
    referred();
    await screen.findByRole("form");
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/applications/referred/${CODE}/context`);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ qr: "fhqr_public_asset", v: "2" });
    expect(renderMock.mock.calls[0]![1].action).toBe("partner-application-referred");
    fillApplication();
    solveTurnstile();
    fireEvent.submit(screen.getByRole("form"));
    await screen.findByText("PA-2026-ABCDEF0123");
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/applications/referred/${CODE}`);
    expect(bodyOf(1).attributionCorrelationId).toBe(UUID_B);
    // the page never learns or shows who invited the visitor
    expect(document.body.textContent).not.toMatch(/Partner-?ID|Sponsor|eingeladen von/i);
  });

  test("Turnstile refusal: a generic error, answers kept, a fresh challenge, the same key on an identical retry", async () => {
    fetchMock
      .mockResolvedValueOnce(res(context()))
      .mockResolvedValueOnce(res({ status: "UNAVAILABLE" }, 404))
      .mockResolvedValueOnce(res({ status: "OK", publicReference: "PA-2026-ABCDEF0123" }));
    direct();
    await screen.findByRole("form");
    fillApplication();
    solveTurnstile("cf-token-1");
    fireEvent.submit(screen.getByRole("form"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Die Angaben konnten nicht angenommen werden. Bitte versuchen Sie es erneut.");
    // the error never says why (a refused challenge looks like any other 404)
    expect(screen.getByRole("alert").textContent).not.toMatch(/turnstile|captcha|bot|sicherheit/i);
    expect((document.getElementById("name") as HTMLInputElement).value).toBe("Erika Muster");
    // spent token discarded, new widget rendered, submit disabled until it is solved
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2));
    expect((screen.getByRole("button", { name: "Bewerbung absenden" }) as HTMLButtonElement).disabled).toBe(true);

    solveTurnstile("cf-token-2");
    fireEvent.submit(screen.getByRole("form"));
    await screen.findByText("PA-2026-ABCDEF0123");
    expect(bodyOf(2).idempotencyKey).toBe(bodyOf(1).idempotencyKey);
    expect(bodyOf(2).turnstileToken).toBe("cf-token-2");
  });

  test("a corrected answer starts a new idempotency key (not refused as a conflicting reuse)", async () => {
    fetchMock
      .mockResolvedValueOnce(res(context()))
      .mockResolvedValueOnce(res({ status: "UNAVAILABLE" }, 503))
      .mockResolvedValueOnce(res({ status: "OK", publicReference: "PA-2026-ABCDEF0123" }));
    direct();
    await screen.findByRole("form");
    fillApplication();
    solveTurnstile("t1");
    fireEvent.submit(screen.getByRole("form"));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/Ihre Eingaben bleiben erhalten/);
    fill("name", "Erika Beispiel");
    solveTurnstile("t2");
    fireEvent.submit(screen.getByRole("form"));
    await screen.findByText("PA-2026-ABCDEF0123");
    expect(bodyOf(2).idempotencyKey).not.toBe(bodyOf(1).idempotencyKey);
  });

  test.each([
    [400, /prüfen Sie Ihre Angaben/],
    [409, /konnten nicht angenommen werden/],
    [429, /Zu viele Anfragen/],
    [502, /Ihre Eingaben bleiben erhalten/],
  ])("BFF %i maps to one fixed message", async (status, message) => {
    fetchMock.mockResolvedValueOnce(res(context())).mockResolvedValueOnce(res({ status: "X" }, status));
    direct();
    await screen.findByRole("form");
    fillApplication();
    solveTurnstile();
    fireEvent.submit(screen.getByRole("form"));
    expect((await screen.findByRole("alert")).textContent).toMatch(message);
  });

  test("a network failure keeps the answers and offers a retry", async () => {
    fetchMock.mockResolvedValueOnce(res(context())).mockRejectedValueOnce(new Error("offline"));
    direct();
    await screen.findByRole("form");
    fillApplication();
    solveTurnstile();
    fireEvent.submit(screen.getByRole("form"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Ihre Eingaben bleiben erhalten/);
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("erika@example.invalid");
  });

  test("a double submit sends one request", async () => {
    let release: (value: Response) => void = () => undefined;
    fetchMock.mockResolvedValueOnce(res(context())).mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    direct();
    await screen.findByRole("form");
    fillApplication();
    solveTurnstile();
    fireEvent.submit(screen.getByRole("form"));
    fireEvent.submit(screen.getByRole("form"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => release(res({ status: "OK", publicReference: "PA-2026-ABCDEF0123" })));
    await screen.findByText("PA-2026-ABCDEF0123");
  });

  test("never touches browser storage and never puts a secret in the DOM", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    fetchMock.mockResolvedValueOnce(res(context()));
    direct();
    await screen.findByRole("form");
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(document.documentElement.innerHTML).not.toMatch(/SALESCHAIN_API_BASE_URL|api\.saleschain/);
  });
});

describe("customer referral form", () => {
  const referral = () =>
    render(
      <ReferralForm code={CODE} tracking={{ qr: "fhqr_public_asset", v: "1", utmSource: "newsletter" }} enabled />,
    );
  const ready = () =>
    context({
      attributionCorrelationId: UUID_B,
      products: [
        { code: "HAUS-1", name: "Musterhaus Eins", description: null },
        { code: "HAUS-2", name: "Musterhaus Zwei", description: "x" },
      ],
    });

  function fillReferral() {
    fill("firstName", "Erika");
    fill("lastName", "Muster");
    fill("email", "erika@example.invalid");
    fill("productCode", "HAUS-2");
    fireEvent.click(screen.getByLabelText("fixture checkbox"));
  }

  test("feature off: a notice and no request", () => {
    render(<ReferralForm code={CODE} tracking={{}} enabled={false} />);
    expect(screen.getByText("Diese Seite ist derzeit nicht verfügbar.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("requests the CUSTOMER context with the landing values and shows the products", async () => {
    fetchMock.mockResolvedValueOnce(res(ready()));
    referral();
    await screen.findByRole("form", { name: "Interesse anmelden" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/referrals/${CODE}/context`);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      qr: "fhqr_public_asset",
      v: "1",
      utmSource: "newsletter",
    });
    expect(screen.getByRole("option", { name: "Musterhaus Zwei" })).toBeTruthy();
    expect(renderMock.mock.calls[0]![1].action).toBe("customer-referral-lead");
    // the visitor is never told who referred them
    expect(document.body.textContent).not.toMatch(/Partner|Empfohlen von|empfohlen durch/i);
  });

  test("no approved wording, or no products: nothing to submit", async () => {
    fetchMock.mockResolvedValueOnce(res({ ...ready(), consent: { version: "policy-1", text: null } }));
    referral();
    expect(await screen.findByText(/Dieses Formular ist derzeit nicht verfügbar/)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    cleanup();
    fetchMock.mockResolvedValueOnce(res({ ...ready(), products: [] }));
    referral();
    expect(await screen.findByText("Dieser Link ist ungültig oder nicht mehr verfügbar.")).toBeTruthy();
  });

  test("submits the lead with the attribution id and answers uniformly without a reference", async () => {
    fetchMock.mockResolvedValueOnce(res(ready())).mockResolvedValueOnce(res({ status: "OK" }));
    referral();
    await screen.findByRole("form");
    fillReferral();
    solveTurnstile("cf-token-1");
    fireEvent.submit(screen.getByRole("form"));
    expect(await screen.findByText(/Ihre Anfrage ist eingegangen/)).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/referrals/${CODE}/leads`);
    expect(bodyOf(1)).toMatchObject({
      firstName: "Erika",
      lastName: "Muster",
      email: "erika@example.invalid",
      productCode: "HAUS-2",
      consentToContact: true,
      attributionCorrelationId: UUID_B,
      turnstileToken: "cf-token-1",
      consentPolicyVersion: "policy-1",
    });
    expect(bodyOf(1)).not.toHaveProperty("idempotencyKey");
    expect(document.body.textContent).not.toMatch(/LEAD-|Referenz/);
  });

  test("Turnstile refusal and outage: generic error, answers kept, fresh challenge", async () => {
    fetchMock
      .mockResolvedValueOnce(res(ready()))
      .mockResolvedValueOnce(res({ status: "UNAVAILABLE" }, 404))
      .mockResolvedValueOnce(res({ status: "OK" }));
    referral();
    await screen.findByRole("form");
    fillReferral();
    solveTurnstile("cf-token-1");
    fireEvent.submit(screen.getByRole("form"));
    expect((await screen.findByRole("alert")).textContent).toBe("Die Angaben konnten nicht angenommen werden. Bitte versuchen Sie es erneut.");
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2));
    expect((document.getElementById("firstName") as HTMLInputElement).value).toBe("Erika");
    solveTurnstile("cf-token-2");
    fireEvent.submit(screen.getByRole("form"));
    await screen.findByText(/Ihre Anfrage ist eingegangen/);
    expect(bodyOf(2).turnstileToken).toBe("cf-token-2");
  });
});
