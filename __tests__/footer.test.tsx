import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";

test("legal placeholders are clearly marked as non-final and are not real links", () => {
  render(<Footer />);

  for (const label of ["Impressum", "Datenschutz"]) {
    const entry = screen.getByText(label).closest("li");
    expect(entry).not.toBeNull();
    expect(entry?.textContent).toMatch(/folgt/i);
    expect(entry?.querySelector("a")).toBeNull();
  }
});

test("footer references fertig-haus.net without inventing legal entity details", () => {
  render(<Footer />);
  expect(screen.getByText("fertig-haus.net")).toBeDefined();
  expect(screen.queryByText(/GmbH|AG|UG \(haftungsbeschränkt\)/)).toBeNull();
});
