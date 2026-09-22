export type PortalSection = {
  id: string;
  label: string;
  /** true once the module has real, source-supported functionality. */
  available: boolean;
};

export const portalSections: PortalSection[] = [
  { id: "uebersicht", label: "Übersicht", available: true },
  { id: "empfehlungslink", label: "Empfehlungslink", available: true },
  { id: "provisionen", label: "Provisionen", available: false },
  { id: "kontakte", label: "Kontakte", available: false },
  { id: "schulungen", label: "Schulungen", available: false },
  { id: "profil", label: "Profil", available: false },
];
