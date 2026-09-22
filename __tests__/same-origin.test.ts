// @vitest-environment node
import { expect, test } from "vitest";
import { isSameOriginRequest } from "@/lib/security/same-origin";

function requestWithOrigin(url: string, origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request(url, { method: "POST", headers });
}

test("accepts a request whose Origin header matches the request URL's own origin", () => {
  const request = requestWithOrigin("https://affiliate.fertig-haus.net/api/x", "https://affiliate.fertig-haus.net");
  expect(isSameOriginRequest(request)).toBe(true);
});

test("accepts a same-origin request that also carries a path on the Origin header's URL form", () => {
  const request = requestWithOrigin("http://localhost/api/partner-sessions/logout", "http://localhost");
  expect(isSameOriginRequest(request)).toBe(true);
});

test("rejects a request with no Origin header", () => {
  const request = requestWithOrigin("https://affiliate.fertig-haus.net/api/x", null);
  expect(isSameOriginRequest(request)).toBe(false);
});

test("rejects a request whose Origin header is a different origin", () => {
  const request = requestWithOrigin("https://affiliate.fertig-haus.net/api/x", "https://evil.example");
  expect(isSameOriginRequest(request)).toBe(false);
});

test("rejects a request whose Origin header differs only by scheme or port", () => {
  expect(
    isSameOriginRequest(requestWithOrigin("https://affiliate.fertig-haus.net/api/x", "http://affiliate.fertig-haus.net"))
  ).toBe(false);
  expect(
    isSameOriginRequest(requestWithOrigin("https://affiliate.fertig-haus.net/api/x", "https://affiliate.fertig-haus.net:8443"))
  ).toBe(false);
});

test("rejects a malformed Origin header value", () => {
  const request = requestWithOrigin("https://affiliate.fertig-haus.net/api/x", "not-a-url");
  expect(isSameOriginRequest(request)).toBe(false);
});
