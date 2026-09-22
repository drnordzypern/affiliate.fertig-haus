import { expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * docs/architecture.md and .env.example are tested elsewhere for what
 * they *say*. This file proves the actual application source *behaves*
 * that way, so the guarantee survives future edits even if nobody keeps
 * the prose in sync with the code.
 *
 * Now that the SalesChain integration is implemented, the boundary is no
 * longer "nothing touches SalesChain" — it is "only these specific
 * server-only files touch SalesChain, and nothing browser-facing does."
 */

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strips comments so prose *about* a boundary doesn't trip the check for it. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const root = process.cwd();
const allSourceFiles = [
  ...collectFiles(resolve(root, "app")),
  ...collectFiles(resolve(root, "components")),
  ...collectFiles(resolve(root, "lib")),
];
const codeByFile = new Map(
  allSourceFiles.map((f) => [f, stripComments(readFileSync(f, "utf-8"))])
);
const relPath = (f: string) => relative(root, f).replace(/\\/g, "/");

/** The only files allowed to call SalesChain or read its server-only env var. */
const SERVER_ONLY_SALESCHAIN_FILES = new Set([
  "lib/saleschain/config.ts",
  "lib/saleschain/client.ts",
  "app/api/partner-invitations/accept/route.ts",
  "app/api/partner-sessions/logout/route.ts",
]);

/** The only files allowed to call `fetch` — always same-origin, never SalesChain. */
const BROWSER_FETCH_FILES = new Set([
  "components/invitation/InvitationAcceptShell.tsx",
  "components/portal/LogoutButton.tsx",
  "components/site-access/LockAccessButton.tsx",
]);

/** The only file allowed to read `window.location` (fragment token extraction / navigation). */
const WINDOW_LOCATION_FILES = new Set([
  "components/invitation/InvitationAcceptShell.tsx",
  "components/portal/LogoutButton.tsx",
  "components/site-access/LockAccessButton.tsx",
]);

const browserFacingFiles = allSourceFiles.filter(
  (f) => !SERVER_ONLY_SALESCHAIN_FILES.has(relPath(f))
);

test("at least the expected app/component/lib source files are being scanned", () => {
  // Guards against the walk silently finding nothing and every check
  // below passing for the wrong reason.
  expect(allSourceFiles.length).toBeGreaterThan(15);
});

test("only the designated server-only modules reference the SalesChain base URL", () => {
  const offenders = browserFacingFiles.filter((f) =>
    /SALESCHAIN_API_BASE_URL/.test(codeByFile.get(f)!)
  );
  expect(offenders.map(relPath)).toEqual([]);
});

test("no source file reads a NEXT_PUBLIC_ variable to reconstruct the SalesChain base URL", () => {
  const offenders = allSourceFiles.filter((f) =>
    /NEXT_PUBLIC_SALESCHAIN/.test(codeByFile.get(f)!)
  );
  expect(offenders).toEqual([]);
});

test("only the designated client components call fetch, and only the SalesChain client module calls it server-side", () => {
  const offenders = allSourceFiles.filter((f) => {
    const path = relPath(f);
    const usesFetch = /\bfetch\s*\(|axios\.|XMLHttpRequest/.test(codeByFile.get(f)!);
    if (!usesFetch) return false;
    return !SERVER_ONLY_SALESCHAIN_FILES.has(path) && !BROWSER_FETCH_FILES.has(path);
  });
  expect(offenders.map(relPath)).toEqual([]);
});

test("the two browser-facing fetch calls only ever target this app's own /api/ routes", () => {
  for (const path of BROWSER_FETCH_FILES) {
    const code = codeByFile.get(resolve(root, path));
    expect(code, `expected ${path} to exist`).toBeTruthy();
    const fetchCalls = code!.match(/fetch\(\s*(["'`])([^"'`]*)\1/g) ?? [];
    expect(fetchCalls.length).toBeGreaterThan(0);
    for (const call of fetchCalls) {
      expect(call).toMatch(/fetch\(\s*["'`]\/api\//);
    }
  }
});

test("no source file references browser storage or cookies directly (Route Handlers use next/headers cookies())", () => {
  const offenders = allSourceFiles.filter((f) =>
    /localStorage|sessionStorage|document\.cookie|indexedDB/.test(codeByFile.get(f)!)
  );
  expect(offenders).toEqual([]);
});

test("no source file reads the URL query string via useSearchParams", () => {
  const offenders = allSourceFiles.filter((f) =>
    /\buseSearchParams\s*\(/.test(codeByFile.get(f)!)
  );
  expect(offenders).toEqual([]);
});

test("only the designated components read or write window.location", () => {
  const offenders = allSourceFiles.filter((f) => {
    const path = relPath(f);
    const usesWindowLocation = /window\.location|location\.hash/.test(codeByFile.get(f)!);
    return usesWindowLocation && !WINDOW_LOCATION_FILES.has(path);
  });
  expect(offenders.map(relPath)).toEqual([]);
});

test("no server-only SalesChain module is a Client Component", () => {
  for (const path of SERVER_ONLY_SALESCHAIN_FILES) {
    const code = readFileSync(resolve(root, path), "utf-8");
    expect(code.trimStart().startsWith('"use client"')).toBe(false);
  }
});

test("the SalesChain client module never calls console.* (comments aside)", () => {
  const clientModule = codeByFile.get(resolve(root, "lib/saleschain/client.ts"));
  expect(clientModule).toBeTruthy();
  expect(clientModule).not.toMatch(/console\./);
});
