import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { cookies, cookieStore } = vi.hoisted(() => {
  const backing = new Map<string, string>();
  const store = {
    get: (name: string) => (backing.has(name) ? { name, value: backing.get(name)! } : undefined),
    __set: (name: string, value: string) => backing.set(name, value),
    __clear: () => backing.clear(),
  };
  return { cookies: vi.fn(async () => store), cookieStore: store };
});

const { redirectMock, routerReplace, checkPartnerSessionMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  routerReplace: vi.fn(),
  checkPartnerSessionMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ replace: routerReplace }),
}));
vi.mock("@/lib/saleschain/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/saleschain/client")>();
  return { ...actual, checkPartnerSession: checkPartnerSessionMock };
});

const { default: PortalPage } = await import("@/app/portal/page");

const VALID_SESSION_TOKEN = "A".repeat(43);

function reset() {
  cookieStore.__clear();
  redirectMock.mockClear();
  checkPartnerSessionMock.mockReset();
}

/**
 * DNL1-63: cookie presence/shape alone is never authorization. These
 * cover the real server-side check against SalesChain's
 * GET /v1/partner-sessions/me (mocked at the lib/saleschain/client
 * boundary — __tests__/saleschain-client.test.ts covers the actual
 * upstream-calling behavior of checkPartnerSession itself).
 */

test("redirects with no cookie at all, without calling SalesChain", async () => {
  reset();

  await expect(PortalPage()).rejects.toThrow("REDIRECT:/einladung");
  expect(checkPartnerSessionMock).not.toHaveBeenCalled();
});

test("redirects for a malformed cookie value, without calling SalesChain", async () => {
  reset();
  cookieStore.__set("partner_session", "not-a-valid-token");

  await expect(PortalPage()).rejects.toThrow("REDIRECT:/einladung");
  expect(checkPartnerSessionMock).not.toHaveBeenCalled();
});

test("redirects for a well-formed but fabricated cookie SalesChain rejects", async () => {
  reset();
  cookieStore.__set("partner_session", VALID_SESSION_TOKEN);
  checkPartnerSessionMock.mockResolvedValue(false);

  await expect(PortalPage()).rejects.toThrow("REDIRECT:/einladung");
  expect(checkPartnerSessionMock).toHaveBeenCalledWith({
    partnerSessionToken: VALID_SESSION_TOKEN,
  });
});

test("renders the dashboard only when SalesChain confirms the session live", async () => {
  reset();
  cookieStore.__set("partner_session", VALID_SESSION_TOKEN);
  checkPartnerSessionMock.mockResolvedValue(true);

  const element = await PortalPage();
  render(element);

  expect(screen.getByRole("heading", { level: 1, name: "Partnerportal" })).toBeDefined();
  expect(redirectMock).not.toHaveBeenCalled();
});

test("fails closed (redirects) when checkPartnerSession itself throws unexpectedly", async () => {
  reset();
  cookieStore.__set("partner_session", VALID_SESSION_TOKEN);
  checkPartnerSessionMock.mockRejectedValue(new Error("should not happen, but fail closed anyway"));

  await expect(PortalPage()).rejects.toThrow("REDIRECT:/einladung");
});

test("renders a real, visible logout control that makes no network call on render", async () => {
  reset();
  cookieStore.__set("partner_session", VALID_SESSION_TOKEN);
  checkPartnerSessionMock.mockResolvedValue(true);
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  render(await PortalPage());

  expect(screen.getByRole("button", { name: /abmelden/i })).toBeDefined();
  expect(fetchSpy).not.toHaveBeenCalled();

  fetchSpy.mockRestore();
});

test("logout sends no bearer token or request body from the browser", async () => {
  reset();
  cookieStore.__set("partner_session", VALID_SESSION_TOKEN);
  checkPartnerSessionMock.mockResolvedValue(true);
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ status: "LOGGED_OUT" }), { status: 200 }));

  render(await PortalPage());
  fireEvent.click(screen.getByRole("button", { name: /abmelden/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/partner-sessions/logout");
  expect(init).toEqual({ method: "POST" });
  expect(JSON.stringify(init)).not.toMatch(/authorization|bearer|token/i);
  await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/"));

  fetchMock.mockRestore();
});

test("shows only the honest empty state for the referral link — no fake link, no QR", async () => {
  reset();
  cookieStore.__set("partner_session", VALID_SESSION_TOKEN);
  checkPartnerSessionMock.mockResolvedValue(true);

  const { container } = render(await PortalPage());

  expect(
    screen.getByText(
      "Ihr persönlicher Empfehlungslink wird nach der Zuordnung zum Partnerprogramm hier bereitgestellt."
    )
  ).toBeDefined();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(container.querySelector("svg")).toBeNull();
  expect(screen.queryByText(/^https?:\/\//)).toBeNull();
});

test("shows no fake commission, lead, or revenue data anywhere on the page", async () => {
  reset();
  cookieStore.__set("partner_session", VALID_SESSION_TOKEN);
  checkPartnerSessionMock.mockResolvedValue(true);

  const { container } = render(await PortalPage());

  expect(container.textContent).not.toMatch(/[€$£¥]/);
  expect(container.textContent).not.toMatch(/\d/);
});

test("navigation labels unavailable modules clearly, without linking to a non-existent section", async () => {
  reset();
  cookieStore.__set("partner_session", VALID_SESSION_TOKEN);
  checkPartnerSessionMock.mockResolvedValue(true);

  render(await PortalPage());

  const nav = screen.getByRole("navigation", { name: "Portalbereiche" });
  const badges = screen.getAllByText("Bald verfügbar");
  expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    expect(badge.closest("a")).toBeNull();
  }
  expect(nav.querySelector('a[href="#empfehlungslink"]')).not.toBeNull();
});
