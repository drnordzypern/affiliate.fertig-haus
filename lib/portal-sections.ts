export type PortalSection = {
  id: string;
  label: string;
};

export const portalSections: PortalSection[] = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "empfehlungen", label: "Empfehlungen" },
  { id: "qr-partnerlink", label: "QR-Code & Partnerlink" },
  { id: "provisionen", label: "Provisionen" },
  { id: "materialien", label: "Materialien" },
  { id: "akademie-events", label: "Akademie & Events" },
  { id: "profil-einstellungen", label: "Profil & Einstellungen" },
];
