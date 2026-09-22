import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { InvitationAcceptShell } from "@/components/invitation/InvitationAcceptShell";

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

// Mocks the Turnstile *widget boundary* (`window.turnstile`) instead of
// letting `next/script` insert the real Cloudflare script tag, per
// AGENTS.md: "Tests must mock the widget boundary without making a real
// Cloudflare request."
vi.mock("next/script", () => ({
  default: () => null,
}));

type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
};

const VALID_TOKEN = "A".repeat(43);
const TURNSTILE_TOKEN = "cf-turnstile-response-token";

let renderMock: ReturnType<
  typeof vi.fn<(container: HTMLElement, options: TurnstileRenderOptions) => string>
>;

function mockJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function triggerTurnstileCallback() {
  const lastCall = renderMock.mock.calls[renderMock.mock.calls.length - 1];
  lastCall[1].callback(TURNSTILE_TOKEN);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  renderMock = vi.fn(() => "widget-id");
  window.turnstile = { render: renderMock, remove: vi.fn() };
  window.history.pushState(null, "", "/einladung");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete window.turnstile;
});

test("extracts the invitation token from the URL fragment and scrubs it immediately", () => {
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);

  render(<InvitationAcceptShell />);

  expect(window.location.hash).toBe("");
  expect(window.location.pathname).toBe("/einladung");
  expect(document.documentElement.innerHTML).not.toContain(VALID_TOKEN);
});

test("scrubs the fragment before the Turnstile widget can initialize", async () => {
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);
  const replaceStateSpy = vi.spyOn(window.history, "replaceState");

  render(<InvitationAcceptShell />);

  await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
  expect(replaceStateSpy.mock.invocationCallOrder[0]).toBeLessThan(
    renderMock.mock.invocationCallOrder[0]
  );
  expect(window.location.hash).toBe("");
});

test("shows a missing-token state when there is no fragment at all", () => {
  render(<InvitationAcceptShell />);

  expect(screen.getByText(/keine gültige Einladung/i)).toBeDefined();
});

test("shows a missing-token state for a malformed fragment", () => {
  window.history.pushState(null, "", "/einladung#token=too-short");

  render(<InvitationAcceptShell />);

  expect(screen.getByText(/keine gültige Einladung/i)).toBeDefined();
});

test("fails closed for repeated fragment parameters", () => {
  window.history.pushState(
    null,
    "",
    `/einladung#token=${VALID_TOKEN}&token=${VALID_TOKEN}`
  );

  render(<InvitationAcceptShell />);

  expect(screen.getByText(/keine gültige Einladung/i)).toBeDefined();
  expect(renderMock).not.toHaveBeenCalled();
  expect(window.location.hash).toBe("");
});

test("shows a turnstile-unavailable state when no site key is configured", () => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);

  render(<InvitationAcceptShell />);

  expect(screen.getByText(/Sicherheitsprüfung ist derzeit nicht verfügbar/i)).toBeDefined();
});

test("does not call fetch merely from rendering — only after Turnstile completes", () => {
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  render(<InvitationAcceptShell />);

  expect(fetchSpy).not.toHaveBeenCalled();
});

test("submits only invitationToken and turnstileToken to the BFF, and never renders a bootstrap/session token", async () => {
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(mockJsonResponse({ status: "AUTHENTICATED" }, 200));

  const { container } = render(<InvitationAcceptShell />);

  await waitFor(() => expect(renderMock).toHaveBeenCalled());
  triggerTurnstileCallback();

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/partner-invitations/accept");
  const body = JSON.parse((init as RequestInit).body as string);
  expect(Object.keys(body).sort()).toEqual(["invitationToken", "turnstileToken"]);
  expect(body.invitationToken).toBe(VALID_TOKEN);
  expect(body.turnstileToken).toBe(TURNSTILE_TOKEN);

  await waitFor(() => screen.getByText(/Einladung wurde angenommen/i));

  expect(container.innerHTML).not.toMatch(/loginBootstrapToken/i);
  expect(container.innerHTML).not.toMatch(/partnerSessionToken/i);
  expect(container.innerHTML).not.toMatch(/#token=/i);
});

test("ignores repeated Turnstile callbacks so acceptance and redemption cannot be replayed", async () => {
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(mockJsonResponse({ status: "AUTHENTICATED" }, 200));

  render(<InvitationAcceptShell />);
  await waitFor(() => expect(renderMock).toHaveBeenCalled());

  triggerTurnstileCallback();
  triggerTurnstileCallback();

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
});

test("rejects a successful BFF response carrying extra fields", async () => {
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    mockJsonResponse({ status: "AUTHENTICATED", extra: true }, 200)
  );

  render(<InvitationAcceptShell />);
  await waitFor(() => expect(renderMock).toHaveBeenCalled());
  triggerTurnstileCallback();

  await waitFor(() => screen.getByText(/konnte derzeit nicht verarbeitet werden/i));
});

test("shows a generic failure state on a non-ok BFF response, without technical detail", async () => {
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    mockJsonResponse({ status: "UNAVAILABLE" }, 404)
  );

  render(<InvitationAcceptShell />);

  await waitFor(() => expect(renderMock).toHaveBeenCalled());
  triggerTurnstileCallback();

  await waitFor(() => screen.getByText(/konnte derzeit nicht verarbeitet werden/i));

  expect(screen.queryByText(/404|500|502|503|Error|Exception/i)).toBeNull();
});

test("shows a generic failure state when the fetch call itself throws", async () => {
  window.history.pushState(null, "", `/einladung#token=${VALID_TOKEN}`);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

  render(<InvitationAcceptShell />);

  await waitFor(() => expect(renderMock).toHaveBeenCalled());
  triggerTurnstileCallback();

  await waitFor(() => screen.getByText(/konnte derzeit nicht verarbeitet werden/i));
});
