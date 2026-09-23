import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";

test("unapproved legal pages are omitted entirely — no dead link, no 'to follow' label", () => {
  render(<Footer />);

  // No approved Impressum/Datenschutz URL exists yet (lib/legal-config.ts).
  // Rather than a dead link or a visible "(folgt)" placeholder, the footer
  // simply omits the entry until real, approved content exists.
  expect(screen.queryByText("Impressum")).toBeNull();
  expect(screen.queryByText("Datenschutz")).toBeNull();
  expect(screen.queryByText(/folgt/i)).toBeNull();
  expect(screen.queryByText("Rechtliches")).toBeNull();
});

test("footer references fertig-haus.net without inventing legal entity details", () => {
  render(<Footer />);
  expect(screen.getByText("fertig-haus.net")).toBeDefined();
  expect(screen.queryByText(/GmbH|AG|UG \(haftungsbeschränkt\)/)).toBeNull();
});

test("renders a visible German 'Zugang sperren' action that clears only the site-access cookie", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ status: "LOCKED" }), { status: 200 }));
  const originalLocation = window.location;
  // jsdom/happy-dom throws on a real navigation; stub it so the click handler
  // can complete without actually leaving the test page.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, href: originalLocation.href },
  });

  render(<Footer />);
  const button = screen.getByRole("button", { name: /zugang sperren/i });
  fireEvent.click(button);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/site-access/lock");
  expect(init).toEqual({ method: "POST" });
  expect(JSON.stringify(init)).not.toMatch(/password|partner|session/i);

  fetchMock.mockRestore();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});
