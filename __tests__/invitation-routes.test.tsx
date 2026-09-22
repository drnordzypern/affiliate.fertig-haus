import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CanonicalInvitationPage from "@/app/einladung/page";
import CompatibilityInvitationPage from "@/app/partner/invitation/accept/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next/script", () => ({
  default: () => null,
}));

test("/einladung is the executable canonical invitation page", () => {
  window.history.pushState(null, "", "/einladung");
  render(<CanonicalInvitationPage />);
  expect(screen.getByRole("heading", { name: "Einladung annehmen" })).toBeDefined();
  expect(screen.getByText(/keine gültige Einladung/i)).toBeDefined();
});

test("the legacy route remains a compatibility alias of the canonical page", () => {
  expect(CompatibilityInvitationPage).toBe(CanonicalInvitationPage);
  window.history.pushState(null, "", "/partner/invitation/accept");
  render(<CompatibilityInvitationPage />);
  expect(screen.getByRole("heading", { name: "Einladung annehmen" })).toBeDefined();
  expect(screen.getByText(/keine gültige Einladung/i)).toBeDefined();
});
