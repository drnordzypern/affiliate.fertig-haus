import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";

test("links the Impressum and Datenschutz published on fertig-haus.net, under 'Rechtliches'", () => {
  render(<Footer />);

  expect(screen.getByText("Rechtliches")).toBeDefined();
  expect(screen.getByRole("link", { name: "Impressum" }).getAttribute("href")).toBe("https://fertig-haus.net/impressum");
  expect(screen.getByRole("link", { name: "Datenschutz" }).getAttribute("href")).toBe("https://fertig-haus.net/datenschutz");
  expect(screen.queryByText(/folgt/i)).toBeNull();
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
