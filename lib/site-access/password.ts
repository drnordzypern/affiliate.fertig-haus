/**
 * Constant-time password comparison for the pre-launch access boundary.
 * Both inputs are hashed to a fixed-length digest first — this avoids
 * leaking a timing signal from length differences before `timingSafeEqual`
 * ever runs, on top of the constant-time comparison it already provides
 * for equal-length buffers.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function verifyPassword(supplied: string, expected: string): boolean {
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}
