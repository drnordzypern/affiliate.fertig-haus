// Compatibility alias. Keeping this as a direct re-export avoids a second
// implementation of the security-sensitive fragment handling. New links use
// the canonical `/einladung#token=...` URL.
export { metadata, default } from "@/app/einladung/page";
