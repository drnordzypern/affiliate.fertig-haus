import { expect, test, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import Home from "@/app/page";
import SoFunktioniertEsPage from "@/app/so-funktioniert-es/page";
import PartnerWerdenPage from "@/app/partner-werden/page";
import PortalPage from "@/app/portal/page";
import InvitationAcceptPage from "@/app/einladung/page";

const { cookies } = vi.hoisted(() => {
  const store = { get: () => ({ name: "partner_session", value: "A".repeat(43) }) };
  return { cookies: vi.fn(async () => store) };
});

vi.mock("next/headers", () => ({ cookies }));

vi.mock("@/lib/saleschain/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/saleschain/client")>();
  return { ...actual, checkPartnerSession: vi.fn().mockResolvedValue(true) };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  redirect: vi.fn(),
}));

vi.mock("next/script", () => ({
  default: () => null,
}));

afterEach(() => {
  cleanup();
});

test("no page reads from or writes to localStorage or sessionStorage", async () => {
  const localGet = vi.spyOn(Storage.prototype, "getItem");
  const localSet = vi.spyOn(Storage.prototype, "setItem");

  render(<Home />);
  render(<SoFunktioniertEsPage />);
  render(<PartnerWerdenPage />);
  render(await PortalPage());
  render(<InvitationAcceptPage />);

  expect(localGet).not.toHaveBeenCalled();
  expect(localSet).not.toHaveBeenCalled();

  localGet.mockRestore();
  localSet.mockRestore();
});
