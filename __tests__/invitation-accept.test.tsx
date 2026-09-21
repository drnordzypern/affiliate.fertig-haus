import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvitationAcceptShell } from "@/components/invitation/InvitationAcceptShell";

test("invitation shell renders without making any network call", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  render(<InvitationAcceptShell />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Einladung annehmen" })
  ).toBeDefined();
  expect(fetchSpy).not.toHaveBeenCalled();

  fetchSpy.mockRestore();
});

test("invitation shell states no real invitation is processed and exposes no token", () => {
  const { container } = render(<InvitationAcceptShell />);

  expect(screen.getByText(/keine echte Einladung/i)).toBeDefined();

  // Nothing in the rendered markup should look like a token/fragment value.
  expect(container.innerHTML).not.toMatch(/token=/i);
  expect(container.innerHTML).not.toMatch(/#[a-zA-Z0-9_-]{16,}/);
});

test('every illustrative state — including "Angenommen" — is individually labelled as a non-real example', () => {
  render(<InvitationAcceptShell />);

  // The risky one: a bare "Angenommen" (Accepted) badge, in isolation
  // (e.g. a screenshot, or a screen reader user who doesn't hear the
  // preceding paragraph), could be mistaken for a genuine accepted
  // invitation. Each state card must carry its own "not real" label
  // directly on the card, not only in a separate paragraph above the
  // grid.
  for (const stateLabel of ["Prüfung läuft", "Angenommen", "Nicht verfügbar"]) {
    const badge = screen.getByText(stateLabel);
    const card = badge.closest("div");
    expect(card?.textContent).toMatch(/Beispielzustand/i);
    expect(card?.textContent).toMatch(/nicht real/i);
  }
});
