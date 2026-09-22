// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { cookies, cookieStore } = vi.hoisted(() => {
  const sets: [string, string, Record<string, unknown>][] = [];
  const backing = new Map<string, string>();
  const store = {
    sets,
    get: (name: string) => (backing.has(name) ? { name, value: backing.get(name)! } : undefined),
    set: vi.fn((name: string, value: string, options: Record<string, unknown>) => {
      backing.set(name, value);
      sets.push([name, value, options]);
    }),
  };
  return { cookies: vi.fn(async () => store), cookieStore: store };
});

vi.mock("next/headers", () => ({ cookies }));

const { POST } = await import("@/app/api/partner-invitations/accept/route");
const { PARTNER_SESSION_COOKIE_NAME } = await import("@/lib/saleschain/session-cookie");

const VALID_INVITATION_TOKEN = "A".repeat(43);
const VALID_BOOTSTRAP_TOKEN = "B".repeat(43);
const VALID_SESSION_TOKEN = "C".repeat(43);

function jsonUpstreamResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeRequest(
  rawBody: string,
  options: {
    contentType?: string;
    contentLength?: string;
    signal?: AbortSignal;
    origin?: string | null;
  } = {}
) {
  const headers = new Headers({ "content-type": options.contentType ?? "application/json" });
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  const origin = options.origin === undefined ? "http://localhost" : options.origin;
  if (origin !== null) {
    headers.set("origin", origin);
  }
  return new Request("http://localhost/api/partner-invitations/accept", {
    method: "POST",
    headers,
    body: rawBody,
    signal: options.signal,
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://api.saleschain.example");
  cookieStore.sets.length = 0;
  cookieStore.set.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("rejects a request with no Origin header, without calling SalesChain", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const request = makeRequest(
    JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" }),
    { origin: null }
  );
  const response = await POST(request);

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ status: "FORBIDDEN" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(cookieStore.sets).toHaveLength(0);
});

test("rejects a cross-origin request, without calling SalesChain", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const request = makeRequest(
    JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" }),
    { origin: "https://evil.example" }
  );
  const response = await POST(request);

  expect(response.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects a non-JSON content type with a generic 400, without calling SalesChain", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const request = makeRequest("plain text", { contentType: "text/plain" });
  const response = await POST(request);

  expect(response.status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects a lookalike JSON media type", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const request = makeRequest("{}", { contentType: "application/json-patch" });
  const response = await POST(request);

  expect(response.status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects an oversized request via a lying Content-Length header", async () => {
  const request = makeRequest(
    JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" }),
    { contentLength: "999999" }
  );
  const response = await POST(request);
  expect(response.status).toBe(400);
});

test("rejects an extra field in the request body", async () => {
  const request = makeRequest(
    JSON.stringify({
      invitationToken: VALID_INVITATION_TOKEN,
      turnstileToken: "cf-token",
      extra: "field",
    })
  );
  const response = await POST(request);
  expect(response.status).toBe(400);
});

test("rejects an invitationToken that is not exactly 43 base64url characters", async () => {
  const request = makeRequest(
    JSON.stringify({ invitationToken: "too-short", turnstileToken: "cf-token" })
  );
  const response = await POST(request);
  expect(response.status).toBe(400);
});

test("rejects malformed JSON", async () => {
  const request = makeRequest("{not json");
  const response = await POST(request);
  expect(response.status).toBe(400);
});

test("stops reading an oversized streamed body before JSON allocation", async () => {
  let cancelled = false;
  const oversized = new Uint8Array(4_097);
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(oversized);
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/api/partner-invitations/accept", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  const response = await POST(request);

  expect(response.status).toBe(400);
  expect(cancelled).toBe(true);
});

test("calls acceptance then bootstrap redemption, in that order, and sets the cookie", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    jsonUpstreamResponse({ status: "ACCEPTED", loginBootstrapToken: VALID_BOOTSTRAP_TOKEN })
  ).mockResolvedValueOnce(
    jsonUpstreamResponse({ partnerSessionToken: VALID_SESSION_TOKEN })
  );
  vi.stubGlobal("fetch", fetchMock);

  const request = makeRequest(
    JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" })
  );
  const response = await POST(request);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/public\/partner-invitations\/accept$/);
  expect(fetchMock.mock.calls[1][0]).toMatch(/\/v1\/public\/partner-sessions\/bootstrap$/);

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");

  const body = await response.json();
  expect(body).toEqual({ status: "AUTHENTICATED" });
  expect(JSON.stringify(body)).not.toMatch(VALID_SESSION_TOKEN);
  expect(JSON.stringify(body)).not.toMatch(VALID_BOOTSTRAP_TOKEN);

  expect(cookieStore.sets).toHaveLength(1);
  const [name, value, options] = cookieStore.sets[0];
  expect(name).toBe(PARTNER_SESSION_COOKIE_NAME);
  expect(value).toBe(VALID_SESSION_TOKEN);
  expect(options.httpOnly).toBe(true);
});

test("fails closed with a generic 502 and sets no cookie when acceptance omits the required bootstrap token", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonUpstreamResponse({ status: "ACCEPTED" }));
  vi.stubGlobal("fetch", fetchMock);

  const request = makeRequest(
    JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" })
  );
  const response = await POST(request);

  expect(response.status).toBe(502);
  expect(fetchMock).toHaveBeenCalledTimes(1); // bootstrap must never be attempted
  expect(cookieStore.sets).toHaveLength(0);

  const body = await response.json();
  expect(JSON.stringify(body)).not.toMatch(/bootstrap|session/i);
});

