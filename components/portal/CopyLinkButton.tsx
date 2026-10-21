"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** Copies one already-rendered link; shows "Kopiert" briefly. No storage, no network. */
export function CopyLinkButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="primary"
      className="px-4 py-2"
      aria-label={label}
      onClick={() =>
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "Kopiert" : "Kopieren"}
    </Button>
  );
}
