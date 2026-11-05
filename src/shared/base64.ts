/** Portable Base64 decoding; does not depend on Node Buffer or a browser atob(). */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function decodeBase64(input: string): Uint8Array {
  const encoded = input.replace(/\s/g, "");
  if (encoded.length === 0 || encoded.length % 4 !== 0) {
    throw new Error("Invalid Base64 length");
  }
  const pad = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const decoded = new Uint8Array((encoded.length / 4) * 3 - pad);
  let pos = 0;
  for (let i = 0; i < encoded.length; i += 4) {
    const a = ALPHABET.indexOf(encoded.charAt(i));
    const b = ALPHABET.indexOf(encoded.charAt(i + 1));
    const c = encoded.charAt(i + 2) === "=" ? 0 : ALPHABET.indexOf(encoded.charAt(i + 2));
    const d = encoded.charAt(i + 3) === "=" ? 0 : ALPHABET.indexOf(encoded.charAt(i + 3));
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error("Invalid Base64 alphabet");
    const triplet = (a << 18) | (b << 12) | (c << 6) | d;
    decoded[pos++] = (triplet >>> 16) & 255;
    if (pos < decoded.length) decoded[pos++] = (triplet >>> 8) & 255;
    if (pos < decoded.length) decoded[pos++] = triplet & 255;
  }
  return decoded;
}
