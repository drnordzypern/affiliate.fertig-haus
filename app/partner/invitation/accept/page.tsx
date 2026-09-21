import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { InvitationAcceptShell } from "@/components/invitation/InvitationAcceptShell";

export const metadata: Metadata = {
  title: "Einladung annehmen",
  description:
    "Vorschau der künftigen Einladungsannahme für das Fertig Haus Partnerportal. Noch nicht funktionsfähig.",
};

/**
 * This route intentionally does not declare a `searchParams` prop and does
 * not read `window.location` anywhere in its tree — see
 * InvitationAcceptShell for the integration boundary this page respects.
 */
export default function InvitationAcceptPage() {
  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <InvitationAcceptShell />
    </Section>
  );
}
