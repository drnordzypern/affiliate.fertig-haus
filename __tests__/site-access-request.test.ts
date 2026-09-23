// @vitest-environment node
import { expect, test } from "vitest";
import { clientRateLimitKey, readSubmittedPassword } from "@/lib/site-access/request";

function formRequest(body: string, contentType = "application/x-www-form-urlencoded") {
  return new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

test("reads a well-formed single-field submission", async () => {
  const password = await readSubmittedPassword(formRequest("password=hunter2"));
  expect(password).toBe("hunter2");
});

test("rejects a non-form content type", async () => {
  const password = await readSubmittedPassword(formRequest("password=hunter2", "application/json"));
  expect(password).toBeNull();
});

test("rejects an extra field", async () => {
  const password = await readSubmittedPassword(formRequest("password=hunter2&extra=1"));
  expect(password).toBeNull();
});

test("rejects a duplicated password field", async () => {
  const password = await readSubmittedPassword(formRequest("password=a&password=b"));
  expect(password).toBeNull();
});

test("rejects a missing password field", async () => {
  const password = await readSubmittedPassword(formRequest("other=1"));
  expect(password).toBeNull();
});

test("rejects an empty password", async () => {
  const password = await readSubmittedPassword(formRequest("password="));
  expect(password).toBeNull();
});

test("rejects an oversized password", async () => {
  const password = await readSubmittedPassword(formRequest(`password=${"a".repeat(600)}`));
  expect(password).toBeNull();
});

test("rejects a lying oversized Content-Length header without buffering the body", async () => {
  const request = new Request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": "999999",
    },
    body: "password=hunter2",
  });
  const password = await readSubmittedPassword(request);
  expect(password).toBeNull();
});

test("stops reading an oversized streamed body", async () => {
  let cancelled = false;
  const oversized = new Uint8Array(4_000);
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(oversized);
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  const password = await readSubmittedPassword(request);
  expect(password).toBeNull();
  expect(cancelled).toBe(true);
});

test("clientRateLimitKey uses the first entry of X-Forwarded-For", () => {
  const request = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" },
  });
  expect(clientRateLimitKey(request)).toBe("203.0.113.5");
});

test("clientRateLimitKey falls back to a constant when the header is absent", () => {
  const request = new Request("http://localhost/");
  expect(clientRateLimitKey(request)).toBe("unknown");
});
