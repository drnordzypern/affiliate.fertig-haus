import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

test("landing page renders its key sections", () => {
  render(<Home />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Empfehlen Sie Fertig Haus weiter/,
    })
  ).toBeDefined();

  expect(
    screen.getByRole("heading", { level: 2, name: "So funktioniert es" })
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { level: 2, name: "Was Partner:innen erwartet" })
  ).toBeDefined();
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "Für wen sich das Programm eignet",
    })
  ).toBeDefined();
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "Sorgfalt im Umgang mit Partnerdaten",
    })
  ).toBeDefined();
});

test("the Vorteile section exposes the #vorteile anchor used by primary navigation", () => {
  const { container } = render(<Home />);
  expect(container.querySelector("#vorteile")).not.toBeNull();
});
