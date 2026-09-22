// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  acceptInvitation,
  checkPartnerSession,
  logoutPartnerSession,
  redeemBootstrapToken,
  SalesChainError,
} from "@/lib/saleschain/client";

const VALID_TOKEN = "A".repeat(43);
const VALID_TOKEN_2 = "B".repeat(43);

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://api.saleschain.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("accepts a valid invitation and returns the bootstrap token", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(jsonResponse({ status: "ACCEPTED", loginBootstrapToken: VALID_TOKEN }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await acceptInvitation({
    invitationToken: VALID_TOKEN,
    turnstileToken: "cf-token",
  });

  expect(result).toEqual({ status: "ACCEPTED", loginBootstrapToken: VALID_TOKEN });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.saleschain.example/v1/public/partner-invitations/accept");
  expect(init.redirect).toBe("manual");
  expect(init.cache).toBe("no-store");
});

test("rejects an acceptance response with no required bootstrap token", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: "ACCEPTED" })));

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("rejects extra fields in an otherwise valid acceptance response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jsonResponse({
        status: "ACCEPTED",
        loginBootstrapToken: VALID_TOKEN,
        extra: true,
      })
    )
  );

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("rejects an unexpected acceptance response shape as a contract error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })));

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("rejects a malformed (non-43-char) bootstrap token as a contract error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse({ status: "ACCEPTED", loginBootstrapToken: "short" }))
  );

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("maps a non-ok upstream status to a generic 'rejected' error, once, without retrying", async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "gone" }, 404));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "rejected" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("maps a 5xx upstream status to a generic 'unavailable' error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 503)));

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "unavailable" });
});

test("maps a non-JSON upstream body to a contract error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("not json", { status: 200 }))
  );

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("rejects an oversized response using the Content-Length header, without buffering the body", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jsonResponse({ status: "ACCEPTED" }, 200, { "content-length": "999999" })
    )
  );

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("rejects an oversized streamed response with no Content-Length header", async () => {
  const bigChunk = new TextEncoder().encode(`{"status":"${"A".repeat(5_000)}"}`);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bigChunk);
      controller.close();
    },
  });
  const response = new Response(stream, { status: 200 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("treats a redirect response as a contract error instead of following it", async () => {
  const opaqueRedirect = {
    type: "opaqueredirect",
    status: 0,
    ok: false,
    headers: new Headers(),
    body: null,
    text: async () => "",
  } as unknown as Response;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(opaqueRedirect));

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("always requests redirect: 'manual' so the platform never auto-follows a redirect", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      jsonResponse({ status: "ACCEPTED", loginBootstrapToken: VALID_TOKEN })
    );
  vi.stubGlobal("fetch", fetchMock);

  await acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" });

  expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
});

test("maps an AbortError (timeout) to a generic 'timeout' error", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const abortError = new Error("The operation was aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      })
  );
  vi.stubGlobal("fetch", fetchMock);

  const promise = acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" });
  const assertion = expect(promise).rejects.toMatchObject({ kind: "timeout" });
  await vi.advanceTimersByTimeAsync(10_000);
  await assertion;
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("the timeout also covers a stalled upstream response body", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        init.signal?.addEventListener("abort", () => {
          const abortError = new Error("The operation was aborted");
          abortError.name = "AbortError";
          controller.error(abortError);
        });
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const promise = acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" });
  const assertion = expect(promise).rejects.toMatchObject({ kind: "timeout" });
  await vi.advanceTimersByTimeAsync(10_000);
  await assertion;
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("redeemBootstrapToken validates the exact response shape", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse({ partnerSessionToken: VALID_TOKEN_2 }))
  );

  const result = await redeemBootstrapToken({ loginBootstrapToken: VALID_TOKEN });
  expect(result).toEqual({ partnerSessionToken: VALID_TOKEN_2 });
});

test("redeemBootstrapToken rejects extra response fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jsonResponse({ partnerSessionToken: VALID_TOKEN_2, extra: true })
    )
  );

  await expect(redeemBootstrapToken({ loginBootstrapToken: VALID_TOKEN })).rejects.toMatchObject({
    kind: "contract",
  });
});

