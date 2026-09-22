// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { cookies, cookieStore } = vi.hoisted(() => {
  const sets: [string, string, Record<string, unknown>][] = [];
  const backing = new Map<string, string>();
  const store = {
    sets,
    get: (name: string) => (backing.has(name) ? { name, value: backing.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      backing.set(name, value);
      sets.push([name, value, options]);
    },
  };
  return { cookies: vi.fn(async () => store), cookieStore: store };
});

vi.mock("next/headers", () => ({ cookies }));

const { POST } = await import("@/app/api/partner-sessions/logout/route");
const { PARTNER_SESSION_COOKIE_NAME } = await import("@/lib/saleschain/session-cookie");

const VALID_SESSION_TOKEN = "C".repeat(43);

function makeRequest(origin: string | null = "http://localhost"): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request("http://localhost/api/partner-sessions/logout", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://api.saleschain.example");
  cookieStore.sets.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("rejects a request with no Origin header and never touches the cookie", async () => {
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, VALID_SESSION_TOKEN, {});
  cookieStore.sets.length = 0;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(makeRequest(null));

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ status: "FORBIDDEN" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(cookieStore.sets).toHaveLength(0);
});

test("rejects a cross-origin request and never touches the cookie", async () => {
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, VALID_SESSION_TOKEN, {});
  cookieStore.sets.length = 0;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(makeRequest("https://evil.example"));

  expect(response.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(cookieStore.sets).toHaveLength(0);
});

test("forwards the session token as a Bearer header to SalesChain logout", async () => {
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, VALID_SESSION_TOKEN, {});
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ status: "LOGGED_OUT" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  vi.stubGlobal("fetch", fetchMock);
  cookieStore.sets.length = 0; // reset after seeding the initial cookie value

  const response = await POST(makeRequest());

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toMatch(/\/v1\/partner-sessions\/logout$/);
  expect(init.headers.authorization).toBe(`Bearer ${VALID_SESSION_TOKEN}`);

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ status: "LOGGED_OUT" });
  expect(JSON.stringify(body)).not.toMatch(VALID_SESSION_TOKEN);
});

test("always clears the cookie, even when the upstream logout call fails", async () => {
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, VALID_SESSION_TOKEN, {});
  cookieStore.sets.length = 0;
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream unavailable")));

  const response = await POST(makeRequest());

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ status: "LOGGED_OUT" });

  const clearCall = cookieStore.sets.find(([name]) => name === PARTNER_SESSION_COOKIE_NAME);
  expect(clearCall).toBeDefined();
  expect(clearCall![1]).toBe("");
  expect(clearCall![2].maxAge).toBe(0);
});

test("always clears the cookie even when SalesChain reports the session as already unavailable", async () => {
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, VALID_SESSION_TOKEN, {});
  cookieStore.sets.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "not found" }), { status: 404 }))
  );

  const response = await POST(makeRequest());

  expect(response.status).toBe(200);
  const clearCall = cookieStore.sets.find(([name]) => name === PARTNER_SESSION_COOKIE_NAME);
  expect(clearCall![1]).toBe("");
});

test("a malformed cookie fails closed, is never forwarded, and is still cleared", async () => {
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, "not-a-valid-token", {});
  cookieStore.sets.length = 0;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(makeRequest());

  expect(fetchMock).not.toHaveBeenCalled();
  expect(await response.json()).toEqual({ status: "LOGGED_OUT" });
  expect(cookieStore.sets[0][1]).toBe("");
});

test("clears the cookie when upstream returns malformed success JSON", async () => {
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, VALID_SESSION_TOKEN, {});
  cookieStore.sets.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "OTHER" }), { status: 200 }))
  );

  const response = await POST(makeRequest());

  expect(await response.json()).toEqual({ status: "LOGGED_OUT" });
  expect(cookieStore.sets[0][1]).toBe("");
});

test("clears the cookie when upstream logout times out", async () => {
  vi.useFakeTimers();
  cookieStore.set(PARTNER_SESSION_COOKIE_NAME, VALID_SESSION_TOKEN, {});
  cookieStore.sets.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        })
    )
  );

  const responsePromise = POST(makeRequest());
  await vi.advanceTimersByTimeAsync(10_000);
  const response = await responsePromise;

  expect(await response.json()).toEqual({ status: "LOGGED_OUT" });
  expect(cookieStore.sets[0][1]).toBe("");
});

test("repeated logout with no cookie present is safe and never calls SalesChain", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const firstResponse = await POST(makeRequest());
  const secondResponse = await POST(makeRequest());

  expect(fetchMock).not.toHaveBeenCalled();
  expect(firstResponse.status).toBe(200);
  expect(secondResponse.status).toBe(200);
  expect(await firstResponse.json()).toEqual({ status: "LOGGED_OUT" });
  expect(await secondResponse.json()).toEqual({ status: "LOGGED_OUT" });
});

test("sets Cache-Control: no-store", async () => {
  const response = await POST(makeRequest());
  expect(response.headers.get("cache-control")).toBe("no-store");
});
