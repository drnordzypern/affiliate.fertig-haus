import { expect, test, vi } from "vitest";

const { redirectMock, cookiesMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  cookiesMock: vi.fn(() => {
    throw new Error("cookies() must not be called by app/portal/page.tsx");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

const { default: PortalPage } = await import("@/app/portal/page");

/**
 * DNL1-63: cookie *presence/shape* is not valid server-side Partner
 * authorization — SalesChain has no non-destructive way to verify a
 * session token today (see docs/architecture.md). PortalPage must
 * therefore redirect unconditionally, for every request shape, without
 * ever reading or branching on the cookie. These tests are adversarial:
 * they assert the redirect holds even for a cookie value an attacker
 * could trivially forge (correct 43-char base64url shape, never issued by
 * a real invitation/bootstrap flow).
 */

test("redirects to /einladung with no cookie at all", () => {
  redirectMock.mockClear();
  expect(() => PortalPage()).toThrow("REDIRECT:/einladung");
  expect(redirectMock).toHaveBeenCalledWith("/einladung");
});

test("redirects to /einladung even for a well-formed, forged session cookie", () => {
  // Simulates an attacker who never completed the invitation/bootstrap
  // flow, sending an arbitrary but correctly-shaped cookie value directly.
  redirectMock.mockClear();
  document.cookie = "partner_session=" + "A".repeat(43) + "; path=/";

  expect(() => PortalPage()).toThrow("REDIRECT:/einladung");
  expect(redirectMock).toHaveBeenCalledWith("/einladung");

  document.cookie = "partner_session=; path=/; max-age=0";
});

test("redirects to /einladung for a malformed cookie value", () => {
  redirectMock.mockClear();
  document.cookie = "partner_session=not-a-valid-token; path=/";

  expect(() => PortalPage()).toThrow("REDIRECT:/einladung");

  document.cookie = "partner_session=; path=/; max-age=0";
});

test("never touches next/headers cookies() — the redirect does not depend on reading any cookie", () => {
  redirectMock.mockClear();
  cookiesMock.mockClear();

  expect(() => PortalPage()).toThrow("REDIRECT:/einladung");
  expect(cookiesMock).not.toHaveBeenCalled();
});