test("successful responses require the JSON media type", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: "ACCEPTED", loginBootstrapToken: VALID_TOKEN }),
        { status: 200, headers: { "content-type": "text/plain" } }
      )
    )
  );

  await expect(
    acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" })
  ).rejects.toMatchObject({ kind: "contract" });
});

test("redeemBootstrapToken rejects a missing/invalid session token as a contract error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

  await expect(redeemBootstrapToken({ loginBootstrapToken: VALID_TOKEN })).rejects.toMatchObject({
    kind: "contract",
  });
});

test("logoutPartnerSession forwards the token as a Bearer authorization header and sends no body", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(jsonResponse({ status: "LOGGED_OUT" }));
  vi.stubGlobal("fetch", fetchMock);

  await logoutPartnerSession({ partnerSessionToken: VALID_TOKEN });

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.saleschain.example/v1/partner-sessions/logout");
  expect(init.headers.authorization).toBe(`Bearer ${VALID_TOKEN}`);
  expect(init.body).toBeUndefined();
});

test("logoutPartnerSession rejects extra response fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse({ status: "LOGGED_OUT", extra: true }))
  );

  await expect(logoutPartnerSession({ partnerSessionToken: VALID_TOKEN })).rejects.toMatchObject({
    kind: "contract",
  });
});

test("checkPartnerSession sends a GET with the bearer token and no body", async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "AUTHENTICATED" }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await checkPartnerSession({ partnerSessionToken: VALID_TOKEN });

  expect(result).toBe(true);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.saleschain.example/v1/partner-sessions/me");
  expect(init.method).toBe("GET");
  expect(init.headers.authorization).toBe(`Bearer ${VALID_TOKEN}`);
  expect(init.body).toBeUndefined();
});

test("checkPartnerSession returns false for a 401", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "no" }, 401)));
  expect(await checkPartnerSession({ partnerSessionToken: VALID_TOKEN })).toBe(false);
});

test("checkPartnerSession returns false for a 404 (feature disabled)", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "no" }, 404)));
  expect(await checkPartnerSession({ partnerSessionToken: VALID_TOKEN })).toBe(false);
});

test("checkPartnerSession returns false for a 429", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "no" }, 429)));
  expect(await checkPartnerSession({ partnerSessionToken: VALID_TOKEN })).toBe(false);
});

test("checkPartnerSession returns false for a 5xx", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 503)));
  expect(await checkPartnerSession({ partnerSessionToken: VALID_TOKEN })).toBe(false);
});

test("checkPartnerSession returns false for a 200 with extra fields (fails closed on contract drift)", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse({ status: "AUTHENTICATED", partnerId: "x" }))
  );
  expect(await checkPartnerSession({ partnerSessionToken: VALID_TOKEN })).toBe(false);
});

test("checkPartnerSession returns false for a 200 with the wrong status literal", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: "OK" })));
  expect(await checkPartnerSession({ partnerSessionToken: VALID_TOKEN })).toBe(false);
});

test("checkPartnerSession returns false for a non-JSON 200 response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
  expect(await checkPartnerSession({ partnerSessionToken: VALID_TOKEN })).toBe(false);
});

test("checkPartnerSession returns false on a network failure, and never throws", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));
  await expect(checkPartnerSession({ partnerSessionToken: VALID_TOKEN })).resolves.toBe(false);
});

test("checkPartnerSession returns false on a timeout, and never throws", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const abortError = new Error("aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      })
  );
  vi.stubGlobal("fetch", fetchMock);

  const promise = checkPartnerSession({ partnerSessionToken: VALID_TOKEN });
  const assertion = expect(promise).resolves.toBe(false);
  await vi.advanceTimersByTimeAsync(10_000);
  await assertion;
});

test("checkPartnerSession never logs or throws the raw token on failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  await checkPartnerSession({ partnerSessionToken: VALID_TOKEN });

  expect(consoleSpy).not.toHaveBeenCalled();
  consoleSpy.mockRestore();
});

test("SalesChainError never carries the raw upstream response body", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<html>secret upstream detail</html>", { status: 500 }))
  );

  try {
    await acceptInvitation({ invitationToken: VALID_TOKEN, turnstileToken: "cf-token" });
    throw new Error("expected acceptInvitation to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(SalesChainError);
    expect((error as Error).message).not.toMatch(/secret upstream detail/);
  }
});
