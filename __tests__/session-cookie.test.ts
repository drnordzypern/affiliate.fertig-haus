// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import {
  clearPartnerSessionCookie,
  getPartnerSessionToken,
  PARTNER_SESSION_COOKIE_NAME,
  PARTNER_SESSION_MAX_AGE_SECONDS,
  setPartnerSessionCookie,
} from "@/lib/saleschain/session-cookie";

type SetCall = [string, string, Record<string, unknown>];

function createFakeCookieStore(initial: Record<string, string> = {}) {
  const setCalls: SetCall[] = [];
  const store = new Map(Object.entries(initial));
  return {
    setCalls,
    store: {
      get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
      set: (name: string, value: string, options: Record<string, unknown>) => {
        store.set(name, value);
        setCalls.push([name, value, options]);
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("the cookie name is a neutral, host-only name (no __Host- prefix)", () => {
  expect(PARTNER_SESSION_COOKIE_NAME).toBe("partner_session");
});

test("sets the cookie with the exact required attributes in Production", () => {
  vi.stubEnv("NODE_ENV", "production");
  const { setCalls, store } = createFakeCookieStore();

  setPartnerSessionCookie(store as never, "token-value");

  expect(setCalls).toHaveLength(1);
  const [name, value, options] = setCalls[0];
  expect(name).toBe(PARTNER_SESSION_COOKIE_NAME);
  expect(value).toBe("token-value");
  expect(options.httpOnly).toBe(true);
  expect(options.secure).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
  expect(options.maxAge).toBe(PARTNER_SESSION_MAX_AGE_SECONDS);
  expect(options.domain).toBeUndefined();
});

test("is not Secure outside Production, so local http development still works", () => {
  vi.stubEnv("NODE_ENV", "development");
  const { setCalls, store } = createFakeCookieStore();

  setPartnerSessionCookie(store as never, "token-value");

  expect(setCalls[0][2].secure).toBe(false);
});

test("the maximum lifetime is exactly eight hours", () => {
  expect(PARTNER_SESSION_MAX_AGE_SECONDS).toBe(8 * 60 * 60);
});

test("clearing sets maxAge 0 and an empty value, keeping the other attributes", () => {
  vi.stubEnv("NODE_ENV", "production");
  const { setCalls, store } = createFakeCookieStore({ [PARTNER_SESSION_COOKIE_NAME]: "old-token" });

  clearPartnerSessionCookie(store as never);

  const [name, value, options] = setCalls[0];
  expect(name).toBe(PARTNER_SESSION_COOKIE_NAME);
  expect(value).toBe("");
  expect(options.maxAge).toBe(0);
  expect(options.httpOnly).toBe(true);
  expect(options.secure).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
  expect(options.domain).toBeUndefined();
});

test("clearing an already-absent cookie is safe (repeated logout)", () => {
  const { setCalls, store } = createFakeCookieStore();

  expect(() => clearPartnerSessionCookie(store as never)).not.toThrow();
  expect(() => clearPartnerSessionCookie(store as never)).not.toThrow();
  expect(setCalls).toHaveLength(2);
});

test("getPartnerSessionToken reads only an exact token shape and fails closed otherwise", () => {
  const validToken = "A".repeat(43);
  const { store } = createFakeCookieStore({ [PARTNER_SESSION_COOKIE_NAME]: validToken });
  expect(getPartnerSessionToken(store as never)).toBe(validToken);

  const { store: malformedStore } = createFakeCookieStore({
    [PARTNER_SESSION_COOKIE_NAME]: "abc",
  });
  expect(getPartnerSessionToken(malformedStore as never)).toBeUndefined();

  const { store: emptyStore } = createFakeCookieStore();
  expect(getPartnerSessionToken(emptyStore as never)).toBeUndefined();
});
