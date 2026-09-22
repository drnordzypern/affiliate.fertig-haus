import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { InvitationAcceptShell } from "@/components/invitation/InvitationAcceptShell";

export const metadata: Metadata = {
  title: "Einladung annehmen",
  description:
    "Einladung zum Fertig Haus Partnerportal annehmen und Partnerzugang aktivieren.",
};

/**
 * Canonical public invitation route. The server receives neither the URL
 * fragment nor the invitation token. Fragment capture, immediate scrubbing,
 * Turnstile, and BFF submission are isolated in the Client Component.
 */
export default function InvitationAcceptPage() {
  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <InvitationAcceptShell />
    </Section>
  );
}
