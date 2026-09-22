import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { cookies, cookieStore } = vi.hoisted(() => {
  const backing = new Map<string, string>();
  const store = {
    get: (name: string) => (backing.has(name) ? { name, value: backing.get(name)! } : undefined),
    __setForTest: (name: string, value: string) => backing.set(name, value),
    __clearForTest: () => backing.clear(),
  };
  return { cookies: vi.fn(async () => store), cookieStore: store };
});

const { routerReplace, redirectMock } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  redirect: redirectMock,
}));

const { default: PortalPage } = await import("@/app/portal/page");

const VALID_SESSION_TOKEN = "A".repeat(43);

function setSessionCookie(value: string) {
  cookieStore.__setForTest("partner_session", value);
}

function clearCookies() {
  cookieStore.__clearForTest();
  redirectMock.mockClear();
}

test("redirects to /einladung and renders no dashboard content when no session cookie is present", async () => {
  clearCookies();

  await expect(PortalPage()).rejects.toThrow("REDIRECT:/einladung");
  expect(redirectMock).toHaveBeenCalledWith("/einladung");
});

test("redirects to /einladung when the session cookie is present but malformed", async () => {
  clearCookies();
  setSessionCookie("not-a-valid-token");

  await expect(PortalPage()).rejects.toThrow("REDIRECT:/einladung");
});

test("renders the protected dashboard when a well-formed session cookie is present", async () => {
  clearCookies();
  setSessionCookie(VALID_SESSION_TOKEN);

  const element = await PortalPage();
  render(element);

  expect(screen.getByRole("heading", { level: 1, name: "Partnerportal" })).toBeDefined();
  expect(redirectMock).not.toHaveBeenCalled();
});

test("renders a real, visible logout control that makes no network call on render", async () => {
  clearCookies();
  setSessionCookie(VALID_SESSION_TOKEN);
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  render(await PortalPage());

  expect(screen.getByRole("button", { name: /abmelden/i })).toBeDefined();
  expect(fetchSpy).not.toHaveBeenCalled();

  fetchSpy.mockRestore();
});

test("logout sends no bearer token or request body from the browser", async () => {
  clearCookies();
  setSessionCookie(VALID_SESSION_TOKEN);
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
  clearCookies();
  setSessionCookie(VALID_SESSION_TOKEN);

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
  clearCookies();
  setSessionCookie(VALID_SESSION_TOKEN);

  const { container } = render(await PortalPage());

  expect(container.textContent).not.toMatch(/[€$£¥]/);
  expect(container.textContent).not.toMatch(/\d/);
});

test("navigation labels unavailable modules clearly, without linking to a non-existent section", async () => {
  clearCookies();
  setSessionCookie(VALID_SESSION_TOKEN);

  render(await PortalPage());

  const nav = screen.getByRole("navigation", { name: "Portalbereiche" });
  const badges = screen.getAllByText("Bald verfügbar");
  expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    expect(badge.closest("a")).toBeNull();
  }
  expect(nav.querySelector('a[href="#empfehlungslink"]')).not.toBeNull();
});
