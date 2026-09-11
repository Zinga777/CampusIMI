/** Verifies the first bytes of an upload actually match its claimed image type,
 * rather than trusting the client-supplied Content-Type header at face value —
 * a mismatched/spoofed Content-Type on stored, user-served content is a classic
 * stored-content-spoofing vector. */
export function matchesImageSignature(bytes: ArrayBuffer, contentType: string): boolean {
  const b = new Uint8Array(bytes.slice(0, 12));

  switch (contentType) {
    case "image/png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        b.length >= 8 &&
        b[0] === 0x89 &&
        b[1] === 0x50 &&
        b[2] === 0x4e &&
        b[3] === 0x47 &&
        b[4] === 0x0d &&
        b[5] === 0x0a &&
        b[6] === 0x1a &&
        b[7] === 0x0a
      );
    case "image/jpeg":
      // FF D8 FF
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/webp":
      // "RIFF" .... "WEBP"
      return (
        b.length >= 12 &&
        b[0] === 0x52 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x46 &&
        b[8] === 0x57 &&
        b[9] === 0x45 &&
        b[10] === 0x42 &&
        b[11] === 0x50
      );
    default:
      return false;
  }
}
