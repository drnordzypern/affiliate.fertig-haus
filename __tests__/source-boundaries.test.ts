import { expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * docs/architecture.md and .env.example are tested elsewhere for what
 * they *say*. This file proves the actual application source *behaves*
 * that way, so the guarantee survives future edits even if nobody keeps
 * the prose in sync with the code.
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
const sourceFiles = [
  ...collectFiles(resolve(root, "app")),
  ...collectFiles(resolve(root, "components")),
  ...collectFiles(resolve(root, "lib")),
];
const codeByFile = new Map(
  sourceFiles.map((f) => [f, stripComments(readFileSync(f, "utf-8"))])
);

test("at least the expected app/component/lib source files are being scanned", () => {
  // Guards against the walk silently finding nothing and every check
  // below passing for the wrong reason.
  expect(sourceFiles.length).toBeGreaterThan(15);
});

test("no source file reads a SalesChain environment variable", () => {
  const offenders = sourceFiles.filter((f) =>
    /SALESCHAIN_(API_BASE_URL|BFF_CREDENTIAL)/.test(codeByFile.get(f)!)
  );
  expect(offenders).toEqual([]);
});

test("no source file makes a network call", () => {
  const offenders = sourceFiles.filter((f) =>
    /\bfetch\s*\(|axios\.|XMLHttpRequest/.test(codeByFile.get(f)!)
  );
  expect(offenders).toEqual([]);
});

test("no source file references browser storage or cookies", () => {
  const offenders = sourceFiles.filter((f) =>
    /localStorage|sessionStorage|document\.cookie|indexedDB/.test(
      codeByFile.get(f)!
    )
  );
  expect(offenders).toEqual([]);
});

test("no source file reads the URL query string, fragment, or window.location", () => {
  const offenders = sourceFiles.filter((f) => {
    const code = codeByFile.get(f)!;
    return (
      /\buseSearchParams\s*\(/.test(code) ||
      /window\.location/.test(code) ||
      /location\.hash/.test(code)
    );
  });
  expect(offenders).toEqual([]);
});
