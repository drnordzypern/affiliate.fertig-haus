import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import PortalPage from "@/app/portal/page";

test("portal preview shows the Vorschau label and no login form", () => {
  render(<PortalPage />);
  expect(screen.getByText("Vorschau")).toBeDefined();
  expect(screen.queryByRole("textbox", { name: /passwort|e-mail/i })).toBeNull();
});

test("portal preview shows no real-looking commission amounts", () => {
  render(<PortalPage />);

  const commissionHeading = screen.getByRole("heading", {
    level: 2,
    name: "Provisionen",
  });
  const commissionSection = commissionHeading.closest("section");
  expect(commissionSection).not.toBeNull();

  // Each of the three commission cards (Offen / Bestätigt / Ausgezahlt)
  // must render exactly the "—" placeholder as its value — not merely
  // "doesn't match a currency-shaped regex", which a formatted, single
  // digit, or fractional/future amount (e.g. "$50", "5", "0,5 %") could
  // slip past. This pins every value node to that one literal string.
  const valueNodes = commissionSection!.querySelectorAll("p.font-serif");
  expect(valueNodes.length).toBe(3);
  valueNodes.forEach((node) => {
    expect(node.textContent?.trim()).toBe("—");
  });

  // Belt-and-suspenders: no digit and no currency symbol anywhere in the
  // whole commission section, however it might be formatted.
  expect(commissionSection?.textContent).not.toMatch(/[0-9]/);
  expect(commissionSection?.textContent).not.toMatch(/[€$£¥]/);
});

test("portal preview referral link and QR code are inert placeholders", () => {
  const { container } = render(<PortalPage />);

  const linkInput = screen.getByLabelText("Ihr persönlicher Partnerlink");
  expect(linkInput).toHaveProperty("disabled", true);
  expect((linkInput as HTMLInputElement).value).not.toMatch(/^https?:\/\//);

  expect(container.querySelector("svg")).toBeNull();
  expect(screen.getByText("QR-Code folgt nach Freigabe")).toBeDefined();
});
