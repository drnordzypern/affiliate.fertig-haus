import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/ui/Section";

export const metadata: Metadata = {
  title: "Datenschutzhinweis zur Partnerbewerbung",
  description: "Datenschutzhinweis zur Bewerbung als Fertig-Haus Partner.",
};

/**
 * Notice for the partner application form only. Company details are limited to what
 * fertig-haus.net publishes; the responsible company is deliberately NOT named until the
 * owner confirms it, and legal basis, retention, providers and a data protection officer
 * are not stated because nothing published covers them for this form.
 */
const paragraphs: ReadonlyArray<{ title: string; text: string }> = [
  { title: "Verantwortlich", text: "Fertig-Haus. Kontakt: kontakt@fertig-haus.net." },
  {
    title: "Zweck",
    text: "Wir prüfen Ihre Bewerbung, entscheiden über eine Zulassung als Partner und kontaktieren Sie dazu.",
  },
  {
    title: "Daten",
    text: "Pflichtangaben sind Name, E-Mail-Adresse, Telefonnummer und Partnertyp. Freiwillig sind Region, Unternehmen, Website oder Profil und Nachricht. Wir speichern außerdem Zeitpunkt und Version Ihrer Bestätigung. Zur Erkennung doppelter Bewerbungen speichern wir Hashwerte Ihrer E-Mail-Adresse und Telefonnummer. Zum Schutz vor Missbrauch speichern wir einen Hashwert Ihrer IP-Adresse; dafür besteht derzeit keine automatische Löschfrist.",
  },
  {
    title: "Ablauf",
    text: "Ihre Bewerbung wird im Kundenverwaltungssystem (CRM) gespeichert. Nur berechtigte Administratorinnen und Administratoren sehen sie. Menschen entscheiden; es gibt keine automatisierte Entscheidung. Aus dem Absenden folgt kein Anspruch auf Zulassung. Bei Zulassung erhalten Sie eine Einladungs-E-Mail und ein Konto im Partnerportal. Wenn Sie über eine Partnerin oder einen Partner kommen, speichern wir das; diese Person erfährt nichts über Ihre Bewerbung.",
  },
  {
    title: "Sicherheitsprüfung",
    text: "Wir nutzen Cloudflare Turnstile gegen automatisierte Eingaben. Ihr Browser kommuniziert dabei direkt mit Cloudflare.",
  },
  {
    title: "Ihre Rechte",
    text: "Sie können Auskunft, Berichtigung und Löschung verlangen: kontakt@fertig-haus.net. Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren.",
  },
];

export default function PartnerApplicationNoticePage() {
  return (
    <Section>
      <div className="flex max-w-3xl flex-col gap-8">
        <SectionHeading level="h1" title="Datenschutzhinweis zur Partnerbewerbung" />
        {paragraphs.map((item) => (
          <section key={item.title} className="flex flex-col gap-2">
            <h2 className="font-semibold text-lg text-charcoal-900">{item.title}</h2>
            <p className="text-sm leading-relaxed text-charcoal-700">{item.text}</p>
          </section>
        ))}
      </div>
    </Section>
  );
}
