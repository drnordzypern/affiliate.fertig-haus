import { expect, test, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import Home from "@/app/page";
import SoFunktioniertEsPage from "@/app/so-funktioniert-es/page";
import PartnerWerdenPage from "@/app/partner-werden/page";
import PortalPage from "@/app/portal/page";
import InvitationAcceptPage from "@/app/partner/invitation/accept/page";

afterEach(() => {
  cleanup();
});

test("no page reads from or writes to localStorage or sessionStorage", () => {
  const localGet = vi.spyOn(Storage.prototype, "getItem");
  const localSet = vi.spyOn(Storage.prototype, "setItem");

  render(<Home />);
  render(<SoFunktioniertEsPage />);
  render(<PartnerWerdenPage />);
  render(<PortalPage />);
  render(<InvitationAcceptPage />);

  expect(localGet).not.toHaveBeenCalled();
  expect(localSet).not.toHaveBeenCalled();

  localGet.mockRestore();
  localSet.mockRestore();
});
