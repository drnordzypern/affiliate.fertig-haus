/**
 * The neutral, minimal access-password surface for the pre-launch
 * boundary. Deliberately raw HTML strings, not a Next.js page/component:
 * this must never share a render path with the real app (no header,
 * footer, navigation, or app-specific layout can leak through it), and it
 * must render correctly with no JavaScript. It carries no reference to
 * Fertig Haus, the Partner programme, or any other application-specific
 * detail — only the fact that a password is required.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BASE_STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #faf8f4;
    color: #211f1a;
    display: flex;
    min-height: 100vh;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 24px;
  }
  main { max-width: 360px; width: 100%; }
  h1 { font-size: 1.15rem; font-weight: 600; margin: 0 0 1rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; }
  label { font-size: 0.875rem; }
  input[type="password"] {
    padding: 0.625rem 0.75rem;
    border: 1px solid #c9c2b6;
    border-radius: 4px;
    font-size: 1rem;
    width: 100%;
  }
  button {
    padding: 0.625rem 1rem;
    border: none;
    border-radius: 4px;
    background: #3f5b41;
    color: #faf8f4;
    font-size: 0.9375rem;
    cursor: pointer;
  }
  .message { font-size: 0.875rem; margin: 0; }
  .message.error { color: #8a3324; }
`;

export type AccessPageMessage = { text: string; tone: "error" | "info" };

export function renderAccessPageHtml(message?: AccessPageMessage): string {
  const messageHtml = message
    ? `<p class="message ${message.tone === "error" ? "error" : ""}" role="alert">${escapeHtml(message.text)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zugang erforderlich</title>
<style>${BASE_STYLES}</style>
</head>
<body>
<main>
  <h1>Zugang erforderlich</h1>
  <form method="POST">
    <label for="af-password">Passwort</label>
    <input
      id="af-password"
      name="password"
      type="password"
      required
      maxlength="512"
      autocomplete="off"
      autofocus
    >
    ${messageHtml}
    <button type="submit">Bestätigen</button>
  </form>
</main>
</body>
</html>`;
}

export const ACCESS_DENIED_MESSAGE: AccessPageMessage = {
  text: "Das eingegebene Passwort ist nicht korrekt.",
  tone: "error",
};

export const RATE_LIMITED_MESSAGE: AccessPageMessage = {
  text: "Zu viele Versuche. Bitte versuchen Sie es später erneut.",
  tone: "error",
};

export const INVALID_REQUEST_MESSAGE: AccessPageMessage = {
  text: "Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
  tone: "error",
};

export const UNAVAILABLE_MESSAGE: AccessPageMessage = {
  text: "Der Zugang ist derzeit nicht verfügbar.",
  tone: "info",
};

/**
 * Returned only after a correct password. Reloads the browser's current
 * address-bar URL unchanged (never a URL this module constructs) so an
 * invitation link's fragment — never seen by the server — is preserved
 * and can be read client-side exactly as it would on a first visit.
 */
export function renderAccessGrantedHtml(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Zugang bestätigt</title>
</head>
<body>
<script>location.reload();</script>
<noscript>Zugang bestätigt. Bitte laden Sie die Seite manuell neu.</noscript>
</body>
</html>`;
}
