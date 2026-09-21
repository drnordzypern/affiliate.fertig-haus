import { expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileNav } from "@/components/layout/MobileNav";

const links = [
  { label: "Partner werden", href: "/partner-werden" },
  { label: "So funktioniert es", href: "/so-funktioniert-es" },
];

test("mobile navigation panel is closed by default", () => {
  render(<MobileNav links={links} />);

  const toggle = screen.getByRole("button", { name: "Menü öffnen" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("navigation")).toBeNull();
});

test("mobile navigation panel opens and lists links on toggle", () => {
  render(<MobileNav links={links} />);

  const toggle = screen.getByRole("button", { name: "Menü öffnen" });
  fireEvent.click(toggle);

  expect(
    screen.getByRole("button", { name: "Menü schließen" }).getAttribute(
      "aria-expanded"
    )
  ).toBe("true");

  const panel = screen.getByRole("navigation", {
    name: "Hauptnavigation (mobil)",
  });

  // aria-controls must resolve to the panel that actually opened, not
  // just be present as an attribute.
  const controlsId = screen
    .getByRole("button", { name: "Menü schließen" })
    .getAttribute("aria-controls");
  expect(panel.id).toBe(controlsId);

  for (const link of links) {
    const anchor = screen.getByRole("link", { name: link.label });
    expect(panel.contains(anchor)).toBe(true);
  }
});

test("selecting a link in the open panel closes the menu again", () => {
  render(<MobileNav links={links} />);

  fireEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));
  fireEvent.click(screen.getByRole("link", { name: links[0].label }));

  expect(screen.queryByRole("navigation")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Menü öffnen" }).getAttribute(
      "aria-expanded"
    )
  ).toBe("false");
});
