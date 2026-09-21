import { expect, test, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PartnerWerdenPage from "@/app/partner-werden/page";

afterEach(() => {
  cleanup();
});

test("application preview form has no operational submit path", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  const { container } = render(<PartnerWerdenPage />);

  const submitButton = screen.getByRole("button", {
    name: "Bewerbung absenden",
  });
  expect(submitButton.hasAttribute("disabled")).toBe(true);

  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  expect(form?.getAttribute("action")).toBeNull();
  expect(form?.onsubmit).toBeNull();

  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test("the preview explains why submission is disabled, accessibly linked to the button", () => {
  render(<PartnerWerdenPage />);

  const submitButton = screen.getByRole("button", {
    name: "Bewerbung absenden",
  });
  const describedById = submitButton.getAttribute("aria-describedby");
  expect(describedById).toBeTruthy();
  expect(document.getElementById(describedById as string)?.textContent).toMatch(
    /deaktiviert/
  );
});

test("no real personal data is pre-filled in the preview form", () => {
  const { container } = render(<PartnerWerdenPage />);

  const textInputs = container.querySelectorAll(
    'input:not([type="checkbox"]), textarea'
  );
  textInputs.forEach((input) => {
    expect((input as HTMLInputElement | HTMLTextAreaElement).value).toBe("");
  });

  const checkbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]'
  );
  expect(checkbox?.checked).toBe(false);
});

test("every PII-collecting field is genuinely disabled, not just the submit button", () => {
  // Every form control must sit inside a <fieldset disabled>. That
  // attribute is what a real browser uses to make the field unfocusable
  // and uneditable — confirmed by hand in a live browser (typing into
  // "Vorname" produces no text). We assert on the fieldset's `disabled`
  // attribute directly rather than each input's `.disabled` property:
  // happy-dom (this test's DOM environment) does not simulate the HTML
  // fieldset-disabled cascade to descendant controls, so `.disabled`
  // reads back `false` here even though real browsers correctly disable
  // them — asserting on the attribute avoids a false negative from that
  // test-environment gap while still catching a real regression (e.g. a
  // field moved outside its fieldset, or the `disabled` attribute
  // dropped from markup).
  render(<PartnerWerdenPage />);

  for (const label of [
    "Vorname",
    "Nachname",
    "E-Mail-Adresse",
    "Telefon (optional)",
    "Region / Bundesland",
  ]) {
    // Required fields' labels carry a trailing " *" indicator, so match
    // on the label prefix rather than the exact string.
    const field = screen.getByLabelText(
      new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
    expect(field.closest("fieldset")?.hasAttribute("disabled")).toBe(true);
  }

  const textarea = screen.getByLabelText("Relevante Erfahrung / Netzwerk");
  expect(textarea.closest("fieldset")?.hasAttribute("disabled")).toBe(true);

  for (const label of ["Partnertyp", "Bevorzugter Kooperationskontext"]) {
    const select = screen.getByLabelText(new RegExp(`^${label}`));
    expect(select.closest("fieldset")?.hasAttribute("disabled")).toBe(true);
  }

  const checkbox = screen.getByRole("checkbox");
  expect(checkbox.closest("fieldset")?.hasAttribute("disabled")).toBe(true);
});
