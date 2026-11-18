import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import PartnerApplicationNoticePage from "@/app/datenschutz-partnerbewerbung/page";

describe("partner application notice page", () => {
  test("shows the short notice with the published contact and no company, legal basis, retention, provider or DPO claims", () => {
    const { container } = render(<PartnerApplicationNoticePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Datenschutzhinweis zur Partnerbewerbung" })).toBeTruthy();
    expect(container.textContent).toContain("kontakt@fertig-haus.net");
    expect(container.textContent).toContain("derzeit keine automatische Löschfrist");
    for (const unsupported of [/GmbH|Ltd|AG/, /Königsallee|Manchester/, /Art\. 6|Rechtsgrundlage/, /Datenschutzbeauftragte/, /sechs Monate|6 Monate|24 Stunden/i, /fertig-haus\.net\/datenschutz/]) {
      expect(container.textContent ?? "").not.toMatch(unsupported);
    }
  });
});
