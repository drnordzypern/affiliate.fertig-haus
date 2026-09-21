import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/layout/Header";
import { primaryNavLinks } from "@/lib/navigation";

test("primary navigation renders all configured links with correct destinations", () => {
  render(<Header />);

  const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
  for (const link of primaryNavLinks) {
    const anchor = screen.getAllByRole("link", { name: link.label })[0];
    expect(anchor).toBeDefined();
    expect(nav.contains(anchor)).toBe(true);
    expect(anchor.getAttribute("href")).toBe(link.href);
  }
});

test("header exposes the wordmark as a link back to the homepage", () => {
  render(<Header />);
  const homeLink = screen.getByRole("link", {
    name: /zur startseite/i,
  });
  expect(homeLink.getAttribute("href")).toBe("/");
});