test("compensates exactly once and clears locally when cookie creation fails after redemption", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      jsonUpstreamResponse({ status: "ACCEPTED", loginBootstrapToken: VALID_BOOTSTRAP_TOKEN })
    )
    .mockResolvedValueOnce(jsonUpstreamResponse({ partnerSessionToken: VALID_SESSION_TOKEN }))
    .mockResolvedValueOnce(jsonUpstreamResponse({ status: "LOGGED_OUT" }));
  vi.stubGlobal("fetch", fetchMock);
  cookieStore.set.mockImplementationOnce(() => {
    throw new Error("cookie serialization failed");
  });

  const response = await POST(
    makeRequest(
      JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" })
    )
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[2][0]).toMatch(/\/v1\/partner-sessions\/logout$/);
  expect(fetchMock.mock.calls[2][1].headers.authorization).toBe(
    `Bearer ${VALID_SESSION_TOKEN}`
  );
  expect(cookieStore.set).toHaveBeenCalledTimes(2);
  expect(cookieStore.set.mock.calls[1][1]).toBe("");
});

test("compensates when the client request is already aborted after redemption", async () => {
  const abortController = new AbortController();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      jsonUpstreamResponse({ status: "ACCEPTED", loginBootstrapToken: VALID_BOOTSTRAP_TOKEN })
    )
    .mockImplementationOnce(async () => {
      abortController.abort();
      return jsonUpstreamResponse({ partnerSessionToken: VALID_SESSION_TOKEN });
    })
    .mockResolvedValueOnce(jsonUpstreamResponse({ status: "LOGGED_OUT" }));
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(
    makeRequest(
      JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" }),
      { signal: abortController.signal }
    )
  );

  expect(response.status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(cookieStore.set).not.toHaveBeenCalled();
});

test.each([400, 404, 429])(
  "maps upstream %i to a generic 404, revealing nothing else",
  async (upstreamStatus) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonUpstreamResponse({ reason: "sensitive" }, upstreamStatus))
    );

    const request = makeRequest(
      JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" })
    );
    const response = await POST(request);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ status: "UNAVAILABLE" });
    expect(JSON.stringify(body)).not.toMatch(/sensitive/i);
  }
);

test("maps an upstream 5xx to a generic 503", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonUpstreamResponse({}, 500)));

  const request = makeRequest(
    JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" })
  );
  const response = await POST(request);

  expect(response.status).toBe(503);
});

test("maps an upstream network failure to a generic 503", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));

  const response = await POST(
    makeRequest(
      JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" })
    )
  );

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
});

test("maps an unexpected upstream contract violation to a generic 502", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonUpstreamResponse({ nonsense: true })));

  const request = makeRequest(
    JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" })
  );
  const response = await POST(request);

  expect(response.status).toBe(502);
});

test("maps a misconfigured SALESCHAIN_API_BASE_URL to a generic 503, not a stack trace", async () => {
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const request = makeRequest(
    JSON.stringify({ invitationToken: VALID_INVITATION_TOKEN, turnstileToken: "cf-token" })
  );
  const response = await POST(request);

  expect(response.status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("every response sets Cache-Control: no-store", async () => {
  const request = makeRequest("{not json");
  const response = await POST(request);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
