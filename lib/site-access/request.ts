/**
 * Strict, bounded parsing of the access-password form submission. Accepts
 * only `application/x-www-form-urlencoded` bodies (the native default for
 * an unscripted HTML `<form>`) containing exactly one field, `password`,
 * within a conservative size bound — never buffers or trusts anything
 * larger, and rejects extra fields rather than ignoring them.
 */
const MAX_BODY_BYTES = 2_048;
const MAX_PASSWORD_LENGTH = 512;

export async function readSubmittedPassword(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.split(";", 1)[0].trim().toLowerCase() !==
    "application/x-www-form-urlencoded"
  ) {
    return null;
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const normalized = contentLength.trim();
    if (!/^\d+$/.test(normalized) || Number(normalized) > MAX_BODY_BYTES) {
      return null;
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const bodyText = new TextDecoder().decode(combined);

  const params = new URLSearchParams(bodyText);
  const keys = [...params.keys()];
  if (keys.length !== 1 || keys[0] !== "password") return null;

  const password = params.get("password");
  if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return null;
  }

  return password;
}

export function clientRateLimitKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstIp = forwardedFor?.split(",")[0]?.trim();
  return firstIp && firstIp.length > 0 ? firstIp : "unknown";
}
